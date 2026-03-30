import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { Trophy, ArrowLeft, Loader2, Target } from "lucide-react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { useScores } from "@/hooks/use-scores";
import { useQuiz } from "@/hooks/use-quizzes";

export default function LeaderboardPage({ params }: { params?: { id?: string } }) {
  const [match, routeParams] = useRoute("/quiz/:id/leaderboard");
  const quizIdStr = params?.id || routeParams?.id;
  const quizId = quizIdStr ? parseInt(quizIdStr, 10) : 0;

  const { data: quiz, isLoading: isQuizLoading } = useQuiz(quizId);
  const { data: scores, isLoading: isScoresLoading } = useScores(quizId);

  const isLoading = isQuizLoading || isScoresLoading;

  // Sort scores top to bottom, then most recent
  const sortedScores = scores 
    ? [...scores].sort((a, b) => {
        const percA = a.score / a.total;
        const percB = b.score / b.total;
        if (percB !== percA) return percB - percA;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
    : [];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full">
        <div className="mb-10">
          <Link href={`/quiz/${quizId}`} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Quiz
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-primary to-purple-600 rounded-2xl flex items-center justify-center shadow-lg text-white">
              <Trophy className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-1">Leaderboard</h1>
              <p className="text-muted-foreground font-medium">
                {quiz ? quiz.title : "Loading..."}
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-3xl border border-border">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground font-medium">Fetching scores...</p>
          </div>
        ) : sortedScores.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-border border-dashed shadow-sm">
            <Target className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="text-2xl font-display font-semibold mb-2">No scores yet</h3>
            <p className="text-muted-foreground mb-6">Be the first to complete this quiz and set the high score!</p>
            <Link href={`/quiz/${quizId}`} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:shadow-lg transition-all">
              Take Quiz
            </Link>
          </div>
        ) : (
          <div className="bg-card rounded-[2rem] p-4 md:p-6 shadow-xl border border-border/60">
            <div className="space-y-3">
              {sortedScores.map((score, idx) => {
                const percentage = Math.round((score.score / score.total) * 100);
                const isTop3 = idx < 3;
                
                return (
                  <motion.div
                    key={score.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`flex items-center justify-between p-4 md:p-6 rounded-2xl border transition-all hover:bg-muted/50
                      ${idx === 0 ? 'bg-amber-50/50 border-amber-200' : 
                        idx === 1 ? 'bg-slate-50/50 border-slate-200' :
                        idx === 2 ? 'bg-orange-50/50 border-orange-200' : 'bg-card border-border/50'}`}
                  >
                    <div className="flex items-center gap-4 md:gap-6">
                      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-display font-bold text-lg md:text-xl
                        ${idx === 0 ? 'bg-amber-100 text-amber-700' : 
                          idx === 1 ? 'bg-slate-200 text-slate-700' :
                          idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>
                        #{idx + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-lg mb-0.5 flex items-center gap-2">
                          Anonymous Scholar
                          {idx === 0 && <Trophy className="w-4 h-4 text-amber-500" />}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(score.createdAt), 'MMM d, yyyy • h:mm a')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-display font-extrabold text-2xl md:text-3xl ${isTop3 ? 'text-primary' : 'text-foreground'}`}>
                        {percentage}%
                      </p>
                      <p className="text-sm font-medium text-muted-foreground">
                        {score.score} / {score.total} correct
                      </p>
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
