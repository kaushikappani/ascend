import { AlertTriangle, Flame, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnswerResult, Lesson, LessonResult, Question, UserAnswer } from '@shared/types';
import { ActivityFeed, useJobs } from '../../components/AgentActivity';
import { Mascot, SpeechBubble } from '../../components/Mascot';
import { ConfirmModal } from '../../components/Modal';
import { Button, IconButton, Kbd, ProgressBar, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { attempt, toastError, useApp } from '../../lib/store';
import { sfx } from '../../lib/sound';
import { ExplainDrawer } from './ExplainDrawer';
import { FeedbackSheet } from './FeedbackSheet';
import { LessonComplete } from './LessonComplete';
import { PrimerView } from './PrimerView';
import { QuestionView } from './QuestionView';

const TIPS = [
  'Press 1–4 to pick an answer and Enter to check it.',
  'Wrong answers come back at the end for a second chance.',
  "Not sure? “I don't know” is honest — and teaches the coach what to revisit.",
  'Short answers are graded like a real interviewer would: meaning over wording.',
  'Every answer updates your mastery, so the next lesson adapts to you.',
];

interface Item {
  q: Question;
  retry: boolean;
}

function LessonLoading({ lesson }: { lesson: Lesson }) {
  const jobs = useJobs(lesson.id);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 4500);
    return () => clearInterval(t);
  }, []);
  if (lesson.questionsStatus === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
        <Mascot mood="sad" size={110} />
        <div>
          <div className="text-xl font-black">Couldn't prepare this session</div>
          <p className="mt-1 max-w-md text-sm font-semibold text-muted">{lesson.error}</p>
        </div>
        <Button icon={<RotateCcw className="size-4" />} onClick={() => void attempt('Retry failed', () => api.lessons.retry(lesson.id))}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 px-8">
      <div className="flex items-center gap-5">
        <Mascot mood="thinking" size={116} />
        <SpeechBubble className="max-w-sm">
          Building “{lesson.title}” around what you know and what you've missed…
        </SpeechBubble>
      </div>
      <ActivityFeed jobs={jobs} className="w-full max-w-md" />
      <AnimatePresence mode="wait">
        <motion.p key={tip} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-md text-center text-sm font-bold text-faint">
          💡 {TIPS[tip]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function Interstitial({ count, onGo }: { count: number; onGo: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center">
      <Mascot mood="wave" size={120} />
      <h2 className="text-[28px] font-black">Let's fix your mistakes</h2>
      <p className="max-w-md text-[15px] font-semibold text-muted">
        {count} question{count === 1 ? '' : 's'} coming back for a second try. Retrying right after feedback is one of the fastest ways to learn.
      </p>
      <Button caps size="lg" onClick={onGo}>
        Let's go
      </Button>
    </div>
  );
}

function Quiz({
  lesson,
  paused,
  onProgress,
  onFinish,
  onExplainChange,
}: {
  lesson: Lesson;
  paused: boolean;
  onProgress: (value: number, combo: number) => void;
  onFinish: (bestCombo: number) => void;
  onExplainChange: (open: boolean) => void;
}) {
  // Snapshot the queue once: later lesson updates (answers being saved) must not reshuffle it.
  const [initial] = useState<Item[]>(() => lesson.questions.filter((q) => !lesson.answers[q.id]).map((q) => ({ q, retry: false })));
  const [queue, setQueue] = useState<Item[]>(initial);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<UserAnswer | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [combo, setCombo] = useState(0);
  const [requeued, setRequeued] = useState(false);
  const [interstitial, setInterstitial] = useState(false);
  const [explain, setExplain] = useState(false);
  const bestCombo = useRef(0);
  const mistakes = useRef<Question[]>(
    lesson.questions.filter((q) => lesson.answers[q.id] && !lesson.answers[q.id].result.correct && q.type !== 'short_answer'),
  );
  const qStart = useRef(Date.now());
  const finished = useRef(false);
  const item = queue[index];

  useEffect(() => {
    if (!initial.length && !finished.current) {
      finished.current = true;
      onFinish(0);
    }
  }, [initial.length, onFinish]);

  // Questions answered in an earlier sitting count towards the progress bar.
  const prior = lesson.questions.length - initial.length;
  useEffect(() => {
    onProgress(queue.length ? (prior + index + (result ? 1 : 0)) / (prior + queue.length) : 1, combo);
  }, [prior, index, result, queue.length, combo, onProgress]);

  useEffect(() => {
    qStart.current = Date.now();
    if (item?.q.type === 'short_answer' && !item.retry) void api.lessons.warmGrader(lesson.id).catch(() => undefined);
  }, [item?.q.id, item?.retry, item?.q.type, lesson.id]);

  useEffect(() => onExplainChange(explain), [explain, onExplainChange]);

  const check = useCallback(
    async (override?: UserAnswer) => {
      const a = override ?? answer;
      if (!item || !a || checking || result) return;
      setChecking(true);
      setAnswer(a);
      try {
        const r = await api.lessons.answer({ lessonId: lesson.id, questionId: item.q.id, answer: a, timeMs: Date.now() - qStart.current, retry: item.retry });
        setResult(r);
        if (r.verdict === 'correct') {
          sfx.correct();
          setCombo((c) => {
            const n = c + 1;
            bestCombo.current = Math.max(bestCombo.current, n);
            return n;
          });
        } else {
          if (r.verdict === 'partial') sfx.partial();
          else sfx.wrong();
          setCombo(0);
          if (!item.retry && item.q.type !== 'short_answer' && !mistakes.current.includes(item.q)) mistakes.current.push(item.q);
        }
      } catch (error) {
        toastError("Couldn't check your answer", error);
      } finally {
        setChecking(false);
      }
    },
    [answer, item, checking, result, lesson.id],
  );

  const next = useCallback(() => {
    setAnswer(null);
    setResult(null);
    setExplain(false);
    if (index + 1 < queue.length) {
      setIndex(index + 1);
      return;
    }
    if (!requeued && mistakes.current.length) {
      setRequeued(true);
      setQueue((q) => [...q, ...mistakes.current.map((m) => ({ q: m, retry: true }))]);
      setInterstitial(true);
      setIndex(index + 1);
      return;
    }
    if (!finished.current) {
      finished.current = true;
      onFinish(bestCombo.current);
    }
  }, [index, queue.length, requeued, onFinish]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || paused || explain) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (interstitial) setInterstitial(false);
      else if (result) next();
      else if (answer) void check();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paused, explain, interstitial, result, answer, next, check]);

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[780px] px-8 py-10">
          {interstitial ? (
            <Interstitial count={queue.length - index} onGo={() => setInterstitial(false)} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${item.q.id}-${item.retry}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.22 }}
                className={result && !result.correct ? 'animate-shake' : undefined}
              >
                <QuestionView q={item.q} retry={item.retry} locked={!!result || checking} result={result} onAnswer={setAnswer} onSubmit={(a) => void check(a)} />
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
      {!interstitial &&
        (result ? (
          <FeedbackSheet q={item.q} result={result} onContinue={next} onExplain={() => setExplain(true)} />
        ) : (
          <div className="border-t-2 border-line bg-elev">
            <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4 px-8 py-5">
              <Button variant="secondary" size="lg" caps disabled={checking} onClick={() => void check({ type: 'skip' })}>
                I don't know
              </Button>
              {checking && item.q.type === 'short_answer' ? (
                <div className="flex items-center gap-2 text-sm font-bold text-muted">
                  <Spinner className="size-4" /> Your coach is reviewing your answer…
                </div>
              ) : (
                <div className="hidden items-center gap-1.5 text-xs font-bold text-faint md:flex">
                  <Kbd>Enter</Kbd> to check
                </div>
              )}
              {item.q.type === 'match' ? (
                <div className="w-[150px] text-right text-sm font-bold text-muted">Match every pair</div>
              ) : (
                <Button size="lg" caps disabled={!answer} loading={checking} onClick={() => void check()} className="min-w-[150px]">
                  Check
                </Button>
              )}
            </div>
          </div>
        ))}
      {explain && result && <ExplainDrawer lesson={lesson} q={item.q} result={result} answer={answer} onClose={() => setExplain(false)} />}
    </div>
  );
}

