import { Link } from "wouter";
import { format } from "date-fns";
import { Trophy, ArrowLeft, Loader2, Target, Coins, Star, Medal } from "lucide-react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { useTopScores } from "@/hooks/use-scores";

const MEDAL_ICONS = [
  <Trophy className="w-5 h-5 text-amber-500" />,
  <Medal className="w-5 h-5 text-slate-400" />,
  <Medal className="w-5 h-5 text-orange-400" />,
];

const ROW_STYLES = [
  "bg-amber-50/70 border-amber-200",
  "bg-slate-50/70 border-slate-200",
  "bg-orange-50/70 border-orange-200",
];

const RANK_STYLES = [
  "bg-amber-100 text-amber-700 border-amber-300",
  "bg-slate-100 text-slate-600 border-slate-300",
  "bg-orange-100 text-orange-700 border-orange-300",
];

export default function GlobalLeaderboardPage() {
  const { data: scores, isLoading } = useTopScores();

  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full">
        <div className="mb-10">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium mb-6">
            <ArrowLeft className="w-4 h-4" /> Back Home
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20 text-white">
              <Trophy className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold mb-1">Global Leaderboard</h1>
              <p className="text-muted-foreground font-medium">Top 10 players across all quizzes</p>
            </div>
          </div>
        </div>

        {/* Stats banner */}
        {!isLoading && scores && scores.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-2xl p-4 border text-center">
              <p className="text-2xl font-display font-extrabold text-amber-500">{scores[0]?.coinsEarned ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1 font-medium">Top Coins</p>
            </div>
            <div className="bg-card rounded-2xl p-4 border text-center">
              <p className="text-2xl font-display font-extrabold text-primary">{scores.length}</p>
              <p className="text-xs text-muted-foreground mt-1 font-medium">Players</p>
            </div>
            <div className="bg-card rounded-2xl p-4 border text-center">
              <p className="text-2xl font-display font-extrabold text-emerald-500">
                {Math.round(scores.reduce((acc: number, s: any) => acc + (s.score / s.total), 0) / scores.length * 100)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1 font-medium">Avg Score</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-3xl border">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground animate-pulse">Loading leaderboard...</p>
          </div>
        ) : !scores || scores.length === 0 ? (
          <div className="text-center py-24 bg-card rounded-3xl border border-dashed">
            <Target className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="text-2xl font-display font-semibold mb-2">No scores yet</h3>
            <p className="text-muted-foreground mb-6">Be the first to complete a quiz and claim the top spot!</p>
            <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:shadow-lg transition-all">
              Browse Quizzes
            </Link>
          </div>
        ) : (
          <div className="bg-card rounded-[2rem] p-4 md:p-6 shadow-xl border border-border/60">
            {/* Top 3 podium */}
            {scores.length >= 3 && (
              <div className="flex items-end justify-center gap-4 mb-8 pb-8 border-b border-border/40">
                {/* 2nd place */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col items-center gap-2 flex-1 max-w-[120px]"
                >
                  <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-bold border-2 border-slate-300 text-lg">
                    2
                  </div>
                  <p className="text-sm font-semibold text-center line-clamp-1">{scores[1]?.playerName || "Anonymous"}</p>
                  <div className="flex items-center gap-1 text-amber-600 font-bold text-sm">
                    <Coins className="w-4 h-4" />{scores[1]?.coinsEarned ?? 0}
                  </div>
                  <div className="w-full bg-slate-200 rounded-t-xl h-16 flex items-center justify-center text-slate-500 font-bold">
                    🥈
                  </div>
                </motion.div>

                {/* 1st place */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0 }}
                  className="flex flex-col items-center gap-2 flex-1 max-w-[140px]"
                >
                  <Star className="w-6 h-6 text-amber-500" />
                  <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center font-bold border-2 border-amber-300 text-xl shadow-lg shadow-amber-200">
                    1
                  </div>
                  <p className="text-sm font-bold text-center line-clamp-1">{scores[0]?.playerName || "Anonymous"}</p>
                  <div className="flex items-center gap-1 text-amber-600 font-bold text-sm">
                    <Coins className="w-4 h-4" />{scores[0]?.coinsEarned ?? 0}
                  </div>
                  <div className="w-full bg-amber-200 rounded-t-xl h-24 flex items-center justify-center text-amber-600 font-bold text-2xl">
                    🥇
                  </div>
                </motion.div>

                {/* 3rd place */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex flex-col items-center gap-2 flex-1 max-w-[120px]"
                >
                  <div className="w-12 h-12 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center font-bold border-2 border-orange-300 text-lg">
                    3
                  </div>
                  <p className="text-sm font-semibold text-center line-clamp-1">{scores[2]?.playerName || "Anonymous"}</p>
                  <div className="flex items-center gap-1 text-amber-600 font-bold text-sm">
                    <Coins className="w-4 h-4" />{scores[2]?.coinsEarned ?? 0}
                  </div>
                  <div className="w-full bg-orange-200 rounded-t-xl h-12 flex items-center justify-center text-orange-600 font-bold">
                    🥉
                  </div>
                </motion.div>
              </div>
            )}

            {/* Full list */}
            <div className="space-y-3">
              {scores.map((score: any, idx: number) => {
                const pct = Math.round((score.score / score.total) * 100);
                const isTop3 = idx < 3;
                return (
                  <motion.div
                    key={score.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all hover:bg-muted/30
                      ${isTop3 ? ROW_STYLES[idx] : "bg-card border-border/50"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-bold text-sm flex-shrink-0
                        ${isTop3 ? RANK_STYLES[idx] : "bg-muted text-muted-foreground border-border"}`}>
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground flex items-center gap-1.5">
                          {score.playerName || "Anonymous"}
                          {isTop3 && MEDAL_ICONS[idx]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {score.createdAt ? format(new Date(score.createdAt), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-4">
                      <div>
                        <p className={`font-display font-extrabold text-xl ${isTop3 ? "text-primary" : "text-foreground"}`}>
                          {pct}%
                        </p>
                        <p className="text-xs text-muted-foreground">{score.score}/{score.total}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-bold text-sm">
                          <Coins className="w-3.5 h-3.5" />
                          {score.coinsEarned ?? 0}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
