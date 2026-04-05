import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { createQuizFromBankSchema } from "@shared/routes";
import {
  getRandomQuestions,
  getCategoryQuestionCount,
  type Category,
  type Difficulty,
} from "./question-bank";
import { z } from "zod";
import { insertScoreSchema } from "@shared/schema";
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

const JWT_SECRET = process.env.JWT_SECRET || "quiznova_dev_secret_please_set_in_production";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "quiznova_refresh_dev_secret_please_set_in_production";
const JWT_EXPIRY = "1d";
const REFRESH_EXPIRY = "30d";

const COOKIE_NAME = "quiznova_refresh";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path: "/",
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: 0 });
}

// ── Google OAuth ────────────────────────────────────────────────────────────
const GOOGLE_CONFIGURED =
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function getGoogleCallbackUrl(): string {
  if (process.env.APP_URL) return `${process.env.APP_URL}/api/auth/google/callback`;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;
  return "http://localhost:5000/api/auth/google/callback";
}

if (GOOGLE_CONFIGURED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: getGoogleCallbackUrl(),
        scope: ["profile", "email"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(new Error("Google did not provide an email address"), undefined);

          let user = await storage.findUserByGoogleId(profile.id);
          if (!user) {
            user = await storage.findUserByEmail(email);
            if (user) {
              // Existing email/password account — link it to Google
              await storage.linkGoogleId(user.id, profile.id);
              user = { ...user, googleId: profile.id, provider: "google" };
            } else {
              // Brand new user via Google
              user = await storage.createGoogleUser({
                name: profile.displayName || email.split("@")[0],
                email,
                googleId: profile.id,
              });
              console.log(`[auth] New Google user: ${email} (id: ${user.id})`);
            }
          }
          return done(null, user);
        } catch (err) {
          return done(err as Error, undefined);
        }
      }
    )
  );
  // No serialisation needed — we use JWT, not sessions
  passport.serializeUser((user: any, done) => done(null, user));
  passport.deserializeUser((user: any, done) => done(null, user));
}

const AI_DAILY_LIMIT = 20;
const AI_EXPLAIN_COIN_COST = 40;

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

function verifyToken(req: any, res: Response, next: NextFunction) {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required. Please log in." });
  }
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: number; email: string };
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token. Please log in again." });
  }
}

function optionalAuth(req: any, res: Response, next: NextFunction) {
  const auth = req.headers.authorization as string | undefined;
  if (auth?.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: number; email: string };
      req.userId = decoded.userId;
      req.userEmail = decoded.email;
    } catch { /* ignore invalid token */ }
  }
  next();
}

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

type AiQuestion = {
  question: string;
  options: string[];
  answer: string;
  category: string;
  difficulty: string;
  explanation?: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const aiQuestionCache = new Map<string, { questions: AiQuestion[]; timestamp: number }>();

/**
 * Fix lone backslashes that are invalid JSON escape sequences.
 * Gemini often outputs LaTeX like \int, \frac, \infty inside JSON strings.
 * Valid JSON escapes after \: " \ / b f n r t u
 * Everything else must be doubled: \ → \\
 */
function fixJsonEscapes(str: string): string {
  return str.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

/**
 * Extract individual top-level JSON objects { } from a string, even if the
 * wrapping array is malformed or truncated. This is the fallback strategy
 * when JSON.parse fails on the full array (e.g. due to truncation).
 */
function extractObjectsFromBrokenJson(str: string): AiQuestion[] {
  const results: AiQuestion[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const block = str.slice(start, i + 1);
        try {
          const q = JSON.parse(fixJsonEscapes(block));
          if (
            typeof q.question === "string" && q.question.trim() &&
            Array.isArray(q.options) && q.options.length === 4 &&
            q.options.every((o: any) => typeof o === "string") &&
            typeof q.answer === "string" && q.options.includes(q.answer)
          ) {
            results.push({ question: q.question, options: q.options, answer: q.answer, category: q.category ?? "", difficulty: q.difficulty ?? "" });
          }
        } catch {
          // skip malformed block
        }
        start = -1;
      }
    }
  }
  return results;
}

/**
 * Pad a validated questions array to exactly 10 using the local question bank.
 */
