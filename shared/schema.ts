import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const quizzes = pgTable("quizzes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  difficulty: text("difficulty").notNull().default("medium"),
  classLevel: text("class_level"),
  subject: text("subject"),
  topic: text("topic"),
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull(),
  text: text("text").notNull(),
  options: text("options").array().notNull(),
  correctAnswerIndex: integer("correct_answer_index").notNull(),
});

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull(),
  playerName: text("player_name").notNull().default("Anonymous"),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  coinsEarned: integer("coins_earned").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertQuizSchema = createInsertSchema(quizzes).omit({ id: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true });
export const insertScoreSchema = createInsertSchema(scores).omit({ id: true, createdAt: true });

export type Quiz = typeof quizzes.$inferSelect;
export type InsertQuiz = z.infer<typeof insertQuizSchema>;

export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;

export type Score = typeof scores.$inferSelect;
export type InsertScore = z.infer<typeof insertScoreSchema>;

export type QuizWithQuestions = Quiz & {
  questions: Question[];
};
