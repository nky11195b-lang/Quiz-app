# QuizNova — Full-Stack AI Quiz App

## Overview
A dynamic quiz application with Google Gemini AI-powered question generation, category-based question banks, bilingual explanations (English + Hindi), coin rewards, timers, and leaderboards.

## Stack
- **Backend**: Node.js + Express + TypeScript (`tsx`)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS + Radix UI
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: Google Gemini (`gemini-2.5-flash`) via Replit AI Integration
- **Routing**: Wouter (client-side)
- **Animations**: Framer Motion
- **State**: TanStack Query

## Architecture
- `server/` — Express server (index, routes, storage, db)
- `client/src/` — React SPA (pages, hooks, components)
- `shared/` — Shared types, schema, and route definitions
- `server/question-bank.ts` — 60 questions per category × 3 difficulties = 180+ fallback questions

## Key Features
1. **Custom AI Quiz Generator** — Select class (6–12), subject, topic, difficulty → Gemini generates 10 questions with explanations
2. **Quick Quiz** — Category (math/tech/general) + difficulty → AI-generated quiz
3. **Bilingual Explanations** — Every AI question includes English + Hindi explanation
4. **"Explain with AI" Button** — After wrong answer, on-demand AI explanation (English + Hindi)
5. **10-Second Timer** — Per question; auto-advances on timeout
6. **Coins System** — +10 coins per correct answer, saved to DB
7. **Player Names** — Entered before quiz, stored with scores
8. **Global Leaderboard** — Top 10 by coins earned across all quizzes
9. **Per-Quiz Leaderboard** — Top 10 for individual quizzes
10. **Fallback System** — AI failures silently fall back to local question bank; user never sees an error

## AI Endpoints
- `POST /api/ai-questions` — `{category, difficulty}` → 10 questions with explanations (cached 5 min)
- `POST /api/ai-questions-custom` — `{classLevel, subject, topic, difficulty}` → 10 tailored questions
- `POST /api/ai-explain` — `{question, correctAnswer}` → bilingual explanation (English + Hindi)
- `POST /api/quizzes/generate-custom` — Creates a quiz record with classLevel/subject/topic metadata

## AI Robustness
- `thinkingBudget: 0` — Disables Gemini reasoning tokens (prevents JSON truncation)
- `maxOutputTokens: 8192` — Plenty of room for 10 questions
- `fixJsonEscapes()` — Sanitizes LaTeX backslashes before parsing
- `extractObjectsFromBrokenJson()` — Character-level fallback parser for malformed JSON
- `padToTen()` — Fills partial batches (5-9 questions) from local bank
- 3 retry attempts before falling back to local bank
- 5-minute in-memory cache per category/difficulty or class/subject/topic/difficulty

## Database Tables
- `quizzes` — id, title, description, category, difficulty, classLevel, subject, topic
- `questions` — id, quizId, text, options[], correctAnswerIndex
- `scores` — id, quizId, playerName, score, total, coinsEarned, createdAt

## Pages / Routes
- `/` — Home, shows quizzes + Custom AI Quiz modal + Quick Quiz modal
- `/quiz/:id` — Quiz play page (intro → loading → playing → results)
- `/quiz/:id/leaderboard` — Per-quiz top 10
- `/leaderboard` — Global top 10

## Running
- Dev: `npm run dev` (serves on port 5000)
- Build: `npm run build`
- Start: `npm start`
- DB push: `npm run db:push`
