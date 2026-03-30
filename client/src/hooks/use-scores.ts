import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertScore } from "@shared/schema";
import { z } from "zod";

function parseWithLogging<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  try {
    const result = schema.safeParse(data);
    if (!result.success) {
      console.error(`[Zod] ${label} validation failed:`, result.error.format());
      return data as T;
    }
    return result.data;
  } catch (e) {
    return data as T;
  }
}

export function useScores(quizId: number) {
  return useQuery({
    queryKey: [buildUrl(api.scores.list.path, { quizId })],
    queryFn: async () => {
      const url = buildUrl(api.scores.list.path, { quizId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch scores");
      const data = await res.json();
      return parseWithLogging(api.scores.list.responses[200], data, "scores.list");
    },
    enabled: !!quizId,
  });
}

export function useSubmitScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertScore) => {
      const res = await fetch(api.scores.submit.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const err = await res.json();
          throw new Error(err.message || "Invalid score submission");
        }
        throw new Error("Failed to submit score");
      }
      const resultData = await res.json();
      return parseWithLogging(api.scores.submit.responses[201], resultData, "scores.submit");
    },
    onSuccess: (_, variables) => {
      const url = buildUrl(api.scores.list.path, { quizId: variables.quizId });
      queryClient.invalidateQueries({ queryKey: [url] });
    },
  });
}
