import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";

const TOKEN_KEY = "quiznova_token";

export type AiUsageInfo = {
  used: number;
  limit: number;
  remaining: number;
  coins: number;
  explainCost: number;
};

export function useAiUsage() {
  const { user } = useAuth();

  const query = useQuery<AiUsageInfo>({
    queryKey: ["/api/ai-usage"],
    queryFn: async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch("/api/ai-usage", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch AI usage");
      return res.json();
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  return query;
}

export function useInvalidateAiUsage() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["/api/ai-usage"] });
}