function padToTen(questions: AiQuestion[], category: string, difficulty: string): AiQuestion[] {
  if (questions.length >= 10) return questions.slice(0, 10);
  const need = 10 - questions.length;
  const bank = getRandomQuestions(category as Category, difficulty as Difficulty, need);
  for (const bq of bank) {
    questions.push({ question: bq.text, options: bq.options, answer: bq.options[bq.correctAnswerIndex], category, difficulty });
  }
  return questions;
}

const VALID_CATEGORIES: Category[] = ["math", "tech", "general"];
const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function subjectToCategory(subject: string): Category {
  const s = subject.toLowerCase();
  if (s.includes("math")) return "math";
  if (s.includes("computer") || s.includes("programming")) return "tech";
  return "general";
}

function inferCategoryFromTitle(title: string): Category | null {
  const t = title.toLowerCase();
  if (t.includes("math") || t.includes("calculus") || t.includes("algebra") || t.includes("arithmetic")) return "math";
  if (t.includes("tech") || t.includes("programming") || t.includes("code") || t.includes("computer") || t.includes("software") || t.includes("web") || t.includes("javascript") || t.includes("python")) return "tech";
  if (t.includes("general") || t.includes("gk") || t.includes("knowledge") || t.includes("trivia") || t.includes("science") || t.includes("history") || t.includes("geo")) return "general";
  return null;
}

