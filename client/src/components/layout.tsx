import { Link } from "wouter";
import { Brain, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-50 glass-panel border-b-border/50">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group transition-opacity hover:opacity-80">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 blur-lg rounded-full group-hover:bg-primary/40 transition-colors" />
              <div className="relative bg-gradient-to-br from-primary to-primary/80 p-2.5 rounded-2xl text-white shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
                <Brain className="w-6 h-6" />
              </div>
            </div>
            <span className="font-display font-bold text-2xl tracking-tight text-foreground flex items-center gap-1">
              QuizNova <Sparkles className="w-4 h-4 text-primary" />
            </span>
          </Link>
          
          <nav className="hidden sm:flex gap-6 items-center">
            <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Explore Quizzes
            </Link>
          </nav>
        </div>
      </header>
      
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-12 flex flex-col">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex-1 flex flex-col"
        >
          {children}
        </motion.div>
      </main>
      
      <footer className="py-8 text-center text-muted-foreground text-sm">
        <p>© {new Date().getFullYear()} QuizNova. Designed with minimal elegance.</p>
      </footer>
    </div>
  );
}
