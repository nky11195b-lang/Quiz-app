import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Trophy, ArrowRight, ArrowLeft, Loader2, CheckCircle2, ListOrdered, BarChart3 } from "lucide-react";
import { Layout } from "@/components/layout";
import { useQuiz } from "@/hooks/use-quizzes";
import { useSubmitScore } from "@/hooks/use-scores";
import { useToast } from "@/hooks/use-toast";

type QuizState = 'intro' | 'playing' | 'submitting' | 'results';

export default function QuizPage({ params }: { params?: { id?: string } }) {
  // If params comes from props (Wouter v3 component={}), use it. 
  // Otherwise fallback to useRoute hook.
  const [match, routeParams] = useRoute("/quiz/:id");
  const quizIdStr = params?.id || routeParams?.id;
  const quizId = quizIdStr ? parseInt(quizIdStr, 10) : 0;

  const { data: quiz, isLoading, error } = useQuiz(quizId);
  const submitScore = useSubmitScore();
  const { toast } = useToast();

  const [state, setState] = useState<QuizState>('intro');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finalScore, setFinalScore] = useState({ score: 0, total: 0 });

  useEffect(() => {
    if (state === 'results') {
      const percentage = finalScore.score / finalScore.total;
      if (percentage >= 0.5) {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b']
        });
      }
    }
  }, [state, finalScore]);

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
          <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-3xl font-display font-bold mb-4">Quiz not found</h2>
          <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline font-medium">
            <ArrowLeft className="w-4 h-4" /> Back to Explore
          </Link>
        </div>
      </Layout>
    );
  }

  const handleStart = () => setState('playing');

  const handleSelectOption = (optionIdx: number) => {
    const q = quiz.questions[currentIdx];
    setAnswers(prev => ({ ...prev, [q.id]: optionIdx }));
  };

  const handleNext = () => {
    if (currentIdx < quiz.questions.length - 1) {
      setCurrentIdx(curr => curr + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    setState('submitting');
    let correctCount = 0;
    const total = quiz.questions.length;
    
    quiz.questions.forEach(q => {
      if (answers[q.id] === q.correctAnswerIndex) {
        correctCount++;
      }
    });

    try {
      await submitScore.mutateAsync({
        quizId: quiz.id,
        score: correctCount,
        total: total
      });
      setFinalScore({ score: correctCount, total });
      setState('results');
    } catch (err: any) {
      toast({ title: "Failed to submit score", description: err.message, variant: "destructive" });
      setState('playing'); // Let them try again
    }
  };

  if (quiz.questions.length === 0) {
    return (
      <Layout>
        <div className="text-center py-24 bg-card rounded-3xl border border-border shadow-lg">
          <ListOrdered className="w-16 h-16 mx-auto text-muted-foreground mb-6 opacity-30" />
          <h2 className="text-3xl font-display font-bold mb-4">No Questions Yet</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">This quiz is empty. Please check back later when questions have been added.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <ArrowLeft className="w-5 h-5" /> Return Home
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full pt-8">
        <AnimatePresence mode="wait">
          {/* INTRO STATE */}
          {state === 'intro' && (
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
              <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">{quiz.title}</h1>
              <p className="text-lg text-muted-foreground mb-10">{quiz.description}</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={handleStart}
                  className="px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
                >
                  Start Quiz <ArrowRight className="w-5 h-5" />
                </button>
                <Link href={`/quiz/${quiz.id}/leaderboard`} className="px-8 py-4 rounded-xl bg-muted text-foreground font-semibold text-lg hover:bg-muted/80 transition-colors flex items-center justify-center gap-2">
                  <BarChart3 className="w-5 h-5" /> Leaderboard
                </Link>
              </div>
            </motion.div>
          )}

          {/* PLAYING STATE */}
          {(state === 'playing' || state === 'submitting') && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full"
            >
              {/* Progress Bar */}
              <div className="mb-8">
                <div className="flex justify-between text-sm font-medium text-muted-foreground mb-3">
                  <span>Question {currentIdx + 1} of {quiz.questions.length}</span>
                  <span>{Math.round(((currentIdx) / quiz.questions.length) * 100)}%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${((currentIdx) / quiz.questions.length) * 100}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Question Card */}
              <div className="bg-card rounded-[2rem] p-8 md:p-12 shadow-xl border border-border/60 relative overflow-hidden">
                {state === 'submitting' && (
                  <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <p className="font-semibold text-lg">Grading your answers...</p>
                  </div>
                )}
                
                <h2 className="text-2xl md:text-3xl font-display font-semibold mb-8 leading-relaxed text-foreground">
                  {quiz.questions[currentIdx].text}
                </h2>
                
                <div className="space-y-4 mb-10">
                  {quiz.questions[currentIdx].options.map((opt, idx) => {
                    const isSelected = answers[quiz.questions[currentIdx].id] === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectOption(idx)}
                        className={`w-full text-left p-6 rounded-2xl border-2 transition-all duration-300 flex items-center gap-5 group
                          ${isSelected 
                            ? 'border-primary bg-primary/5 shadow-[0_0_0_4px_rgba(59,130,246,0.1)]' 
                            : 'border-border bg-card hover:border-primary/40 hover:bg-muted/50'}`}
                      >
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-colors
                          ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 text-muted-foreground group-hover:border-primary/50'}`}>
                          {String.fromCharCode(65 + idx)}
                        </div>
                        <span className={`text-lg flex-1 ${isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                          {opt}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center pt-6 border-t border-border/50">
                  <button 
                    onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                    disabled={currentIdx === 0}
                    className="px-6 py-3 font-medium text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:text-foreground transition-colors flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" /> Previous
                  </button>
                  
                  <button
                    onClick={handleNext}
                    disabled={answers[quiz.questions[currentIdx].id] === undefined}
                    className="px-8 py-3 rounded-xl bg-foreground text-background font-semibold hover:-translate-y-0.5 hover:shadow-lg transition-all disabled:opacity-50 disabled:transform-none disabled:shadow-none flex items-center gap-2"
                  >
                    {currentIdx === quiz.questions.length - 1 ? 'Finish' : 'Next'} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* RESULTS STATE */}
          {state === 'results' && (
            <motion.div
              key="results"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.5 }}
              className="bg-card rounded-[2rem] p-10 md:p-16 text-center shadow-2xl border border-border max-w-xl mx-auto"
            >
              <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-amber-500/20">
                <Trophy className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-4xl font-display font-bold mb-4">Quiz Complete!</h2>
              
              <div className="py-8 my-8 border-y border-border">
                <p className="text-muted-foreground text-lg mb-2">Your final score</p>
                <div className="text-6xl font-display font-extrabold text-primary">
                  {Math.round((finalScore.score / finalScore.total) * 100)}%
                </div>
                <p className="text-muted-foreground mt-4 font-medium">
                  {finalScore.score} out of {finalScore.total} correct
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/" className="px-6 py-3 rounded-xl border-2 border-border font-semibold hover:bg-muted transition-colors">
                  Back Home
                </Link>
                <Link href={`/quiz/${quiz.id}/leaderboard`} className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 transition-all">
                  View Leaderboard
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
