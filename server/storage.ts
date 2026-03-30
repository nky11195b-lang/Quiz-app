import { db } from "./db";
import {
  quizzes,
  questions,
  scores,
  type Quiz,
  type InsertQuiz,
  type Question,
  type InsertQuestion,
  type Score,
  type InsertScore,
  type QuizWithQuestions
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getQuizzes(): Promise<Quiz[]>;
  getQuiz(id: number): Promise<QuizWithQuestions | undefined>;
  createQuiz(quiz: InsertQuiz): Promise<Quiz>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  submitScore(score: InsertScore): Promise<Score>;
  getScoresForQuiz(quizId: number): Promise<Score[]>;
}

export class DatabaseStorage implements IStorage {
  async getQuizzes(): Promise<Quiz[]> {
    return await db.select().from(quizzes);
  }

  async getQuiz(id: number): Promise<QuizWithQuestions | undefined> {
    const quiz = await db.select().from(quizzes).where(eq(quizzes.id, id)).then(rows => rows[0]);
    if (!quiz) return undefined;

    const quizQuestions = await db.select().from(questions).where(eq(questions.quizId, id));
    return { ...quiz, questions: quizQuestions };
  }

  async createQuiz(insertQuiz: InsertQuiz): Promise<Quiz> {
    const [quiz] = await db.insert(quizzes).values(insertQuiz).returning();
    return quiz;
  }

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const [question] = await db.insert(questions).values(insertQuestion).returning();
    return question;
  }

  async submitScore(insertScore: InsertScore): Promise<Score> {
    const [score] = await db.insert(scores).values(insertScore).returning();
    return score;
  }

  async getScoresForQuiz(quizId: number): Promise<Score[]> {
    return await db.select().from(scores).where(eq(scores.quizId, quizId)).orderBy(desc(scores.score));
  }
}

export const storage = new DatabaseStorage();
