import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // GET /api/quizzes
  app.get(api.quizzes.list.path, async (req, res) => {
    const allQuizzes = await storage.getQuizzes();
    res.json(allQuizzes);
  });

  // GET /api/quizzes/:id
  app.get(api.quizzes.get.path, async (req, res) => {
    const quiz = await storage.getQuiz(Number(req.params.id));
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }
    res.json(quiz);
  });

  // POST /api/scores
  app.post(api.scores.submit.path, async (req, res) => {
    try {
      const bodySchema = api.scores.submit.input.extend({
        quizId: z.coerce.number(),
        score: z.coerce.number(),
        total: z.coerce.number(),
      });
      const input = bodySchema.parse(req.body);
      const score = await storage.submitScore(input);
      res.status(201).json(score);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // GET /api/quizzes/:quizId/scores
  app.get(api.scores.list.path, async (req, res) => {
    const quizScores = await storage.getScoresForQuiz(Number(req.params.quizId));
    res.json(quizScores);
  });

  // Seed database if empty
  seedDatabase().catch(console.error);

  return httpServer;
}

async function seedDatabase() {
  const existingQuizzes = await storage.getQuizzes();
  if (existingQuizzes.length === 0) {
    // Math Quiz
    const mathQuiz = await storage.createQuiz({
      title: "Basic Math Challenge",
      description: "Test your fundamental math skills with these quick questions."
    });

    await storage.createQuestion({
      quizId: mathQuiz.id,
      text: "What is 5 + 7?",
      options: ["10", "11", "12", "13"],
      correctAnswerIndex: 2
    });

    await storage.createQuestion({
      quizId: mathQuiz.id,
      text: "What is 3 * 6?",
      options: ["15", "18", "21", "24"],
      correctAnswerIndex: 1
    });

    await storage.createQuestion({
      quizId: mathQuiz.id,
      text: "What is 20 / 4?",
      options: ["4", "5", "6", "7"],
      correctAnswerIndex: 1
    });

    // Tech Quiz
    const techQuiz = await storage.createQuiz({
      title: "Tech Trivia",
      description: "How well do you know the world of technology and computing?"
    });

    await storage.createQuestion({
      quizId: techQuiz.id,
      text: "What does HTML stand for?",
      options: [
        "Hyper Text Markup Language",
        "High Tech Modern Language",
        "Hyperlink and Text Markup Language",
        "Home Tool Markup Language"
      ],
      correctAnswerIndex: 0
    });

    await storage.createQuestion({
      quizId: techQuiz.id,
      text: "Which of the following is not a programming language?",
      options: ["Python", "Java", "Cobra", "Ruby"],
      correctAnswerIndex: 2
    });
  }
}
