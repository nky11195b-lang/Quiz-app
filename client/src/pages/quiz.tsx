import { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Trophy, ArrowRight, ArrowLeft, Loader2, CheckCircle2, BarChart3, Coins, Clock, Star } from "lucide-react";
import { Layout } from "@/components/layout";
import { useQuiz } from "@/hooks/use-quizzes";
import { useSubmitScore } from "@/hooks/use-scores";
import { useToast } from "@/hooks/use-toast";

type QuizState = "intro" | "playing" | "submitting" | "results";

const TIMER_SECONDS = 10;

export default function QuizPage({ params }: { params?: { id?: string } }) {
  const [, routeParams] = useRoute("/quiz/:id");
  const quizIdStr = params?.id || routeParams?.id;
  const quizId = quizIdStr ? parseInt(quizIdStr, 10) : 0;

  const { data: quiz, isLoading, error } = useQuiz(quizId);
  const submitScore = useSubmitScore();
  const { toast } = useToast();

  const [state, setState] = useState<QuizState>("intro");
  const [playerName, setPlayerName] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finalScore, setFinalScore] = useState({ score: 0, total: 0, coins: 0 });
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer logic
  useEffect(() => {
    if (state !== "playing") return;
    setTimeLeft(TIMER_SECONDS);
    setTimedOut(false);

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          setTimedOut(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state, currentIdx]);

  // Auto-advance on time out
  useEffect(() => {
    if (!timedOut || state !== "playing") return;
    const t = setTimeout(() => {
      if (currentIdx < (quiz?.questions?.length ?? 0) - 1) {
        setCurrentIdx((i) => i + 1);
      } else {
        handleFinish();
      }
    }, 800);
    return () => clearTimeout(t);
  }, [timedOut]);

  useEffect(() => {
    if (state === "results") {
      const pct = finalScore.score / finalScore.total;
      if (pct >= 0.5) {
        confetti({
          particleCount: 180,
          spread: 90,
          origin: { y: 0.6 },
          colors: ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"],
        });
      }
    }
  }, [state]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground animate-pulse">Preparing your quiz...</p>
        </div>
      </Layout>
    );
  }

  if (error || !quiz) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-3xl font-display font-bold mb-4">Quiz not found</h2>
          <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back Home
          </Link>
        </div>
      </Layout>
    );
  }

  const handleStart = () => {
    if (!playerName.trim()) {
      toast({ title: "Enter your name", description: "Please enter a name before starting.", variant: "destructive" });
      return;
    }
    setState("playing");
    setCurrentIdx(0);
    setAnswers({});
  };

  const handleSelectOption = (optionIdx: number) => {
    if (timedOut) return;
    const q = quiz.questions[currentIdx];
    if (answers[q.id] !== undefined) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setAnswers((prev) => ({ ...prev, [q.id]: optionIdx }));
  };

  const handleNext = () => {
    if (currentIdx < quiz.questions.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState("submitting");
    let correctCount = 0;
    quiz.questions.forEach((q: any) => {
      if (answers[q.id] === q.correctAnswerIndex) correctCount++;
    });
    const total = quiz.questions.length;
    const coins = correctCount * 10;

    try {
      await submitScore.mutateAsync({
        quizId: quiz.id,
        playerName: playerName.trim() || "Anonymous",
        score: correctCount,
        total,
        coinsEarned: coins,
      });
      setFinalScore({ score: correctCount, total, coins });
      setState("results");
    } catch (err: any) {
      toast({ title: "Failed to submit score", description: err.message, variant: "destructive" });
      setState("playing");
    }
  };

  const currentQuestion = quiz.questions[currentIdx];
  const timerPct = (timeLeft / TIMER_SECONDS) * 100;
  const timerColor = timeLeft > 6 ? "bg-emerald-500" : timeLeft > 3 ? "bg-amber-500" : "bg-red-500";

  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full pt-8">
        <AnimatePresence mode="wait">
          {/* INTRO */}
          {state === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-card rounded-[2rem] p-10 md:p-16 text-center shadow-xl border border-border/60"
            >
              <div className="w-20 h-20 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mx-auto mb-8">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold mb-3">{quiz.title}</h1>
              <p className="text-muted-foreground mb-2">{quiz.description}</p>

              <div className="flex flex-wrap justify-center gap-3 mb-8 mt-4">
                <span className="px-3 py-1.5 rounded-full bg-muted text-sm font-medium flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> 10s per question
                </span>
                <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-sm font-medium flex items-center gap-1.5">
                  <Coins className="w-4 h-4" /> +10 coins per correct answer
                </span>
                <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  {quiz.questions.length} questions
                </span>
              </div>

              <div className="max-w-xs mx-auto mb-8">
                <label className="block text-sm font-semibold text-foreground mb-2 text-left">Your Name</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name..."
                  maxLength={30}
                  className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-center font-semibold"
                  onKeyDown={(e) => e.key === "Enter" && handleStart()}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={handleStart}
                  className="px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
                >
                  Start Quiz <ArrowRight className="w-5 h-5" />
                </button>
                <Link
                  href={`/quiz/${quiz.id}/leaderboard`}
                  className="px-8 py-4 rounded-xl bg-muted text-foreground font-semibold text-lg hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
                >
                  <BarChart3 className="w-5 h-5" /> Leaderboard
                </Link>
              </div>
            </motion.div>
          )}

          {/* PLAYING */}
          {(state === "playing" || state === "submitting") && (
            <motion.div key="playing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full">
              {/* Progress bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm font-medium text-muted-foreground mb-2">
                  <span>Question {currentIdx + 1} of {quiz.questions.length}</span>
                  <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                    <Coins className="w-4 h-4" />
                    {Object.entries(answers).filter(([qId, ans]) => {
                      const q = quiz.questions.find((q: any) => q.id === Number(qId));
                      return q && ans === q.correctAnswerIndex;
                    }).length * 10} coins so far
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    animate={{ width: `${((currentIdx) / quiz.questions.length) * 100}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>

              {/* Timer */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className={`font-bold flex items-center gap-1 ${timeLeft <= 3 ? "text-red-500" : "text-muted-foreground"}`}>
                    <Clock className="w-4 h-4" /> {timeLeft}s
                  </span>
                  {timedOut && <span className="text-red-500 font-semibold text-sm">Time's up!</span>}
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full transition-colors ${timerColor}`}
                    animate={{ width: `${timerPct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Question Card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIdx}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.25 }}
                  className="bg-card rounded-[2rem] p-8 md:p-12 shadow-xl border border-border/60 relative overflow-hidden"
                >
                  {state === "submitting" && (
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
                      <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                      <p className="font-semibold text-lg">Calculating score...</p>
                    </div>
                  )}
                  <h2 className="text-2xl md:text-3xl font-display font-semibold mb-8 leading-relaxed">
                    {currentQuestion.text}
                  </h2>

                  <div className="space-y-4 mb-8">
                    {currentQuestion.options.map((opt: string, idx: number) => {
                      const selected = answers[currentQuestion.id] === idx;
                      const answered = answers[currentQuestion.id] !== undefined || timedOut;
                      const isCorrect = idx === currentQuestion.correctAnswerIndex;
                      const showResult = answered;

                      let btnClass = "border-border bg-card hover:border-primary/40 hover:bg-muted/50";
                      if (showResult && isCorrect) btnClass = "border-emerald-500 bg-emerald-50";
                      else if (showResult && selected && !isCorrect) btnClass = "border-red-400 bg-red-50";
                      else if (selected) btnClass = "border-primary bg-primary/5 shadow-[0_0_0_4px_rgba(59,130,246,0.1)]";

                      let dotClass = "border-muted-foreground/30 text-muted-foreground";
                      if (showResult && isCorrect) dotClass = "border-emerald-500 bg-emerald-500 text-white";
                      else if (showResult && selected && !isCorrect) dotClass = "border-red-400 bg-red-400 text-white";
                      else if (selected) dotClass = "border-primary bg-primary text-primary-foreground";

                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelectOption(idx)}
                          disabled={answered}
                          className={`w-full text-left p-5 rounded-2xl border-2 transition-all duration-200 flex items-center gap-4 disabled:cursor-default ${btnClass}`}
                        >
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm flex-shrink-0 transition-colors ${dotClass}`}>
                            {String.fromCharCode(65 + idx)}
                          </div>
                          <span className={`text-base flex-1 ${selected ? "font-semibold" : ""}`}>{opt}</span>
                          {showResult && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {(answers[currentQuestion.id] !== undefined || timedOut) && (
                    <div className="flex justify-between items-center pt-6 border-t border-border/40">
                      <button
                        onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                        disabled={currentIdx === 0}
                        className="px-5 py-2.5 font-medium text-muted-foreground disabled:opacity-30 hover:text-foreground transition-colors flex items-center gap-2"
                      >
                        <ArrowLeft className="w-4 h-4" /> Previous
                      </button>
                      <button
                        onClick={handleNext}
                        className="px-7 py-3 rounded-xl bg-foreground text-background font-semibold hover:-translate-y-0.5 hover:shadow-lg transition-all flex items-center gap-2"
                      >
                        {currentIdx === quiz.questions.length - 1 ? "Finish" : "Next"} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}

          {/* RESULTS */}
          {state === "results" && (
            <motion.div
              key="results"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="bg-card rounded-[2rem] p-10 md:p-16 text-center shadow-2xl border border-border max-w-xl mx-auto"
            >
              <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-amber-500/20">
                <Trophy className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-4xl font-display font-bold mb-2">Quiz Complete!</h2>
              <p className="text-muted-foreground mb-6">Well done, <span className="font-semibold text-foreground">{playerName}</span>!</p>

              <div className="py-6 my-6 border-y border-border space-y-4">
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Final Score</p>
                  <div className="text-6xl font-display font-extrabold text-primary">
                    {Math.round((finalScore.score / finalScore.total) * 100)}%
                  </div>
                  <p className="text-muted-foreground mt-2 font-medium">
                    {finalScore.score} out of {finalScore.total} correct
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-center gap-3">
                  <Coins className="w-7 h-7 text-amber-600" />
                  <div className="text-left">
                    <p className="text-sm text-amber-700 font-medium">Coins Earned</p>
                    <p className="text-3xl font-display font-extrabold text-amber-600">+{finalScore.coins}</p>
                  </div>
                </div>

                <div className="flex justify-center gap-1 mt-2">
                  {quiz.questions.map((q: any) => {
                    const correct = answers[q.id] === q.correctAnswerIndex;
                    return (
                      <div
                        key={q.id}
                        className={`w-4 h-4 rounded-full ${correct ? "bg-emerald-500" : "bg-red-300"}`}
                        title={correct ? "Correct" : "Wrong"}
                      />
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Green = correct, Red = incorrect</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/" className="px-6 py-3 rounded-xl border-2 border-border font-semibold hover:bg-muted transition-colors">
                  Back Home
                </Link>
                <Link href="/leaderboard" className="px-6 py-3 rounded-xl bg-amber-500 text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-2">
                  <Trophy className="w-4 h-4" /> Global Leaderboard
                </Link>
                <Link href={`/quiz/${quiz.id}/leaderboard`} className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 transition-all">
                  Quiz Scores
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
