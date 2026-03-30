import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertQuiz } from "@shared/schema";
import { z } from "zod";

// Helper to gracefully handle Zod parsing while ensuring the app doesn't crash on minor type mismatches
function parseWithLogging<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  try {
    const result = schema.safeParse(data);
    if (!result.success) {
      console.error(`[Zod] ${label} validation failed:`, result.error.format());
      return data as T; // Graceful fallback
    }
    return result.data;
  } catch (e) {
    return data as T;
  }
}

export function useQuizzes() {
  return useQuery({
    queryKey: [api.quizzes.list.path],
    queryFn: async () => {
      const res = await fetch(api.quizzes.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quizzes");
      const data = await res.json();
      return parseWithLogging(api.quizzes.list.responses[200], data, "quizzes.list");
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
      const data = await res.json();
      return parseWithLogging(api.quizzes.get.responses[200], data, "quizzes.get");
    },
    enabled: !!id,
  });
}

// Added an optimistic create hook for aggressive API coverage
// If the backend doesn't support POST /api/quizzes, it will fail cleanly.
export function useCreateQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertQuiz) => {
      const res = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create quiz");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.quizzes.list.path] }),
  });
}
