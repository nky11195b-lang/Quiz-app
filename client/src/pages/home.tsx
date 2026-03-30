import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Play, Loader2, ArrowRight } from "lucide-react";
import { Layout } from "@/components/layout";
import { useQuizzes, useCreateQuiz } from "@/hooks/use-quizzes";
import { useToast } from "@/hooks/use-toast";

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
          Master Any <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">Subject</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg md:text-xl text-muted-foreground mb-10"
        >
          Challenge yourself with our curated selection of quizzes. Expand your knowledge, track your progress, and compete for the top score.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <button 
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-foreground text-background font-semibold text-lg hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10 transition-all duration-300"
          >
            <Plus className="w-5 h-5" /> Create Quiz
          </button>
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
            <h3 className="text-xl font-display font-semibold mb-2">No quizzes found</h3>
            <p className="text-muted-foreground">Be the first to create one!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizzes.map((quiz, idx) => (
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
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 text-primary">
                      <Play className="w-6 h-6 ml-1" />
                    </div>
                    <h3 className="text-2xl font-display font-bold mb-3 line-clamp-1">{quiz.title}</h3>
                    <p className="text-muted-foreground flex-1 line-clamp-3 leading-relaxed">
                      {quiz.description || "Test your knowledge with this quiz."}
                    </p>
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
  const createQuiz = useCreateQuiz();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    createQuiz.mutate({ title, description }, {
      onSuccess: () => {
        toast({ title: "Quiz created!" });
        setTitle("");
        setDescription("");
        onClose();
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
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
            className="bg-card w-full max-w-lg rounded-[2rem] p-8 shadow-2xl border border-border relative z-10"
          >
            <h2 className="text-3xl font-display font-bold mb-6">New Quiz</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Title</label>
                <input 
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Advanced TypeScript"
                  className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Description</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe what this quiz is about..."
                  className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none resize-none h-32"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={onClose}
                  className="px-6 py-3 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createQuiz.isPending}
                  className="px-6 py-3 rounded-xl font-medium bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none flex items-center gap-2"
                >
                  {createQuiz.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Quiz"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
