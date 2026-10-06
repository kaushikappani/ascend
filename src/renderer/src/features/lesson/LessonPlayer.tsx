import { AlertTriangle, BookOpen, ChevronLeft, ChevronRight, Flame, Lightbulb, MessageCircle, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HINT_DELAY_SECONDS } from '@shared/constants';
import { findTopic } from '@shared/progress';
import type { AnswerResult, Lesson, LessonResult, Question, Track, UserAnswer } from '@shared/types';
import { ActivityFeed, useJobs } from '../../components/AgentActivity';
import { InlineText } from '../../components/Markdown';
import { Mascot, SpeechBubble } from '../../components/Mascot';
import { ConfirmModal } from '../../components/Modal';
import { Button, IconButton, Kbd, ProgressBar, Ring, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { attempt, toastError, useApp } from '../../lib/store';
import { sfx } from '../../lib/sound';
import { ExplainDrawer } from './ExplainDrawer';
import { FeedbackSheet } from './FeedbackSheet';
import { LessonComplete } from './LessonComplete';
import { LessonDrawer, type DrawerMode } from './LessonDrawer';
import { PrimerView } from './PrimerView';
import { QuestionView } from './QuestionView';
import type { AskFn } from './SelectionAsk';
import { Walkthrough } from './Walkthrough';

const TIPS = [
  'Press 1–4 to pick an answer and Enter to check it.',
  'Wrong answers come back at the end for a second chance.',
  "Not sure? “I don't know” is honest — and teaches the coach what to revisit.",
  'Short answers are graded like a real interviewer would: meaning over wording.',
  'Every answer updates your mastery, so the next lesson adapts to you.',
  'Stuck? A hint unlocks after a few seconds — try it on your own first.',
];

interface Item {
  q: Question;
  retry: boolean;
}

/** A question already answered in this lesson, kept so the learner can step back through it. */
interface Answered {
  item: Item;
  answer: UserAnswer | null;
  result: AnswerResult;
  hintUsed: boolean;
}

const noop = () => undefined;

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

/** Unlocks after a short delay so the learner tries on their own first. */
function HintButton({ secondsLeft, shown, onShow }: { secondsLeft: number; shown: boolean; onShow: () => void }) {
  const ready = secondsLeft <= 0;
  return (
    <motion.div key={ready ? 'ready' : 'waiting'} initial={ready ? { scale: 0.85 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
      <Button
        variant={ready && !shown ? 'outline' : 'ghost'}
        size="lg"
        disabled={!ready || shown}
        onClick={onShow}
        data-hint={ready ? (shown ? 'shown' : 'ready') : 'waiting'}
        title={ready ? 'Reveal a nudge (answers with a hint earn half XP)' : 'Give it a try first — the hint unlocks in a moment'}
        icon={
          ready ? (
            <Lightbulb className="size-5" />
          ) : (
            <Ring value={1 - secondsLeft / HINT_DELAY_SECONDS} size={22} stroke={3} color="var(--brand)" track="var(--border)" />
          )
        }
      >
        {shown ? 'Hint shown' : ready ? 'Hint' : `Hint in ${secondsLeft}s`}
      </Button>
    </motion.div>
  );
}

function hintFor(q: Question): string {
  return q.hint ?? `Focus on the key idea: ${q.concepts.map((c) => `**${c}**`).join(', ')}.`;
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
  // Answers from an earlier sitting can be stepped back through too.
  const [history, setHistory] = useState<Answered[]>(() =>
    lesson.questions
      .filter((q) => lesson.answers[q.id])
      .map((q) => ({ item: { q, retry: false }, answer: lesson.answers[q.id].answer, result: lesson.answers[q.id].result, hintUsed: !!lesson.answers[q.id].hintUsed })),
  );
  const [reviewAt, setReviewAt] = useState<number | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const [hintIn, setHintIn] = useState(HINT_DELAY_SECONDS);
  const bestCombo = useRef(0);
  const mistakes = useRef<Question[]>(
    lesson.questions.filter((q) => lesson.answers[q.id] && !lesson.answers[q.id].result.correct && q.type !== 'short_answer'),
  );
  const qStart = useRef(Date.now());
  const finished = useRef(false);
  const item = queue[index];
  const reviewing = reviewAt !== null;
  const reviewed = reviewAt !== null ? history[reviewAt] : undefined;
  const hintable = lesson.kind !== 'checkpoint' && !!item && !item.retry;

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

  // Every question gets a fresh hint countdown.
  useEffect(() => {
    setHintShown(false);
    setHintIn(HINT_DELAY_SECONDS);
    const t = setInterval(() => setHintIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [item?.q.id, item?.retry]);

  useEffect(() => onExplainChange(explain), [explain, onExplainChange]);

  const check = useCallback(
    async (override?: UserAnswer) => {
      const a = override ?? answer;
      if (!item || !a || checking || result) return;
      setChecking(true);
      setAnswer(a);
      try {
        const r = await api.lessons.answer({
          lessonId: lesson.id,
          questionId: item.q.id,
          answer: a,
          timeMs: Date.now() - qStart.current,
          retry: item.retry,
          hintUsed: hintShown,
        });
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
    [answer, item, checking, result, lesson.id, hintShown],
  );

  const next = useCallback(() => {
    if (item && result) setHistory((h) => [...h, { item, answer, result, hintUsed: hintShown && hintable }]);
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
  }, [item, answer, result, hintShown, hintable, index, queue.length, requeued, onFinish]);

  // Step back through answered questions; the current one stays exactly as the learner left it.
  const canGoBack = reviewAt !== null ? reviewAt > 0 : history.length > 0;
  const goBack = useCallback(() => {
    setExplain(false);
    setReviewAt((r) => (r === null ? (history.length ? history.length - 1 : null) : Math.max(0, r - 1)));
  }, [history.length]);
  const goForward = useCallback(() => {
    setExplain(false);
    setReviewAt((r) => (r === null || r + 1 >= history.length ? null : r + 1));
  }, [history.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (paused || explain) return;
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !typing && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key === 'ArrowLeft' && canGoBack) goBack();
        else if (e.key === 'ArrowRight' && reviewing) goForward();
        return;
      }
      if (e.key !== 'Enter') return;
      if (target.tagName === 'TEXTAREA' && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (reviewing) goForward();
      else if (interstitial) setInterstitial(false);
      else if (result) next();
      else if (answer) void check();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [paused, explain, interstitial, result, answer, next, check, reviewing, canGoBack, goBack, goForward]);

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const shown = reviewed ?? (result ? { item, answer, result, hintUsed: hintShown && hintable } : undefined);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[780px] px-8 pt-5 pb-10">
          <div className="mb-4 flex h-9 items-center justify-between gap-3">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              data-nav="previous"
              className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[13px] font-extrabold text-muted hover:bg-hover hover:text-ink disabled:invisible"
              title="Previous question (←)"
            >
              <ChevronLeft className="size-4" strokeWidth={3} /> Previous
            </button>
            {reviewing && (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-info-soft px-3 py-1 text-[12.5px] font-extrabold text-info-ink">
                  Reviewing answer {(reviewAt ?? 0) + 1} of {history.length} · saved
                </span>
                <button
                  onClick={() => setReviewAt(null)}
                  data-nav="current"
                  className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[13px] font-extrabold text-brand hover:bg-brand-soft"
                >
                  Back to current <ChevronRight className="size-4" strokeWidth={3} />
                </button>
              </div>
            )}
          </div>
          {reviewed && (
            <div data-reviewing>
              <QuestionView
                key={`review-${reviewAt}`}
                q={reviewed.item.q}
                retry={reviewed.item.retry}
                locked
                result={reviewed.result}
                initial={reviewed.answer}
                paused
                onAnswer={noop}
                onSubmit={noop}
              />
            </div>
          )}
          {/* Hidden rather than unmounted while reviewing, so a half-built answer survives the trip back. */}
          <div className={reviewing ? 'hidden' : undefined}>
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
                  <QuestionView
                    q={item.q}
                    retry={item.retry}
                    locked={!!result || checking}
                    result={result}
                    paused={paused || reviewing}
                    onAnswer={setAnswer}
                    onSubmit={(a) => void check(a)}
                  />
                  <AnimatePresence>
                    {hintShown && hintable && (
                      <motion.div
                        data-hint-card
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-6 flex items-start gap-3 rounded-2xl border-2 border-brand/30 bg-brand-soft px-4 py-3 text-brand-ink"
                      >
                        <Lightbulb className="mt-0.5 size-5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[12px] font-black tracking-wider uppercase">Hint</div>
                          <InlineText text={hintFor(item.q)} className="text-[15px] font-semibold" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
      {reviewed ? (
        <FeedbackSheet
          q={reviewed.item.q}
          result={reviewed.result}
          hintUsed={reviewed.hintUsed}
          onContinue={goForward}
          onExplain={() => setExplain(true)}
          continueLabel={(reviewAt ?? 0) + 1 >= history.length ? 'Back to current' : 'Next'}
        />
      ) : (
        !interstitial &&
        (result ? (
          <FeedbackSheet q={item.q} result={result} hintUsed={hintShown && hintable} onContinue={next} onExplain={() => setExplain(true)} />
        ) : (
          <div className="border-t-2 border-line bg-elev">
            <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4 px-8 py-5">
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="lg" caps disabled={checking} onClick={() => void check({ type: 'skip' })}>
                  I don't know
                </Button>
                {hintable && <HintButton secondsLeft={hintIn} shown={hintShown} onShow={() => setHintShown(true)} />}
              </div>
              {checking && item.q.type === 'short_answer' ? (
                <div className="flex items-center gap-2 text-sm font-bold text-muted">
                  <Spinner className="size-4" /> Your coach is reviewing your answer…
                </div>
              ) : (
                <div className="hidden items-center gap-1.5 text-xs font-bold text-faint lg:flex">
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
        ))
      )}
      {explain && shown && (
        <ExplainDrawer key={shown.item.q.id} lesson={lesson} q={shown.item.q} result={shown.result} answer={shown.answer} onClose={() => setExplain(false)} />
      )}
    </div>
  );
}

/** What the coach knows when the learner asks about this lesson. */
function lessonContext(lesson: Lesson, primer: string, track?: Track): string {
  const found = track && lesson.topicId ? findTopic(track, lesson.topicId) : undefined;
  return [
    `Lesson: ${lesson.title}${lesson.subtitle ? ` (${lesson.subtitle})` : ''}`,
    found ? `Topic: ${found.topic.title} — ${found.topic.summary}\nKey concepts: ${found.topic.concepts.join(', ')}` : lesson.focus ? `Focus: ${lesson.focus}` : '',
    primer ? `The primer the learner is reading:\n${primer.slice(0, 7000)}` : '',
    'The learner highlights passages of this lesson and asks about them. Answer about the highlighted passage specifically, and build on the primer rather than repeating it.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function quote(selection: string, question: string): string {
  const text = selection.length > 1500 ? `${selection.slice(0, 1500)}…` : selection;
  return `About this part of the lesson:\n${text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')}\n\n${question}`;
}

type Stage = 'intro' | 'walkthrough' | 'quiz' | 'done';

export function LessonPlayer({ lessonId }: { lessonId: string }) {
  const closeLesson = useApp((s) => s.closeLesson);
  const tracks = useApp((s) => s.snapshot?.tracks);
  const jobs = useJobs(lessonId);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [primer, setPrimer] = useState('');
  const [stage, setStage] = useState<Stage>('intro');
  const [result, setResult] = useState<LessonResult | null>(null);
  const [bestCombo, setBestCombo] = useState(0);
  const [progress, setProgress] = useState({ value: 0, combo: 0 });
  const [confirmExit, setConfirmExit] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [askThreadId, setAskThreadId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const askThread = useRef<Promise<string | undefined> | null>(null);
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
    setDrawer(null);
    setStage('quiz');
  }, [lessonId]);

  // Sessions without a primer start as soon as the questions are ready.
  useEffect(() => {
    if (lesson && stage === 'intro' && lesson.primerStatus === 'none' && lesson.questionsStatus === 'ready') begin();
  }, [lesson, stage, begin]);

  // A fresh lesson goes primer → hands-on walkthrough → questions; resumed ones skip the warm-up.
  const handsOn =
    !!lesson && lesson.walkthroughStatus !== 'none' && lesson.walkthroughStatus !== 'error' && Object.keys(lesson.answers).length === 0;
  const afterPrimer = useCallback(() => {
    if (handsOn) {
      setDrawer(null);
      setStage('walkthrough');
    } else begin();
  }, [handsOn, begin]);

  const ask = useCallback<AskFn>(
    (selection, question) => {
      if (!lesson) return;
      setDrawer('ask');
      void (async () => {
        if (!askThread.current) {
          setAsking(true);
          const track = tracks?.find((t) => t.id === lesson.trackId);
          askThread.current = attempt("Couldn't open the coach", () =>
            api.chat.create({ title: `Lesson Q&A: ${lesson.title}`, contextLabel: `Lesson · ${lesson.title}`, context: lessonContext(lesson, primer, track) }),
          );
        }
        const id = await askThread.current;
        setAsking(false);
        if (!id) {
          askThread.current = null;
          return;
        }
        setAskThreadId(id);
        await attempt("Couldn't ask the coach", () => api.chat.send(id, selection ? quote(selection, question) : question));
      })();
    },
    [lesson, primer, tracks],
  );

  const finish = useCallback(
    async (combo: number) => {
      setBestCombo(combo);
      const r = await attempt("Couldn't finish the lesson", () => api.lessons.complete(lessonId, Date.now() - startedAt.current));
      if (r) {
        setResult(r);
        setDrawer(null);
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
      if (e.key !== 'Escape' || confirmExit || explainOpen) return;
      if (drawer) setDrawer(null);
      else exit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [exit, confirmExit, explainOpen, drawer]);

  const answered = lesson ? Object.keys(lesson.answers).length : 0;
  const canAsk = !!lesson && stage !== 'done';

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
        {canAsk && (
          <div className="flex shrink-0 items-center gap-1">
            {primer && stage !== 'intro' && (
              <Button variant="ghost" size="sm" icon={<BookOpen className="size-4" />} onClick={() => setDrawer((d) => (d === 'lesson' ? null : 'lesson'))} title="Re-read the lesson">
                Lesson
              </Button>
            )}
            <Button variant="ghost" size="sm" icon={<MessageCircle className="size-4" />} onClick={() => setDrawer((d) => (d === 'ask' ? null : 'ask'))} title="Ask Ace about this lesson">
              Ask Ace
            </Button>
          </div>
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
            <Quiz lesson={lesson} paused={confirmExit || !!drawer} onProgress={onProgress} onFinish={(c) => void finish(c)} onExplainChange={setExplainOpen} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <AlertTriangle className="size-8 text-warn" />
              <div className="font-bold text-muted">This session has no questions.</div>
            </div>
          )
        ) : stage === 'walkthrough' ? (
          <Walkthrough lesson={lesson} paused={confirmExit || !!drawer} onAsk={ask} onFinish={begin} />
        ) : lesson.primerStatus === 'none' ? (
          <LessonLoading lesson={lesson} />
        ) : (
          <PrimerView lesson={lesson} text={primer} jobs={jobs} handsOn={handsOn} onStart={afterPrimer} onAsk={ask} />
        )}
        {lesson && drawer && stage !== 'done' && (
          <LessonDrawer
            lesson={lesson}
            primer={primer}
            mode={drawer}
            threadId={askThreadId}
            asking={asking}
            onMode={setDrawer}
            onAsk={ask}
            onClose={() => setDrawer(null)}
          />
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
