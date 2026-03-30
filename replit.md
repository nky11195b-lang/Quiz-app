# QuizNova — Full-Stack Quiz App

## Overview
A dynamic quiz application with category-based question banks, coin rewards, timers, and leaderboards.

## Stack
- **Backend**: Node.js + Express + TypeScript (`tsx`)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS + Radix UI
- **Database**: PostgreSQL via Drizzle ORM
- **Routing**: Wouter (client-side)
- **Animations**: Framer Motion
- **State**: TanStack Query

## Architecture
- `server/` — Express server (index, routes, storage, db)
- `client/src/` — React SPA (pages, hooks, components)
- `shared/` — Shared types, schema, and route definitions
- `server/question-bank.ts` — 60 questions per category × 3 difficulties = 180+ questions

## Key Features
1. **Dynamic Question Bank** — 20 questions per category/difficulty (math, tech, general × easy, medium, hard)
2. **Quiz Generation** — POST `/api/quizzes/generate` picks 10 random questions from the bank
3. **10-Second Timer** — Per question; auto-advances on timeout
4. **Coins System** — +10 coins per correct answer, saved to DB
5. **Player Names** — Entered before quiz, stored with scores
6. **Global Leaderboard** — Top 10 by coins earned across all quizzes (`GET /api/leaderboard`)
7. **Per-Quiz Leaderboard** — Top 10 for individual quizzes

## Database Tables
- `quizzes` — id, title, description, category, difficulty
- `questions` — id, quizId, text, options[], correctAnswerIndex
- `scores` — id, quizId, playerName, score, total, coinsEarned, createdAt

## Pages / Routes
- `/` — Home, shows quizzes + Create Quiz modal
- `/quiz/:id` — Quiz play page (intro → playing → results)
- `/quiz/:id/leaderboard` — Per-quiz top 10
- `/leaderboard` — Global top 10

## Running
- Dev: `npm run dev` (serves on port 5000)
- Build: `npm run build`
- Start: `npm start`
- DB push: `npm run db:push`
