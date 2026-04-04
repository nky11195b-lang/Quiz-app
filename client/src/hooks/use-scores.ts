import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";

export function useScores(quizId: number) {
  return useQuery({
    queryKey: [`/api/quizzes/${quizId}/scores`],
    queryFn: async () => {
      const res = await authFetch(`/api/quizzes/${quizId}/scores`);
      if (!res.ok) throw new Error("Failed to fetch scores");
      return res.json();
    },
    enabled: !!quizId,
  });
}

export function useTopScores() {
  return useQuery({
    queryKey: ["/api/leaderboard"],
    queryFn: async () => {
      const res = await authFetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
  });
}

export function useSubmitScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      quizId: number;
      playerName: string;
      score: number;
      total: number;
      coinsEarned: number;
    }) => {
      const res = await authFetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to submit score");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/quizzes/${variables.quizId}/scores`] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
    },
  });
}