async function repairQuizCategories() {
  const allQuizzes = await storage.getQuizzes();
  let repaired = 0;
  for (const quiz of allQuizzes) {
    const cat = quiz.category as string;
    const diff = quiz.difficulty as string;
    let needsUpdate = false;
    let newCategory = cat;
    let newDifficulty = diff;

    if (!VALID_CATEGORIES.includes(cat as Category)) {
      const inferred = inferCategoryFromTitle(quiz.title) ?? "general";
      console.log(`[repair] Quiz ID ${quiz.id} "${quiz.title}": invalid category "${cat}" → "${inferred}"`);
      newCategory = inferred;
      needsUpdate = true;
    } else if (cat === "general") {
      const inferred = inferCategoryFromTitle(quiz.title);
      if (inferred && inferred !== "general") {
        console.log(`[repair] Quiz ID ${quiz.id} "${quiz.title}": category was default "general" but title suggests "${inferred}" → fixing`);
        newCategory = inferred;
        needsUpdate = true;
      }
    }

    if (!VALID_DIFFICULTIES.includes(diff as Difficulty)) {
      console.log(`[repair] Quiz ID ${quiz.id}: invalid difficulty "${diff}" → "medium"`);
      newDifficulty = "medium";
      needsUpdate = true;
    }

    if (needsUpdate) {
      await storage.updateQuizCategory(quiz.id, newCategory, newDifficulty);
      repaired++;
    }
  }
  if (repaired > 0) {
    console.log(`[repair] Fixed ${repaired} quiz(zes) with wrong categories.`);
  } else {
    console.log(`[repair] All ${allQuizzes.length} quiz(zes) have correct categories.`);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Passport (stateless — JWT only, no sessions needed)
  app.use(passport.initialize());

  // Run repair at startup — fixes any quizzes with wrong or default categories
  repairQuizCategories().catch((err) =>
    console.error("[repair] Category repair failed:", err)
  );

  // GET /api/auth/google/status — lets frontend know whether Google login is available
  app.get("/api/auth/google/status", (_req, res) => {
    res.json({ enabled: GOOGLE_CONFIGURED, callbackUrl: GOOGLE_CONFIGURED ? getGoogleCallbackUrl() : null });
  });

  // GET /api/auth/google — start the Google OAuth flow
  app.get("/api/auth/google", (req, res, next) => {
    if (!GOOGLE_CONFIGURED) {
      return res.status(503).json({ message: "Google login is not configured." });
    }
    passport.authenticate("google", { scope: ["profile", "email"], session: false })(req, res, next);
  });

  // GET /api/auth/google/callback — Google redirects here after user approves
  app.get(
    "/api/auth/google/callback",
    (req, res, next) => {
      passport.authenticate("google", { session: false, failureRedirect: "/auth?error=google_failed" })(req, res, next);
    },
    async (req: any, res) => {
      try {
        const user = req.user;
        const accessToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
        const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
        await storage.saveRefreshToken(user.id, refreshToken);
        setRefreshCookie(res, refreshToken);
        console.log(`[auth] Google login: ${user.email}`);
        // Redirect to home with the access token so the frontend can store it
        res.redirect(`/?token=${encodeURIComponent(accessToken)}`);
      } catch (err) {
        console.error("[auth] Google callback error:", err);
        res.redirect("/auth?error=google_failed");
      }
    }
  );

  // POST /api/auth/signup
  app.post("/api/auth/signup", async (req, res) => {
    const schema = z.object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      email: z.string().email("Invalid email address"),
      password: z
        .string()
        .min(8, "Password must be at least 8 characters long")
        .regex(/[A-Z]/, "Password must include uppercase, lowercase, number, and special character")
        .regex(/[a-z]/, "Password must include uppercase, lowercase, number, and special character")
        .regex(/[0-9]/, "Password must include uppercase, lowercase, number, and special character")
        .regex(/[^A-Za-z0-9]/, "Password must include uppercase, lowercase, number, and special character"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

    const { name, email, password } = parsed.data;
    const existing = await storage.findUserByEmail(email);
    if (existing) return res.status(409).json({ message: "An account with this email already exists." });

    const hashed = await bcrypt.hash(password, 12);
    const user = await storage.createUser({ name, email, password: hashed, coins: 0, totalScore: 0, aiUsageCount: 0 });
    const accessToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
    await storage.saveRefreshToken(user.id, refreshToken);
    setRefreshCookie(res, refreshToken);
    const { password: _, ...safeUser } = user;
    console.log(`[auth] New user: ${user.email} (id: ${user.id})`);
    return res.status(201).json({ accessToken, user: safeUser });
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    const schema = z.object({
      email: z.string().email("Invalid email address"),
      password: z.string().min(1, "Password is required"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

    const { email, password } = parsed.data;
    const user = await storage.findUserByEmail(email);
    if (!user) return res.status(401).json({ message: "No account found with this email." });

    if (!user.password) {
      return res.status(401).json({ message: "This account uses Google Sign-In. Please click \"Continue with Google\" to log in." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Incorrect password." });

    const accessToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
    await storage.saveRefreshToken(user.id, refreshToken);
    setRefreshCookie(res, refreshToken);
    const { password: _, ...safeUser } = user;
    console.log(`[auth] Login: ${user.email}`);
    return res.json({ accessToken, user: safeUser });
  });

  // GET /api/auth/me — return current user from JWT
  app.get("/api/auth/me", verifyToken, async (req: any, res) => {
    const user = await storage.getUserById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  });

  // POST /api/auth/refresh — issue a new access token using the refresh cookie
  app.post("/api/auth/refresh", async (req: any, res) => {
    const refreshToken = req.cookies?.[COOKIE_NAME];
    if (!refreshToken) {
      return res.status(401).json({ message: "No refresh token. Please log in." });
    }

    let payload: { userId: number };
    try {
      payload = jwt.verify(refreshToken, REFRESH_SECRET) as { userId: number };
    } catch {
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Refresh token expired. Please log in again." });
    }

    const user = await storage.findUserByRefreshToken(refreshToken);
    if (!user || user.id !== payload.userId) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Invalid refresh token. Please log in again." });
    }

    // Rotate the refresh token for extra security
    const newRefreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
    await storage.saveRefreshToken(user.id, newRefreshToken);
    setRefreshCookie(res, newRefreshToken);

    const accessToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    console.log(`[auth] Token refreshed: ${user.email}`);
    return res.json({ accessToken });
  });

  // POST /api/auth/logout — invalidate the refresh token server-side
  app.post("/api/auth/logout", async (req: any, res) => {
    const refreshToken = req.cookies?.[COOKIE_NAME];
    if (refreshToken) {
      try {
        const payload = jwt.verify(refreshToken, REFRESH_SECRET) as { userId: number };
        await storage.clearRefreshToken(payload.userId);
      } catch { /* token already invalid — just clear the cookie */ }
    }
    clearRefreshCookie(res);
    console.log(`[auth] Logout`);
    return res.json({ message: "Logged out successfully." });
  });

  // GET /api/ai-usage — return current user's effective AI usage for today
  app.get("/api/ai-usage", verifyToken, async (req: any, res) => {
    const user = await storage.getUserById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const today = todayStr();
    const used = user.lastAiUsageDate === today ? user.aiUsageCount : 0;
    return res.json({
      used,
      limit: AI_DAILY_LIMIT,
      remaining: Math.max(0, AI_DAILY_LIMIT - used),
      coins: user.coins,
      explainCost: AI_EXPLAIN_COIN_COST,
    });
  });

  // GET /api/quizzes
  app.get("/api/quizzes", async (req, res) => {
    const allQuizzes = await storage.getQuizzes();
    res.json(allQuizzes);
  });

  // POST /api/quizzes/generate
  app.post("/api/quizzes/generate", async (req, res) => {
    try {
      const input = createQuizFromBankSchema.parse(req.body);

      if (!VALID_CATEGORIES.includes(input.category as Category)) {
        return res.status(400).json({ message: `Invalid category: "${input.category}". Must be one of: ${VALID_CATEGORIES.join(", ")}` });
      }
      if (!VALID_DIFFICULTIES.includes(input.difficulty as Difficulty)) {
        return res.status(400).json({ message: `Invalid difficulty: "${input.difficulty}". Must be one of: ${VALID_DIFFICULTIES.join(", ")}` });
      }

      const categoryLabels: Record<Category, string> = { math: "Math", tech: "Technology", general: "General Knowledge" };
      const difficultyLabels: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

      const quiz = await storage.createQuiz({
        title: input.title,
        description: `A ${difficultyLabels[input.difficulty as Difficulty]} level ${categoryLabels[input.category as Category]} quiz with 10 questions.`,
        category: input.category,
        difficulty: input.difficulty,
      });

      console.log(`[generate] Created quiz ID ${quiz.id} "${quiz.title}" — category: ${input.category}, difficulty: ${input.difficulty}`);

      const bankQuestions = getRandomQuestions(input.category as Category, input.difficulty as Difficulty, 10);
      console.log(`[generate] Selected ${bankQuestions.length} questions from ${input.category}/${input.difficulty} bank`);

      for (const q of bankQuestions) {
        await storage.createQuestion({
          quizId: quiz.id,
          text: q.text,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex,
        });
      }

      const fullQuiz = await storage.getQuiz(quiz.id);
      res.status(201).json(fullQuiz);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  // GET /api/quizzes/:id/play — strictly category-filtered fresh questions every time
  app.get("/api/quizzes/:id/play", async (req, res) => {
    const quizId = Number(req.params.id);
    const quiz = await storage.getQuiz(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    let category = (quiz.category || "general") as Category;
    let difficulty = (quiz.difficulty || "medium") as Difficulty;

    // Strict validation — if category is invalid, try to infer from title
    if (!VALID_CATEGORIES.includes(category)) {
      const inferred = inferCategoryFromTitle(quiz.title);
      console.warn(`[play] Quiz ID ${quizId}: invalid category "${category}" — inferred "${inferred ?? "general"}" from title "${quiz.title}"`);
      category = inferred ?? "general";
    }

    if (!VALID_DIFFICULTIES.includes(difficulty)) {
      console.warn(`[play] Quiz ID ${quizId}: invalid difficulty "${difficulty}" — defaulting to "medium"`);
      difficulty = "medium";
    }

    const bankCount = getCategoryQuestionCount(category, difficulty);
    console.log(`[play] Quiz ID ${quizId} "${quiz.title}" — serving category: "${category}", difficulty: "${difficulty}", bank size: ${bankCount}`);

    if (bankCount === 0) {
      return res.status(500).json({ message: `No questions found for category "${category}" / difficulty "${difficulty}"` });
    }

    const freshQuestions = getRandomQuestions(category, difficulty, 10);

    console.log(`[play] Selected ${freshQuestions.length} questions. First: "${freshQuestions[0]?.text?.slice(0, 50)}"`);

    const sessionQuestions = freshQuestions.map((q, idx) => ({
      id: idx + 1,
      quizId: quiz.id,
      text: q.text,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
    }));

    res.json({
      ...quiz,
      category,
      difficulty,
      questions: sessionQuestions,
      totalInBank: bankCount,
    });
  });

  // GET /api/quizzes/:id
  app.get("/api/quizzes/:id", async (req, res) => {
    const quiz = await storage.getQuiz(Number(req.params.id));
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    res.json(quiz);
  });

  // POST /api/scores
  app.post("/api/scores", optionalAuth, async (req: any, res) => {
    try {
      const input = insertScoreSchema.parse({
        ...req.body,
        quizId: Number(req.body.quizId),
        userId: req.userId ?? null,
        score: Number(req.body.score),
        total: Number(req.body.total),
        coinsEarned: Number(req.body.coinsEarned ?? 0),
        playerName: req.body.playerName || "Anonymous",
      });
      const score = await storage.submitScore(input);
      // Update user's cumulative coins and score if authenticated
      if (req.userId && input.coinsEarned > 0) {
        await storage.addUserCoins(req.userId, input.coinsEarned, input.score).catch(() => {});
      }
      res.status(201).json(score);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  // GET /api/quizzes/:quizId/scores
  app.get("/api/quizzes/:quizId/scores", async (req, res) => {
    const quizScores = await storage.getScoresForQuiz(Number(req.params.quizId));
    res.json(quizScores);
  });

  // GET /api/leaderboard
  app.get("/api/leaderboard", async (req, res) => {
    const topScores = await storage.getTopScores(10);
    res.json(topScores);
  });

  // POST /api/ai-questions — generate questions with Gemini AI, with retries and fallback
  app.post("/api/ai-questions", aiRateLimiter, optionalAuth, async (req: any, res) => {
    const schema = z.object({
      category: z.enum(["math", "tech", "general"]),
      difficulty: z.enum(["easy", "medium", "hard"]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const { category, difficulty } = parsed.data;
    const cacheKey = `${category}:${difficulty}`;

    const cached = aiQuestionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[ai-questions] Cache hit for ${cacheKey}`);
      return res.json({ questions: cached.questions, source: "ai" });
    }

    // Daily AI limit check for logged-in users (only when not cached)
    if (req.userId) {
      const user = await storage.getUserById(req.userId);
      if (user) {
        const today = todayStr();
        const usedToday = user.lastAiUsageDate === today ? user.aiUsageCount : 0;
        if (usedToday >= AI_DAILY_LIMIT) {
          return res.status(429).json({
            message: `Daily AI limit reached (${AI_DAILY_LIMIT}/day). Try again tomorrow!`,
            limitReached: true,
            used: usedToday,
            limit: AI_DAILY_LIMIT,
          });
        }
      }
    }

    const categoryLabels: Record<string, string> = {
      math: "Mathematics",
      tech: "Technology and Programming",
      general: "General Knowledge",
    };

    // IMPORTANT: Explicitly forbid LaTeX and backslashes — these are the #1 cause of
    // JSON parse failures because \int, \frac, \infty etc. are invalid JSON escape sequences.
    const prompt =
      `Return ONLY a valid JSON array. No explanation, no markdown, no code fences, no LaTeX, no backslashes.\n` +
      `Generate 10 multiple-choice questions about ${categoryLabels[category]} at ${difficulty} level.\n` +
      `STRICT RULES:\n` +
      `1. Output ONLY the JSON array, starting with [ and ending with ]\n` +
      `2. Exactly 10 questions, exactly 4 options each\n` +
      `3. "answer" must be an exact copy of one of the 4 options\n` +
      `4. "explanation" must be 2-3 lines: first in simple English, then in simple Hindi\n` +
      `5. Use PLAIN TEXT ONLY — NO LaTeX, NO backslashes, NO dollar signs for math\n` +
      `   Write math plainly: use "x^2" not "$x^2$", "sqrt(x)" not "\\sqrt{x}", "pi" not "\\pi", "integral" not "\\int"\n` +
      `6. Questions must match the ${categoryLabels[category]} category and ${difficulty} difficulty\n` +
      `JSON format: [{"question":"...","options":["A","B","C","D"],"answer":"A","explanation":"English explanation. Hindi mein: ...","category":"${category}","difficulty":"${difficulty}"}]`;

    const MAX_ATTEMPTS = 3;

    async function tryGenerateAiQuestions(): Promise<AiQuestion[] | null> {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          console.log(`[ai-questions] Attempt ${attempt}/${MAX_ATTEMPTS}: ${difficulty} ${category}`);

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
              maxOutputTokens: 8192,
              // Disable thinking — reasoning tokens consume the budget and truncate JSON output
              thinkingConfig: { thinkingBudget: 0 },
            },
          });

          const raw = response.text ?? "";
          console.log(`[ai-questions] Attempt ${attempt} raw length: ${raw.length}, first 300 chars:`, raw.slice(0, 300));

          // Step 1: Strip markdown code fences
          let cleaned = raw
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/g, "")
            .trim();

          // Step 2: Fix invalid JSON escape sequences BEFORE extracting array
          // (e.g. LaTeX \int, \frac, \infty → \\int, \\frac, \\infty)
          cleaned = fixJsonEscapes(cleaned);

          // Step 3: Extract the outermost JSON array
          const start = cleaned.indexOf("[");
          const end = cleaned.lastIndexOf("]");
          if (start === -1 || end === -1 || end <= start) {
            console.warn(`[ai-questions] Attempt ${attempt}: no JSON array brackets found — trying object extractor`);
            const extracted = extractObjectsFromBrokenJson(cleaned);
            console.log(`[ai-questions] Attempt ${attempt}: object extractor found ${extracted.length} questions`);
            if (extracted.length >= 5) {
              const padded = padToTen(extracted, category, difficulty);
              console.log(`[ai-questions] Attempt ${attempt}: success via object extractor — ${padded.length} questions`);
              return padded;
            }
            continue;
          }

          const arrayStr = cleaned.slice(start, end + 1);
          console.log(`[ai-questions] Attempt ${attempt} array (first 200 chars):`, arrayStr.slice(0, 200));

          // Step 4: Try JSON.parse on the full array
          let questions: AiQuestion[] | null = null;
          try {
            questions = JSON.parse(arrayStr);
          } catch (parseErr: any) {
            console.warn(`[ai-questions] Attempt ${attempt}: JSON.parse failed — ${parseErr?.message} — falling back to object extractor`);
            // Step 4b: Parse each {} block individually (handles truncation and trailing commas)
            const extracted = extractObjectsFromBrokenJson(cleaned);
            console.log(`[ai-questions] Attempt ${attempt}: object extractor found ${extracted.length} questions`);
            if (extracted.length >= 5) {
              const padded = padToTen(extracted, category, difficulty);
              console.log(`[ai-questions] Attempt ${attempt}: success via object extractor — ${padded.length} questions`);
              return padded;
            }
            continue;
          }

          console.log(`[ai-questions] Attempt ${attempt} parsed: ${Array.isArray(questions) ? questions.length : "non-array"} items`);

          // Step 5: Validate and collect good questions
          if (!Array.isArray(questions) || questions.length < 5) {
            console.warn(`[ai-questions] Attempt ${attempt}: too few questions (${Array.isArray(questions) ? questions.length : "non-array"})`);
            continue;
          }

          const validated: AiQuestion[] = [];
          for (const q of questions) {
            if (
              typeof q.question !== "string" ||
              !q.question.trim() ||
              !Array.isArray(q.options) ||
              q.options.length !== 4 ||
              q.options.some((o: any) => typeof o !== "string") ||
              typeof q.answer !== "string" ||
              !q.options.includes(q.answer)
            ) {
              console.warn(`[ai-questions] Attempt ${attempt}: skipping malformed question:`, JSON.stringify(q).slice(0, 120));
              continue;
            }
            validated.push({ question: q.question, options: q.options, answer: q.answer, category, difficulty, explanation: typeof q.explanation === "string" ? q.explanation : undefined });
            if (validated.length === 10) break;
          }

          if (validated.length < 5) {
            console.warn(`[ai-questions] Attempt ${attempt}: only ${validated.length} valid questions after filter`);
            continue;
          }

          const padded = padToTen(validated, category, difficulty);
          console.log(`[ai-questions] Attempt ${attempt}: success — ${padded.length} questions ready`);
          return padded;
        } catch (err: any) {
          console.warn(`[ai-questions] Attempt ${attempt}: request error — ${err?.message ?? err}`);
        }
      }
      return null;
    }

    const aiQuestions = await tryGenerateAiQuestions();

    if (aiQuestions) {
      aiQuestionCache.set(cacheKey, { questions: aiQuestions, timestamp: Date.now() });
      // Increment AI usage only on real Gemini success (not cache, not fallback)
      if (req.userId) {
        storage.incrementAiUsage(req.userId, todayStr()).catch(() => {});
      }
      return res.json({ questions: aiQuestions, source: "ai" });
    }

    // All attempts exhausted — fall back to local question bank (no usage increment)
    console.warn(`[ai-questions] All ${MAX_ATTEMPTS} attempts failed — using fallback question bank for ${category}/${difficulty}`);
    const bankQuestions = getRandomQuestions(category as Category, difficulty as Difficulty, 10);
    const fallback: AiQuestion[] = bankQuestions.map((q) => ({
      question: q.text,
      options: q.options,
      answer: q.options[q.correctAnswerIndex],
      category,
      difficulty,
    }));
    return res.json({ questions: fallback, source: "fallback" });
  });

  // POST /api/ai-explain — explain a wrong answer (costs 40 coins, requires auth)
  app.post("/api/ai-explain", aiRateLimiter, verifyToken, async (req: any, res) => {
    const schema = z.object({
      question: z.string().min(1),
      correctAnswer: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

    // Check and deduct coins (backend-authoritative — never trust frontend)
    const deducted = await storage.deductCoins(req.userId, AI_EXPLAIN_COIN_COST);
    if (!deducted) {
      return res.status(402).json({
        message: `Not enough coins. AI explanations cost ${AI_EXPLAIN_COIN_COST} coins.`,
        required: AI_EXPLAIN_COIN_COST,
      });
    }

    const { question, correctAnswer } = parsed.data;

    const prompt =
      `Explain this question in simple English + Hindi (max 3-4 lines total):\n\n` +
      `Question: ${question}\n` +
      `Correct Answer: ${correctAnswer}\n\n` +
      `Rules:\n` +
      `1. First 1-2 lines: simple English explanation of why this is the correct answer\n` +
      `2. Last 1-2 lines: same explanation in simple Hindi (use Devanagari script)\n` +
      `3. No markdown, no bullet points, no extra text\n` +
      `4. Very easy language — suitable for school students\n` +
      `5. Respond with plain text only`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
      });
      const explanation = (response.text ?? "").trim();
      if (!explanation) throw new Error("Empty response");
      console.log(`[ai-explain] Generated explanation for: "${question.slice(0, 60)}" (cost: ${AI_EXPLAIN_COIN_COST} coins)`);
      // Return updated coin balance so frontend can refresh instantly
      const updatedUser = await storage.getUserById(req.userId);
      return res.json({ explanation, coinsRemaining: updatedUser?.coins ?? 0 });
    } catch (err: any) {
      // Refund coins if AI call failed
      await storage.addUserCoins(req.userId, AI_EXPLAIN_COIN_COST, 0).catch(() => {});
      console.warn(`[ai-explain] Failed: ${err?.message} — refunding coins`);
      return res.status(500).json({ message: "AI explanation failed. Your coins have been refunded." });
    }
  });

  // POST /api/quizzes/generate-custom — create a custom quiz with class, subject, topic
  app.post("/api/quizzes/generate-custom", async (req, res) => {
    const schema = z.object({
      classLevel: z.string().min(1),
      subject: z.string().min(1),
      topic: z.string().min(1),
      difficulty: z.enum(["easy", "medium", "hard"]),
    });
    try {
      const input = schema.parse(req.body);
      const category = subjectToCategory(input.subject);
      const quiz = await storage.createQuiz({
        title: `Class ${input.classLevel} ${input.subject} — ${input.topic}`,
        description: `AI-generated ${input.difficulty} level quiz on ${input.topic} (${input.subject}, Class ${input.classLevel}).`,
        category,
        difficulty: input.difficulty,
        classLevel: input.classLevel,
        subject: input.subject,
        topic: input.topic,
      });
      const bankQuestions = getRandomQuestions(category, input.difficulty as Difficulty, 10);
      for (const q of bankQuestions) {
        await storage.createQuestion({ quizId: quiz.id, text: q.text, options: q.options, correctAnswerIndex: q.correctAnswerIndex });
      }
      const fullQuiz = await storage.getQuiz(quiz.id);
      res.status(201).json(fullQuiz);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // POST /api/ai-questions-custom — AI questions for class/subject/topic/difficulty
  app.post("/api/ai-questions-custom", aiRateLimiter, optionalAuth, async (req: any, res) => {
    const schema = z.object({
      classLevel: z.string().min(1),
      subject: z.string().min(1),
      topic: z.string().min(1),
      difficulty: z.enum(["easy", "medium", "hard"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

    const { classLevel, subject, topic, difficulty } = parsed.data;
    const cacheKey = `custom:${classLevel}:${subject}:${topic}:${difficulty}`;
    const cached = aiQuestionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[ai-questions-custom] Cache hit for ${cacheKey}`);
      return res.json({ questions: cached.questions, source: "ai" });
    }

    // Daily AI limit check for logged-in users (only when not cached)
    if (req.userId) {
      const user = await storage.getUserById(req.userId);
      if (user) {
        const today = todayStr();
        const usedToday = user.lastAiUsageDate === today ? user.aiUsageCount : 0;
        if (usedToday >= AI_DAILY_LIMIT) {
          return res.status(429).json({
            message: `Daily AI limit reached (${AI_DAILY_LIMIT}/day). Try again tomorrow!`,
            limitReached: true,
            used: usedToday,
            limit: AI_DAILY_LIMIT,
          });
        }
      }
    }

    const fallbackCategory = subjectToCategory(subject);
    const prompt =
      `Return ONLY valid JSON. No explanation. No markdown. No code blocks. No LaTeX. No backslashes.\n\n` +
      `Generate exactly 10 multiple-choice questions for:\n` +
      `Class: ${classLevel}\nSubject: ${subject}\nTopic: ${topic}\nDifficulty: ${difficulty}\n\n` +
      `Format (respond with ONLY this JSON array):\n` +
      `[{"question":"...","options":["A","B","C","D"],"answer":"A","explanation":"Simple English explanation. Hindi mein: ..."}]\n\n` +
      `Rules:\n` +
      `1. Exactly 10 questions, exactly 4 options each\n` +
      `2. "answer" must exactly match one of the 4 options\n` +
      `3. "explanation" must be 2-3 lines: simple English first, then simple Hindi\n` +
      `4. Questions must strictly match Class ${classLevel} ${subject}, topic: ${topic}\n` +
      `5. Difficulty: ${difficulty} (easy=basic concepts, medium=application, hard=advanced/complex)\n` +
      `6. Do NOT mix topics. Do NOT include any extra text outside the JSON.\n` +
      `7. Use PLAIN TEXT ONLY — no LaTeX, no backslashes, no dollar signs\n` +
      `8. Write math in plain text: x^2, sqrt(x), pi, integral of, etc.`;

    const MAX_ATTEMPTS = 3;

    async function tryGenerateCustomQuestions(): Promise<AiQuestion[] | null> {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          console.log(`[ai-questions-custom] Attempt ${attempt}/${MAX_ATTEMPTS}: Class ${classLevel} ${subject} - ${topic} (${difficulty})`);
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
          });
          const raw = response.text ?? "";
          let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
          cleaned = fixJsonEscapes(cleaned);
          const start = cleaned.indexOf("[");
          const end = cleaned.lastIndexOf("]");
          if (start === -1 || end === -1 || end <= start) {
            const extracted = extractObjectsFromBrokenJson(cleaned);
            if (extracted.length >= 5) return padToTen(extracted.map(q => ({ ...q, category: fallbackCategory, difficulty })), fallbackCategory, difficulty);
            continue;
          }
          let questions: any[] | null = null;
          try { questions = JSON.parse(cleaned.slice(start, end + 1)); } catch {
            const extracted = extractObjectsFromBrokenJson(cleaned);
            if (extracted.length >= 5) return padToTen(extracted.map(q => ({ ...q, category: fallbackCategory, difficulty })), fallbackCategory, difficulty);
            continue;
          }
          if (!Array.isArray(questions) || questions.length < 5) continue;
          const validated: AiQuestion[] = [];
          for (const q of questions) {
            if (!q.question?.trim() || !Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o: any) => typeof o !== "string") || !q.options.includes(q.answer)) continue;
            validated.push({ question: q.question, options: q.options, answer: q.answer, category: fallbackCategory, difficulty, explanation: typeof q.explanation === "string" ? q.explanation : undefined });
            if (validated.length === 10) break;
          }
          if (validated.length < 5) continue;
          return padToTen(validated, fallbackCategory, difficulty);
        } catch (err: any) {
          console.warn(`[ai-questions-custom] Attempt ${attempt}: error — ${err?.message ?? err}`);
        }
      }
      return null;
    }

    const aiQuestions = await tryGenerateCustomQuestions();
    if (aiQuestions) {
      aiQuestionCache.set(cacheKey, { questions: aiQuestions, timestamp: Date.now() });
      // Increment AI usage only on real Gemini success (not cache, not fallback)
      if (req.userId) {
        storage.incrementAiUsage(req.userId, todayStr()).catch(() => {});
      }
      return res.json({ questions: aiQuestions, source: "ai" });
    }
    console.warn(`[ai-questions-custom] All attempts failed — using fallback for ${subject}/${topic}`);
    const bankQuestions = getRandomQuestions(fallbackCategory, difficulty as Difficulty, 10);
    return res.json({
      questions: bankQuestions.map(q => ({ question: q.text, options: q.options, answer: q.options[q.correctAnswerIndex], category: fallbackCategory, difficulty })),
      source: "fallback",
    });
  });

  return httpServer;
}
