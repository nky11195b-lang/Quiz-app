import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { authFetch } from "@/lib/auth-fetch";

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
      const res = await authFetch("/api/ai-usage");
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
