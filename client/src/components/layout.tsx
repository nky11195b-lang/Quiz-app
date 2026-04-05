import { Link } from "wouter";
import { Brain, Sparkles, Coins, LogOut, LogIn, User } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/auth-context";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();

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
            <span className="font-display font-bold text-xl tracking-tight text-foreground flex items-center gap-1">
              Bihar Battle Quiz <Sparkles className="w-4 h-4 text-primary" />
            </span>
          </Link>

          <nav className="flex gap-4 items-center">
            <Link href="/" className="hidden sm:block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Explore Quizzes
            </Link>

            {!isLoading && (
              <>
                {user ? (
                  <div className="flex items-center gap-3">
                    <div
                      data-testid="display-user-coins"
                      className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold"
                    >
                      <Coins className="w-4 h-4" />
                      {user.coins}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm font-medium">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span data-testid="display-user-name" className="max-w-[100px] truncate">
                        {user.name}
                      </span>
                    </div>
                    <button
                      data-testid="button-logout"
                      onClick={logout}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted hover:bg-red-100 hover:text-red-600 text-sm font-medium transition-colors"
                      title="Log out"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="hidden sm:inline">Log out</span>
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/auth"
                    data-testid="link-login"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 transition-all"
                  >
                    <LogIn className="w-4 h-4" />
                    Log In
                  </Link>
                )}
              </>
            )}
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
        <p>© {new Date().getFullYear()} Bihar Battle Quiz. Master Any Subject 🚀</p>
      </footer>
    </div>
  );
}
