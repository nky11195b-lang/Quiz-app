import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Play, Loader2, ArrowRight, Trophy, X, Star, Zap, Brain } from "lucide-react";
import { Layout } from "@/components/layout";
import { useQuizzes, useGenerateQuiz } from "@/hooks/use-quizzes";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_OPTIONS = [
  { value: "math", label: "Math", icon: "📐", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "tech", label: "Technology", icon: "💻", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "general", label: "General Knowledge", icon: "🌍", color: "bg-green-100 text-green-700 border-green-200" },
] as const;

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy", icon: <Star className="w-4 h-4" />, color: "bg-emerald-100 text-emerald-700 border-emerald-200", description: "Great for beginners" },
  { value: "medium", label: "Medium", icon: <Zap className="w-4 h-4" />, color: "bg-amber-100 text-amber-700 border-amber-200", description: "Balanced challenge" },
  { value: "hard", label: "Hard", icon: <Brain className="w-4 h-4" />, color: "bg-red-100 text-red-700 border-red-200", description: "Expert level" },
] as const;

const CATEGORY_ICONS: Record<string, string> = {
  math: "📐",
  tech: "💻",
  general: "🌍",
};

export default function Home() {
  const { data: quizzes, isLoading } = useQuizzes();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <Layout>
      <div className="text-center py-16 md:py-24 max-w-3xl mx-auto">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-5xl md:text-7xl font-extrabold tracking-tight text-foreground mb-6 leading-tight"
        >
          Master Any{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">
            Subject
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg md:text-xl text-muted-foreground mb-10"
        >
          Challenge yourself with dynamically generated quizzes. Earn coins, track your progress, and compete on the leaderboard!
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-foreground text-background font-semibold text-lg hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10 transition-all duration-300"
          >
            <Plus className="w-5 h-5" /> Create Quiz
          </button>
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl border-2 border-border font-semibold text-lg hover:bg-muted transition-colors"
          >
            <Trophy className="w-5 h-5 text-amber-500" /> Global Leaderboard
          </Link>
        </motion.div>
      </div>

      <div className="space-y-8">
        <div className="flex items-center justify-between border-b border-border/50 pb-4">
          <h2 className="text-2xl font-display font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" /> Available Quizzes
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !quizzes || quizzes.length === 0 ? (
          <div className="text-center py-20 bg-muted/30 rounded-3xl border border-border border-dashed">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-display font-semibold mb-2">No quizzes yet</h3>
            <p className="text-muted-foreground mb-6">Create your first quiz to get started!</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium"
            >
              <Plus className="w-4 h-4" /> Create Quiz
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizzes.map((quiz: any, idx: number) => (
              <motion.div
                key={quiz.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Link href={`/quiz/${quiz.id}`} className="block group h-full">
                  <div className="bg-card rounded-3xl p-8 border border-border/60 shadow-lg shadow-black/5 hover:shadow-xl hover:border-primary/30 transition-all duration-300 h-full flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <ArrowRight className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300">
                        {CATEGORY_ICONS[quiz.category] || "📝"}
                      </div>
                      <div className="flex flex-col gap-1">
                        {quiz.category && (
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {quiz.category}
                          </span>
                        )}
                        {quiz.difficulty && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block w-fit
                            ${quiz.difficulty === "easy" ? "bg-emerald-100 text-emerald-700" :
                              quiz.difficulty === "medium" ? "bg-amber-100 text-amber-700" :
                              "bg-red-100 text-red-700"}`}>
                            {quiz.difficulty}
                          </span>
                        )}
                      </div>
                    </div>
                    <h3 className="text-xl font-display font-bold mb-3 line-clamp-2">{quiz.title}</h3>
                    <p className="text-muted-foreground flex-1 line-clamp-2 leading-relaxed text-sm">
                      {quiz.description || "Test your knowledge with this quiz."}
                    </p>
                    <div className="mt-4 pt-4 border-t border-border/40 flex items-center gap-2 text-sm text-muted-foreground">
                      <Play className="w-4 h-4" />
                      <span>10 questions • 10s timer</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <CreateQuizModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </Layout>
  );
}

function CreateQuizModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const generateQuiz = useGenerateQuiz();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"math" | "tech" | "general">("general");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    generateQuiz.mutate({ title, category, difficulty }, {
      onSuccess: () => {
        toast({ title: "Quiz created!", description: "10 questions have been generated." });
        setTitle("");
        setCategory("general");
        setDifficulty("medium");
        onClose();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      },
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-card w-full max-w-lg rounded-[2rem] p-8 shadow-2xl border border-border relative z-10 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-display font-bold">New Quiz</h2>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Quiz Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. My Math Challenge"
                  className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">Category</label>
                <div className="grid grid-cols-3 gap-3">
                  {CATEGORY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCategory(opt.value)}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        category === opt.value
                          ? opt.color + " border-current shadow-sm scale-[1.02]"
                          : "border-border hover:border-primary/40 hover:bg-muted/50"
                      }`}
                    >
                      <div className="text-2xl mb-1">{opt.icon}</div>
                      <div className="text-xs font-semibold">{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">Difficulty</label>
                <div className="grid grid-cols-3 gap-3">
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDifficulty(opt.value)}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        difficulty === opt.value
                          ? opt.color + " border-current shadow-sm scale-[1.02]"
                          : "border-border hover:border-primary/40 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex justify-center mb-1">{opt.icon}</div>
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">What you'll get:</p>
                <p>10 random questions from our {
                  CATEGORY_OPTIONS.find(c => c.value === category)?.label
                } bank at {difficulty} difficulty. Each correct answer earns <strong>10 coins</strong>!</p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generateQuiz.isPending}
                  className="px-6 py-3 rounded-xl font-medium bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none flex items-center gap-2"
                >
                  {generateQuiz.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Generate Quiz</>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
