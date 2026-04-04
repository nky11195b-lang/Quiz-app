import { db } from "./db";
import {
  users, quizzes, questions, scores,
  type User, type InsertUser,
  type Quiz, type InsertQuiz,
  type Question, type InsertQuestion,
  type Score, type InsertScore,
  type QuizWithQuestions,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  findUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUserById(id: number): Promise<User | undefined>;
  addUserCoins(id: number, coins: number, score: number): Promise<void>;
  deductCoins(id: number, amount: number): Promise<boolean>;
  incrementAiUsage(id: number, todayStr: string): Promise<void>;
  // Quizzes
  getQuizzes(): Promise<Quiz[]>;
  getQuiz(id: number): Promise<QuizWithQuestions | undefined>;
  createQuiz(quiz: InsertQuiz): Promise<Quiz>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  updateQuizCategory(id: number, category: string, difficulty: string): Promise<void>;
  // Scores
  submitScore(score: InsertScore): Promise<Score>;
  getScoresForQuiz(quizId: number): Promise<Score[]>;
  getTopScores(limit?: number): Promise<Score[]>;
}

export class DatabaseStorage implements IStorage {
  async findUserByEmail(email: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.email, email.toLowerCase())).then(r => r[0]);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({
      ...insertUser,
      email: insertUser.email.toLowerCase(),
    }).returning();
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).then(r => r[0]);
  }

  async addUserCoins(id: number, coins: number, score: number): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) return;
    await db.update(users).set({
      coins: user.coins + coins,
      totalScore: user.totalScore + score,
    }).where(eq(users.id, id));
  }

  async deductCoins(id: number, amount: number): Promise<boolean> {
    const user = await this.getUserById(id);
    if (!user || user.coins < amount) return false;
    await db.update(users).set({ coins: user.coins - amount }).where(eq(users.id, id));
    return true;
  }

  async incrementAiUsage(id: number, todayStr: string): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) return;
    const newCount = user.lastAiUsageDate === todayStr ? user.aiUsageCount + 1 : 1;
    await db.update(users).set({
      aiUsageCount: newCount,
      lastAiUsageDate: todayStr,
    }).where(eq(users.id, id));
  }

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

  async updateQuizCategory(id: number, category: string, difficulty: string): Promise<void> {
    await db.update(quizzes).set({ category, difficulty }).where(eq(quizzes.id, id));
  }

  async submitScore(insertScore: InsertScore): Promise<Score> {
    const [score] = await db.insert(scores).values(insertScore).returning();
    return score;
  }

  async getScoresForQuiz(quizId: number): Promise<Score[]> {
    return await db.select().from(scores).where(eq(scores.quizId, quizId)).orderBy(desc(scores.score));
  }

  async getTopScores(limit: number = 10): Promise<Score[]> {
    return await db.select().from(scores).orderBy(desc(scores.coinsEarned), desc(scores.score)).limit(limit);
  }
}

export const storage = new DatabaseStorage();
