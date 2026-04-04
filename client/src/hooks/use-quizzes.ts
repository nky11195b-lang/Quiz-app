import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

const TOKEN_KEY = "quiznova_token";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useQuizzes() {
  return useQuery({
    queryKey: [api.quizzes.list.path],
    queryFn: async () => {
      const res = await fetch(api.quizzes.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quizzes");
      return res.json();
    },
  });
}

export function useQuiz(id: number) {
  return useQuery({
    queryKey: [api.quizzes.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.quizzes.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch quiz");
      return res.json();
    },
    enabled: !!id,
  });
}

export async function fetchPlaySession(quizId: number) {
  const res = await fetch(`/api/quizzes/${quizId}/play`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load questions");
  return res.json();
}

export type AiQuestion = {
  question: string;
  options: string[];
  answer: string;
  category: string;
  difficulty: string;
  explanation?: string;
};

export async function fetchAiExplanation(
  question: string,
  correctAnswer: string
): Promise<{ explanation: string; coinsRemaining: number }> {
  const res = await fetch("/api/ai-explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    credentials: "include",
    body: JSON.stringify({ question, correctAnswer }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any).message || "Failed to get explanation");
  }
  return data as { explanation: string; coinsRemaining: number };
}

export async function fetchAiQuestions(
  category: string,
  difficulty: string
): Promise<{ questions: AiQuestion[]; source: "ai" | "fallback" }> {
  const res = await fetch("/api/ai-questions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    credentials: "include",
    body: JSON.stringify({ category, difficulty }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || "Failed to generate AI questions");
  }
  return res.json();
}

export async function fetchAiQuestionsCustom(
  classLevel: string,
  subject: string,
  topic: string,
  difficulty: string
): Promise<{ questions: AiQuestion[]; source: "ai" | "fallback" }> {
  const res = await fetch("/api/ai-questions-custom", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    credentials: "include",
    body: JSON.stringify({ classLevel, subject, topic, difficulty }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || "Failed to generate custom AI questions");
  }
  return res.json();
}

export function useGenerateQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; category: string; difficulty: string }) => {
      const res = await fetch("/api/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to generate quiz");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.quizzes.list.path] }),
  });
}

export function useGenerateCustomQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { classLevel: string; subject: string; topic: string; difficulty: string }) => {
      const res = await fetch("/api/quizzes/generate-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to generate custom quiz");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.quizzes.list.path] }),
  });
}
