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

const JWT_SECRET = process.env.JWT_SECRET || "quiznova_dev_secret_please_set_in_production";
const JWT_EXPIRY = "30d";

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
  // Run repair at startup — fixes any quizzes with wrong or default categories
  repairQuizCategories().catch((err) =>
    console.error("[repair] Category repair failed:", err)
  );

  // POST /api/auth/signup
  app.post("/api/auth/signup", async (req, res) => {
    const schema = z.object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      email: z.string().email("Invalid email address"),
      password: z.string().min(6, "Password must be at least 6 characters"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

    const { name, email, password } = parsed.data;
    const existing = await storage.findUserByEmail(email);
    if (existing) return res.status(409).json({ message: "An account with this email already exists." });

    const hashed = await bcrypt.hash(password, 12);
    const user = await storage.createUser({ name, email, password: hashed, coins: 0, totalScore: 0, aiUsageCount: 0 });
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const { password: _, ...safeUser } = user;
    console.log(`[auth] New user: ${user.email} (id: ${user.id})`);
    return res.status(201).json({ token, user: safeUser });
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

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Incorrect password." });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const { password: _, ...safeUser } = user;
    console.log(`[auth] Login: ${user.email}`);
    return res.json({ token, user: safeUser });
  });

  // GET /api/auth/me — return current user from JWT
  app.get("/api/auth/me", verifyToken, async (req: any, res) => {
    const user = await storage.getUserById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
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
  app.post("/api/ai-questions", async (req, res) => {
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
      return res.json({ questions: aiQuestions, source: "ai" });
    }

    // All attempts exhausted — fall back to local question bank
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

  // POST /api/ai-explain — explain a wrong answer in simple English + Hindi
  app.post("/api/ai-explain", async (req, res) => {
    const schema = z.object({
      question: z.string().min(1),
      correctAnswer: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

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
      console.log(`[ai-explain] Generated explanation for: "${question.slice(0, 60)}"`);
      return res.json({ explanation });
    } catch (err: any) {
      console.warn(`[ai-explain] Failed: ${err?.message} — using fallback`);
      return res.json({ explanation: `The correct answer is "${correctAnswer}". Review this topic to understand why.\n\nसही उत्तर "${correctAnswer}" है। इस विषय को दोबारा पढ़ें।` });
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
  app.post("/api/ai-questions-custom", async (req, res) => {
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
