import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Sparkles, Eye, EyeOff, Loader2, Mail, Lock, User, ArrowRight, Check, X } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { useAuth } from "@/context/auth-context";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

type Rule = { label: string; pass: boolean };

function getPasswordRules(pw: string): Rule[] {
  return [
    { label: "At least 8 characters", pass: pw.length >= 8 },
    { label: "One uppercase letter (A-Z)", pass: /[A-Z]/.test(pw) },
    { label: "One lowercase letter (a-z)", pass: /[a-z]/.test(pw) },
    { label: "One number (0-9)", pass: /[0-9]/.test(pw) },
    { label: "One special character (!@#$…)", pass: /[^A-Za-z0-9]/.test(pw) },
  ];
}

function StrengthBar({ rules }: { rules: Rule[] }) {
  const passed = rules.filter((r) => r.pass).length;
  const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-green-500"];
  const color = colors[passed - 1] ?? "bg-muted";
  return (
    <div className="flex gap-1 mt-2">
      {rules.map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < passed ? color : "bg-muted"}`}
        />
      ))}
    </div>
  );
}

export default function AuthPage() {
  const { user, isLoading, login, signup } = useAuth();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rules = useMemo(() => getPasswordRules(password), [password]);
  const allRulesPassed = rules.every((r) => r.pass);

  // Read error from URL (e.g. ?error=google_failed set by the server)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error");
    if (urlError === "google_failed") {
      setError("Google sign-in failed. Please try again or use email/password.");
      params.delete("error");
      const clean = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (clean ? `?${clean}` : ""));
    }
  }, []);

  // Check if Google OAuth is configured on the server
  const { data: googleStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/auth/google/status"],
    staleTime: Infinity,
  });
  const googleEnabled = googleStatus?.enabled ?? false;

  useEffect(() => {
    if (!isLoading && user) navigate("/");
  }, [user, isLoading, navigate]);

  const handleModeSwitch = (m: "login" | "signup") => {
    setMode(m);
    setError("");
    setPassword("");
    setShowRules(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "signup" && !allRulesPassed) {
      setShowRules(true);
      setError("Please make sure your password meets all requirements.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(name, email, password);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-br from-background via-background to-primary/5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 blur-lg rounded-full" />
              <div className="relative bg-gradient-to-br from-primary to-primary/80 p-3 rounded-2xl text-white shadow-lg shadow-primary/20">
                <Brain className="w-7 h-7" />
              </div>
            </div>
            <span className="font-display font-bold text-3xl tracking-tight text-foreground flex items-center gap-1">
              QuizNova <Sparkles className="w-5 h-5 text-primary" />
            </span>
          </div>
          <p className="text-muted-foreground text-sm">AI-powered quiz platform for students</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-[2rem] p-8 shadow-2xl border border-border/60">
          {/* Tab switcher */}
          <div className="flex bg-muted rounded-xl p-1 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                data-testid={`tab-${m}`}
                onClick={() => handleModeSwitch(m)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Google button */}
          {googleEnabled ? (
            <a
              href="/api/auth/google"
              data-testid="button-google-login"
              className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border-2 border-border bg-background hover:bg-muted hover:border-primary/40 transition-all font-semibold text-sm mb-4"
            >
              <SiGoogle className="w-4 h-4 text-[#4285F4]" />
              Continue with Google
            </a>
          ) : (
            <div
              data-testid="button-google-disabled"
              title="Google login is not configured yet"
              className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border-2 border-border bg-muted/50 text-muted-foreground font-semibold text-sm mb-4 cursor-not-allowed select-none"
            >
              <SiGoogle className="w-4 h-4" />
              Continue with Google
              <span className="text-xs font-normal">(coming soon)</span>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground font-medium">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              initial={{ opacity: 0, x: mode === "login" ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === "login" ? 12 : -12 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {mode === "signup" && (
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      data-testid="input-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      required
                      minLength={2}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    data-testid="input-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    data-testid="input-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (mode === "signup") setShowRules(true);
                    }}
                    onFocus={() => { if (mode === "signup") setShowRules(true); }}
                    placeholder={mode === "signup" ? "Min. 8 characters" : "Your password"}
                    required
                    minLength={mode === "signup" ? 8 : 1}
                    className="w-full pl-10 pr-12 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password strength indicator (signup only) */}
                <AnimatePresence>
                  {mode === "signup" && showRules && password.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <StrengthBar rules={rules} />
                      <ul className="mt-2.5 space-y-1" data-testid="password-rules">
                        {rules.map((rule) => (
                          <li key={rule.label} className="flex items-center gap-2 text-xs">
                            {rule.pass ? (
                              <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            ) : (
                              <X className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            )}
                            <span className={rule.pass ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                              {rule.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  data-testid="text-auth-error"
                  className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
                >
                  {error}
                </motion.p>
              )}

              <button
                data-testid="button-auth-submit"
                type="submit"
                disabled={submitting || (mode === "signup" && showRules && !allRulesPassed && password.length > 0)}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-purple-500 text-white font-semibold text-base hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 mt-2"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {mode === "login" ? "Logging in..." : "Creating account..."}</>
                ) : (
                  <>{mode === "login" ? "Log In" : "Create Account"} <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </motion.form>
          </AnimatePresence>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => handleModeSwitch(mode === "login" ? "signup" : "login")}
              className="text-primary font-semibold hover:underline"
            >
              {mode === "login" ? "Sign up free" : "Log in"}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Your password is hashed with bcrypt and never stored in plain text.
        </p>
      </motion.div>
    </div>
  );
}