export function LessonPlayer({ lessonId }: { lessonId: string }) {
  const closeLesson = useApp((s) => s.closeLesson);
  const jobs = useJobs(lessonId);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [primer, setPrimer] = useState('');
  const [stage, setStage] = useState<'intro' | 'quiz' | 'done'>('intro');
  const [result, setResult] = useState<LessonResult | null>(null);
  const [bestCombo, setBestCombo] = useState(0);
  const [progress, setProgress] = useState({ value: 0, combo: 0 });
  const [confirmExit, setConfirmExit] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let raf = 0;
    let pendingDelta = '';
    api.lessons.get(lessonId).then((l) => {
      if (!l) return;
      setLesson(l);
      if (l.primer) setPrimer((p) => (l.primer && l.primer.length >= p.length ? l.primer : p));
      if (l.status === 'completed' && l.result) {
        setResult(l.result);
        setStage('done');
      }
    });
    const offLesson = api.on.lesson((l) => {
      if (l.id !== lessonId) return;
      setLesson(l);
      if (l.primerStatus === 'ready' && l.primer) setPrimer(l.primer);
    });
    const offPrimer = api.on.primerDelta((e) => {
      if (e.lessonId !== lessonId) return;
      if (e.reset) {
        pendingDelta = '';
        setPrimer('');
        return;
      }
      pendingDelta += e.delta;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          const chunk = pendingDelta;
          pendingDelta = '';
          setPrimer((p) => p + chunk);
        });
      }
    });
    return () => {
      offLesson();
      offPrimer();
      cancelAnimationFrame(raf);
    };
  }, [lessonId]);

  const begin = useCallback(() => {
    void api.lessons.begin(lessonId);
    startedAt.current = Date.now();
    setStage('quiz');
  }, [lessonId]);

  // Sessions without a primer start as soon as the questions are ready.
  useEffect(() => {
    if (lesson && stage === 'intro' && lesson.primerStatus === 'none' && lesson.questionsStatus === 'ready') begin();
  }, [lesson, stage, begin]);

  const finish = useCallback(
    async (combo: number) => {
      setBestCombo(combo);
      const r = await attempt("Couldn't finish the lesson", () => api.lessons.complete(lessonId, Date.now() - startedAt.current));
      if (r) {
        setResult(r);
        setStage('done');
      }
    },
    [lessonId],
  );

  const onProgress = useCallback((value: number, combo: number) => setProgress({ value, combo }), []);

  const doExit = useCallback(() => {
    if (lesson && lesson.status !== 'completed' && stage !== 'done') void api.lessons.abandon(lessonId);
    closeLesson();
  }, [lesson, stage, lessonId, closeLesson]);

  const exit = useCallback(() => {
    if (stage === 'quiz' && lesson && Object.keys(lesson.answers).length > 0) setConfirmExit(true);
    else doExit();
  }, [stage, lesson, doExit]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmExit && !explainOpen) exit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [exit, confirmExit, explainOpen]);

  const answered = lesson ? Object.keys(lesson.answers).length : 0;

  return (
    <motion.div
      data-lesson-player
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.2 }}
    >
      <div className="drag flex h-16 shrink-0 items-center gap-5 border-b-2 border-line pr-[150px] pl-5">
        <IconButton label="Exit" onClick={exit}>
          <X className="size-6" strokeWidth={2.6} />
        </IconButton>
        {stage === 'quiz' ? (
          <div className="flex flex-1 items-center gap-4">
            <ProgressBar value={progress.value} color="var(--ok)" height={16} />
            <AnimatePresence>
              {progress.combo >= 2 && (
                <motion.div key={progress.combo} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-1 text-[15px] font-black text-streak">
                  <Flame className="size-5" fill="currentColor" /> {progress.combo}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-muted">{lesson?.title}</div>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {!lesson ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : stage === 'done' && result ? (
          <LessonComplete lesson={lesson} result={result} bestCombo={bestCombo} onClose={closeLesson} />
        ) : stage === 'quiz' ? (
          lesson.questions.length ? (
            <Quiz lesson={lesson} paused={confirmExit} onProgress={onProgress} onFinish={(c) => void finish(c)} onExplainChange={setExplainOpen} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <AlertTriangle className="size-8 text-warn" />
              <div className="font-bold text-muted">This session has no questions.</div>
            </div>
          )
        ) : lesson.primerStatus === 'none' ? (
          <LessonLoading lesson={lesson} />
        ) : (
          <PrimerView lesson={lesson} text={primer} jobs={jobs} onStart={begin} />
        )}
      </div>
      <ConfirmModal
        open={confirmExit}
        title="Leave this lesson?"
        body={
          lesson?.kind === 'lesson'
            ? `You've answered ${answered} question${answered === 1 ? '' : 's'}. Your answers and XP are saved — reopen this topic any time to pick up where you left off.`
            : `You've answered ${answered} question${answered === 1 ? '' : 's'}. That progress and XP are saved, but you won't get the completion bonus.`
        }
        confirmLabel="Leave"
        danger
        onConfirm={doExit}
        onClose={() => setConfirmExit(false)}
      />
    </motion.div>
  );
}
