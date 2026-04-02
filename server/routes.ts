import type { Express } from "express";
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
  app.post("/api/scores", async (req, res) => {
    try {
      const input = insertScoreSchema.parse({
        ...req.body,
        quizId: Number(req.body.quizId),
        score: Number(req.body.score),
        total: Number(req.body.total),
        coinsEarned: Number(req.body.coinsEarned ?? 0),
        playerName: req.body.playerName || "Anonymous",
      });
      const score = await storage.submitScore(input);
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
      `4. Use PLAIN TEXT ONLY — NO LaTeX, NO backslashes, NO dollar signs for math\n` +
      `   Write math plainly: use "x^2" not "$x^2$", "sqrt(x)" not "\\sqrt{x}", "pi" not "\\pi", "integral" not "\\int"\n` +
      `5. Questions must match the ${categoryLabels[category]} category and ${difficulty} difficulty\n` +
      `JSON format: [{"question":"...","options":["A","B","C","D"],"answer":"A","category":"${category}","difficulty":"${difficulty}"}]`;

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
            validated.push({ question: q.question, options: q.options, answer: q.answer, category, difficulty });
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

  return httpServer;
}
