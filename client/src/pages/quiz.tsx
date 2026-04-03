import { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Trophy, ArrowRight, ArrowLeft, Loader2, CheckCircle2,
  BarChart3, Coins, Clock, RefreshCw, Sparkles,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { useQuiz, fetchAiQuestions, fetchAiQuestionsCustom, fetchAiExplanation } from "@/hooks/use-quizzes";
import { useSubmitScore } from "@/hooks/use-scores";
import { useToast } from "@/hooks/use-toast";

type QuizState = "intro" | "loading" | "playing" | "submitting" | "results";

const TIMER_SECONDS = 10;

type SessionQuestion = {
  id: number;
  quizId: number;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
};

const CATEGORY_ICONS: Record<string, string> = {
  math: "📐",
  tech: "💻",
  general: "🌍",
};

export default function QuizPage({ params }: { params?: { id?: string } }) {
  const [, routeParams] = useRoute("/quiz/:id");
  const quizIdStr = params?.id || routeParams?.id;
  const quizId = quizIdStr ? parseInt(quizIdStr, 10) : 0;

  const { data: quiz, isLoading: isQuizLoading, error } = useQuiz(quizId);
  const submitScore = useSubmitScore();
  const { toast } = useToast();

  const [state, setState] = useState<QuizState>("intro");
  const [playerName, setPlayerName] = useState("");
  const [sessionQuestions, setSessionQuestions] = useState<SessionQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finalScore, setFinalScore] = useState({ score: 0, total: 0, coins: 0 });
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<number, string>>({});
  const [loadingExplainId, setLoadingExplainId] = useState<number | null>(null);

  // Timer for each question
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

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state, currentIdx]);

  // Auto-advance on time out
  useEffect(() => {
    if (!timedOut || state !== "playing") return;
    const t = setTimeout(() => {
      if (currentIdx < sessionQuestions.length - 1) {
        setCurrentIdx((i) => i + 1);
      } else {
        handleFinish();
      }
    }, 900);
    return () => clearTimeout(t);
  }, [timedOut]);

  // Confetti on results
  useEffect(() => {
    if (state === "results" && finalScore.total > 0) {
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

  if (isQuizLoading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground animate-pulse">Loading quiz...</p>
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

  const isCustomQuiz = !!(quiz?.classLevel && quiz?.subject && quiz?.topic);

  const loadQuestions = async () => {
    const result = isCustomQuiz
      ? await fetchAiQuestionsCustom(quiz.classLevel!, quiz.subject!, quiz.topic!, quiz.difficulty)
      : await fetchAiQuestions(quiz.category, quiz.difficulty);
    return result.questions.map((q, idx) => ({
      id: idx + 1,
      quizId: quiz.id,
      text: q.question,
      options: q.options,
      correctAnswerIndex: q.options.indexOf(q.answer),
      explanation: q.explanation,
    }));
  };

  const handleStart = async () => {
    if (!playerName.trim()) {
      toast({ title: "Enter your name", description: "Please enter a name before starting.", variant: "destructive" });
      return;
    }
    setState("loading");
    try {
      const mapped = await loadQuestions();
      setSessionQuestions(mapped);
      setCurrentIdx(0);
      setAnswers({});
      setAiExplanations({});
      setState("playing");
    } catch {
      setState("intro");
      toast({ title: "Could not load questions", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleExplain = async (q: SessionQuestion) => {
    if (aiExplanations[q.id] || loadingExplainId === q.id) return;
    const correctAnswer = q.options[q.correctAnswerIndex];
    if (q.explanation) {
      setAiExplanations((prev) => ({ ...prev, [q.id]: q.explanation! }));
      return;
    }
    setLoadingExplainId(q.id);
    try {
      const explanation = await fetchAiExplanation(q.text, correctAnswer);
      setAiExplanations((prev) => ({ ...prev, [q.id]: explanation }));
    } catch {
      setAiExplanations((prev) => ({ ...prev, [q.id]: `The correct answer is "${correctAnswer}". Review this topic to understand why.\n\nसही उत्तर "${correctAnswer}" है। इस विषय को दोबारा पढ़ें।` }));
    } finally {
      setLoadingExplainId(null);
    }
  };

  const handleSelectOption = (optionIdx: number) => {
    if (timedOut) return;
    const q = sessionQuestions[currentIdx];
    if (answers[q.id] !== undefined) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setAnswers((prev) => ({ ...prev, [q.id]: optionIdx }));
  };

  const handleNext = () => {
    if (currentIdx < sessionQuestions.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState("submitting");
    let correct = 0;
    sessionQuestions.forEach((q) => {
      if (answers[q.id] === q.correctAnswerIndex) correct++;
    });
    const total = sessionQuestions.length;
    const coins = correct * 10;

    try {
      await submitScore.mutateAsync({
        quizId: quiz.id,
        playerName: playerName.trim() || "Anonymous",
        score: correct,
        total,
        coinsEarned: coins,
      });
      setFinalScore({ score: correct, total, coins });
      setState("results");
    } catch (err: any) {
      toast({ title: "Failed to submit score", description: err.message, variant: "destructive" });
      setState("playing");
    }
  };

  const handlePlayAgain = async () => {
    setState("loading");
    try {
      const mapped = await loadQuestions();
      setSessionQuestions(mapped);
      setCurrentIdx(0);
      setAnswers({});
      setAiExplanations({});
      setFinalScore({ score: 0, total: 0, coins: 0 });
      setState("playing");
    } catch {
      setState("results");
    }
  };

  const currentQuestion = sessionQuestions[currentIdx];
  const timerPct = (timeLeft / TIMER_SECONDS) * 100;
  const timerColor = timeLeft > 6 ? "bg-emerald-500" : timeLeft > 3 ? "bg-amber-500" : "bg-red-500";

  const liveCoins = sessionQuestions.slice(0, currentIdx).reduce((acc, q) => {
    return acc + (answers[q.id] === q.correctAnswerIndex ? 10 : 0);
  }, 0);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full pt-8">
        <AnimatePresence mode="wait">

          {/* INTRO */}
          {state === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="bg-card rounded-[2rem] p-10 md:p-16 text-center shadow-xl border border-border/60"
            >
              <div className="text-6xl mb-6">{CATEGORY_ICONS[quiz.category] || "📝"}</div>
              <h1 className="text-4xl md:text-5xl font-display font-bold mb-3">{quiz.title}</h1>
              <p className="text-muted-foreground mb-2">{quiz.description}</p>

              <div className="flex flex-wrap justify-center gap-3 mb-8 mt-4">
                {quiz.classLevel && (
                  <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                    Class {quiz.classLevel}
                  </span>
                )}
                {quiz.subject && (
                  <span className="px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 text-sm font-semibold">
                    {quiz.subject}
                  </span>
                )}
                {quiz.topic && (
                  <span className="px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> {quiz.topic}
                  </span>
                )}
                <span className={`px-3 py-1.5 rounded-full text-sm font-semibold capitalize
                  ${quiz.difficulty === "easy" ? "bg-emerald-100 text-emerald-700" :
                    quiz.difficulty === "medium" ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"}`}>
                  {quiz.difficulty}
                </span>
                <span className="px-3 py-1.5 rounded-full bg-muted text-sm font-medium flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> 10s per question
                </span>
                <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-sm font-medium flex items-center gap-1.5">
                  <Coins className="w-4 h-4" /> +10 coins per correct
                </span>
                <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  10 questions
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
                  <BarChart3 className="w-5 h-5" /> Scores
                </Link>
              </div>
            </motion.div>
          )}

          {/* LOADING QUESTIONS */}
          {state === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center min-h-[50vh]"
            >
              <div className="relative mb-6">
                <Loader2 className="w-14 h-14 animate-spin text-primary" />
                <Sparkles className="w-5 h-5 text-amber-500 absolute -top-1 -right-1" />
              </div>
              <p className="font-semibold text-lg">{isCustomQuiz ? "Generating quiz with AI..." : "Loading quiz..."}</p>
              <p className="text-muted-foreground text-sm mt-1">
                {isCustomQuiz ? `Preparing ${quiz?.topic} questions for you` : "Generating your questions, just a moment"}
              </p>
            </motion.div>
          )}

          {/* PLAYING */}
          {(state === "playing" || state === "submitting") && currentQuestion && (
            <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
              {/* Progress */}
              <div className="mb-4">
                <div className="flex justify-between text-sm font-medium text-muted-foreground mb-2">
                  <span>Question {currentIdx + 1} of {sessionQuestions.length}</span>
                  <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                    <Coins className="w-4 h-4" /> {liveCoins} coins
                  </span>
                </div>
                <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    animate={{ width: `${(currentIdx / sessionQuestions.length) * 100}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>

              {/* Timer */}
              <div className="mb-5">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className={`font-bold flex items-center gap-1 ${timeLeft <= 3 ? "text-red-500" : "text-muted-foreground"}`}>
                    <Clock className="w-4 h-4" /> {timeLeft}s
                  </span>
                  {timedOut && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-red-500 font-semibold bg-red-50 px-2 py-0.5 rounded-full text-xs"
                    >
                      Time&apos;s up!
                    </motion.span>
                  )}
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${timerColor}`}
                    style={{ width: `${timerPct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Question card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIdx}
                  initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.22 }}
                  className="bg-card rounded-[2rem] p-8 md:p-10 shadow-xl border border-border/60 relative overflow-hidden"
                >
                  {state === "submitting" && (
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-[2rem]">
                      <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                      <p className="font-semibold text-lg">Calculating your score...</p>
                    </div>
                  )}

                  <h2 className="text-2xl md:text-3xl font-display font-semibold mb-8 leading-relaxed">
                    {currentQuestion.text}
                  </h2>

                  <div className="space-y-3 mb-8">
                    {currentQuestion.options.map((opt: string, idx: number) => {
                      const selected = answers[currentQuestion.id] === idx;
                      const answered = answers[currentQuestion.id] !== undefined || timedOut;
                      const isCorrect = idx === currentQuestion.correctAnswerIndex;

                      let btnClass = "border-border bg-card hover:border-primary/40 hover:bg-muted/50 cursor-pointer";
                      if (answered && isCorrect) btnClass = "border-emerald-500 bg-emerald-50 cursor-default";
                      else if (answered && selected && !isCorrect) btnClass = "border-red-400 bg-red-50 cursor-default";
                      else if (selected) btnClass = "border-primary bg-primary/5 cursor-default";
                      else if (answered) btnClass = "border-border/40 bg-muted/30 cursor-default opacity-60";

                      let dotClass = "border-muted-foreground/30 text-muted-foreground";
                      if (answered && isCorrect) dotClass = "border-emerald-500 bg-emerald-500 text-white";
                      else if (answered && selected && !isCorrect) dotClass = "border-red-400 bg-red-400 text-white";
                      else if (selected) dotClass = "border-primary bg-primary text-primary-foreground";

                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelectOption(idx)}
                          disabled={answered}
                          className={`w-full text-left p-5 rounded-2xl border-2 transition-all duration-200 flex items-center gap-4 ${btnClass}`}
                        >
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm flex-shrink-0 transition-all ${dotClass}`}>
                            {String.fromCharCode(65 + idx)}
                          </div>
                          <span className={`text-base flex-1 ${selected || (answered && isCorrect) ? "font-semibold" : ""}`}>{opt}</span>
                          {answered && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
                          {answered && selected && !isCorrect && (
                            <span className="text-red-400 text-lg flex-shrink-0">✗</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Explain with AI — shown only after a wrong answer or timeout */}
                  {(answers[currentQuestion.id] !== undefined || timedOut) &&
                   (timedOut || answers[currentQuestion.id] !== currentQuestion.correctAnswerIndex) && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="mb-6"
                    >
                      {!aiExplanations[currentQuestion.id] ? (
                        <button
                          data-testid="button-explain-ai"
                          onClick={() => handleExplain(currentQuestion)}
                          disabled={loadingExplainId === currentQuestion.id}
                          className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border-2 border-amber-300 bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100 transition-all disabled:opacity-60"
                        >
                          {loadingExplainId === currentQuestion.id ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> AI is explaining...</>
                          ) : (
                            <><Sparkles className="w-4 h-4" /> Explain with AI</>
                          )}
                        </button>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          className="bg-amber-50 border border-amber-200 rounded-2xl p-5"
                        >
                          <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-2 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" /> AI Explanation
                          </p>
                          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                            {aiExplanations[currentQuestion.id]}
                          </p>
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {(answers[currentQuestion.id] !== undefined || timedOut) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="flex justify-between items-center pt-5 border-t border-border/40"
                    >
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
                        {currentIdx === sessionQuestions.length - 1 ? "Finish" : "Next"} <ArrowRight className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}

          {/* RESULTS */}
          {state === "results" && (
            <motion.div
              key="results"
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="bg-card rounded-[2rem] p-10 md:p-16 text-center shadow-2xl border border-border max-w-xl mx-auto"
            >
              <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-amber-500/20">
                <Trophy className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-4xl font-display font-bold mb-2">Quiz Complete!</h2>
              <p className="text-muted-foreground mb-6">
                Well done, <span className="font-semibold text-foreground">{playerName}</span>!
              </p>

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

                <div className="flex justify-center gap-1 flex-wrap mt-2">
                  {sessionQuestions.map((q) => {
                    const correct = answers[q.id] === q.correctAnswerIndex;
                    return (
                      <div
                        key={q.id}
                        title={correct ? "Correct" : "Incorrect"}
                        className={`w-4 h-4 rounded-full ${correct ? "bg-emerald-500" : "bg-red-300"}`}
                      />
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Green = correct • Red = incorrect</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
                <button
                  onClick={handlePlayAgain}
                  className="px-5 py-3 rounded-xl border-2 border-primary text-primary font-semibold hover:bg-primary/5 transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Play Again
                </button>
                <Link href="/leaderboard" className="px-5 py-3 rounded-xl bg-amber-500 text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-2">
                  <Trophy className="w-4 h-4" /> Leaderboard
                </Link>
                <Link href="/" className="px-5 py-3 rounded-xl bg-muted text-foreground font-semibold hover:bg-muted/80 transition-colors">
                  Home
                </Link>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </Layout>
  );
}
