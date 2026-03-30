import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { createQuizFromBankSchema } from "@shared/routes";
import { getRandomQuestions, getCategoryQuestionCount, type Category, type Difficulty } from "./question-bank";
import { z } from "zod";
import { insertScoreSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // GET /api/quizzes
  app.get("/api/quizzes", async (req, res) => {
    const allQuizzes = await storage.getQuizzes();
    res.json(allQuizzes);
  });

  // POST /api/quizzes/generate — create a quiz from the question bank
  app.post("/api/quizzes/generate", async (req, res) => {
    try {
      const input = createQuizFromBankSchema.parse(req.body);
      const categoryLabels: Record<string, string> = {
        math: "Math",
        tech: "Technology",
        general: "General Knowledge",
      };
      const difficultyLabels: Record<string, string> = {
        easy: "Easy",
        medium: "Medium",
        hard: "Hard",
      };
      const quiz = await storage.createQuiz({
        title: input.title,
        description: `A ${difficultyLabels[input.difficulty]} level ${categoryLabels[input.category]} quiz with 10 questions.`,
        category: input.category,
        difficulty: input.difficulty,
      });

      const bankQuestions = getRandomQuestions(
        input.category as Category,
        input.difficulty as Difficulty,
        10
      );

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
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  // GET /api/quizzes/:id/play — fresh random questions every time (never repeats)
  app.get("/api/quizzes/:id/play", async (req, res) => {
    const quiz = await storage.getQuiz(Number(req.params.id));
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const category = (quiz.category || "general") as Category;
    const difficulty = (quiz.difficulty || "medium") as Difficulty;
    const count = getCategoryQuestionCount(category, difficulty);

    const freshQuestions = getRandomQuestions(category, difficulty, 10);

    const sessionQuestions = freshQuestions.map((q, idx) => ({
      id: idx + 1,
      quizId: quiz.id,
      text: q.text,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
    }));

    res.json({
      ...quiz,
      questions: sessionQuestions,
      totalInBank: count,
    });
  });

  // GET /api/quizzes/:id
  app.get("/api/quizzes/:id", async (req, res) => {
    const quiz = await storage.getQuiz(Number(req.params.id));
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }
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
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  // GET /api/quizzes/:quizId/scores
  app.get("/api/quizzes/:quizId/scores", async (req, res) => {
    const quizScores = await storage.getScoresForQuiz(Number(req.params.quizId));
    res.json(quizScores);
  });

  // GET /api/leaderboard — global top 10 by coins earned
  app.get("/api/leaderboard", async (req, res) => {
    const topScores = await storage.getTopScores(10);
    res.json(topScores);
  });

  return httpServer;
}
