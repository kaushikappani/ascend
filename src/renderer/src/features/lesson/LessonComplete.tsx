import { Check, ChevronDown, Clock, Flame, RotateCcw, Sparkles, Target, Trophy, X, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ACHIEVEMENTS } from '@shared/constants';
import type { Lesson, LessonResult } from '@shared/types';
import { InlineText } from '../../components/Markdown';
import { Mascot } from '../../components/Mascot';
import { Badge, Button, ProgressBar } from '../../components/ui';
import { celebrate } from '../../lib/confetti';
import { cn, fmtDuration } from '../../lib/format';
import { sfx } from '../../lib/sound';
import { startLesson } from '../../lib/store';
import { describeAnswer, describeCorrect } from './describe';

function Tile({ icon, label, value, color, delay }: { icon: ReactNode; label: string; value: string; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 320, damping: 22 }}
      className="overflow-hidden rounded-2xl border-2"
      style={{ borderColor: color }}
    >
      <div className="py-1 text-center text-[11px] font-black tracking-wider text-white uppercase" style={{ background: color }}>
        {label}
      </div>
      <div className="flex items-center justify-center gap-1.5 bg-elev py-3 text-xl font-black" style={{ color }}>
        {icon}
        {value}
      </div>
    </motion.div>
  );
}

export function LessonComplete({ lesson, result, bestCombo, onClose }: { lesson: Lesson; result: LessonResult; bestCombo: number; onClose: () => void }) {
  const [review, setReview] = useState(false);
  const debrief = lesson.result?.debrief ?? result.debrief;
  const checkpoint = lesson.kind === 'checkpoint';
  const perfect = result.total > 0 && result.correctCount === result.total;

  useEffect(() => {
    if (result.passed) {
      celebrate(!!result.levelUnlocked || perfect);
      if (result.levelUnlocked) sfx.levelUp();
      else sfx.complete();
    }
  }, [result.passed, result.levelUnlocked, perfect]);

  const title = checkpoint
    ? result.passed
      ? 'Checkpoint passed!'
      : 'Checkpoint not passed — yet'
    : perfect
      ? 'Flawless lesson!'
      : result.passed
        ? 'Lesson complete!'
        : 'Lesson finished';
  const gained = Math.round(result.masteryAfter - result.masteryBefore);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-7 px-8 py-10">
        <Mascot mood={result.passed ? 'celebrate' : 'happy'} size={124} />
        <div className="text-center">
          <h1 className="text-[34px] leading-tight font-black">{title}</h1>
          <p className="mt-1 text-[15px] font-semibold text-muted">{lesson.title}</p>
        </div>
        <div className="grid w-full grid-cols-4 gap-3">
          <Tile icon={<Zap className="size-5" fill="currentColor" />} label="XP earned" value={`+${result.xp}`} color="var(--xp)" delay={0.1} />
          <Tile icon={<Target className="size-5" />} label="Accuracy" value={`${Math.round(result.score * 100)}%`} color="var(--ok)" delay={0.2} />
          <Tile icon={<Clock className="size-5" />} label="Time" value={fmtDuration(result.durationMs)} color="var(--info)" delay={0.3} />
          <Tile icon={<Flame className="size-5" fill="currentColor" />} label="Best combo" value={String(bestCombo)} color="var(--streak)" delay={0.4} />
        </div>

        {lesson.kind !== 'rapid' && (
          <div className="w-full rounded-3xl border-2 border-line bg-elev p-5">
            <div className="mb-2 flex items-center justify-between text-sm font-extrabold">
              <span>Topic mastery</span>
              <span className={cn(gained >= 0 ? 'text-ok' : 'text-bad')}>
                {Math.round(result.masteryBefore)} → {Math.round(result.masteryAfter)} ({gained >= 0 ? '+' : ''}
                {gained})
              </span>
            </div>
            <ProgressBar value={result.masteryAfter / 100} color="var(--brand)" height={14} />
          </div>
        )}

        {(result.levelUnlocked || result.goalReached || result.achievements.length > 0) && (
          <div className="flex w-full flex-col gap-2.5">
            {result.levelUnlocked && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#8e7dff] to-[#5433db] px-5 py-4 text-white">
                <Trophy className="size-7" />
                <div>
                  <div className="text-lg font-black">Level {result.levelUnlocked} unlocked!</div>
                  <div className="text-sm font-semibold opacity-90">You're climbing — new topics are waiting.</div>
                </div>
              </motion.div>
            )}
            {result.goalReached && (
              <div className="flex items-center gap-3 rounded-2xl bg-ok-soft px-5 py-3 font-extrabold text-ok-ink">
                <Check className="size-5" /> Daily goal reached. Your streak is safe today!
              </div>
            )}
            {result.achievements.map((id) => {
              const a = ACHIEVEMENTS.find((x) => x.id === id);
              return a ? (
                <div key={id} className="flex items-center gap-3 rounded-2xl border-2 border-xp/40 bg-warn-soft px-5 py-3">
                  <span className="text-2xl">{a.emoji}</span>
                  <div>
                    <div className="font-black text-warn-ink">Achievement: {a.title}</div>
                    <div className="text-sm font-semibold text-warn-ink/80">{a.description}</div>
                  </div>
                </div>
              ) : null;
            })}
          </div>
        )}

        <div className="w-full rounded-3xl border-2 border-brand/30 bg-brand-soft/50 p-5">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-black tracking-wider text-brand-ink uppercase">
            <Sparkles className="size-4" /> Coach's debrief
          </div>
          {!debrief || debrief.status === 'pending' ? (
            <div className="flex flex-col gap-2">
              <div className="text-sm font-bold text-muted">Ace is reviewing your answers…</div>
              <div className="shimmer h-4 w-4/5 rounded-full" />
              <div className="shimmer h-4 w-3/5 rounded-full" />
            </div>
          ) : debrief.status === 'error' ? (
            <div className="text-sm font-semibold text-muted">The debrief isn't available right now — your progress is saved.</div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-lg font-black">{debrief.headline}</div>
              <p className="text-[14.5px] font-semibold text-ink">{debrief.summary}</p>
              {(!!debrief.strengths?.length || !!debrief.focusNext?.length) && (
                <div className="flex flex-wrap gap-1.5">
                  {debrief.strengths?.map((s) => (
                    <Badge key={s} tone="ok" icon={<Check className="size-3" />}>
                      {s}
                    </Badge>
                  ))}
                  {debrief.focusNext?.map((s) => (
                    <Badge key={s} tone="warn" icon={<Target className="size-3" />}>
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
              {debrief.nextStep && <p className="text-sm font-bold text-brand-ink">→ {debrief.nextStep}</p>}
              {debrief.remedialTopicTitle && (
                <div className="rounded-2xl bg-elev px-4 py-3 text-sm font-semibold">
                  <Sparkles className="mr-1 inline size-4 text-brand" /> I added <b>{debrief.remedialTopicTitle}</b> to your path to close this gap.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-full">
          <button onClick={() => setReview((v) => !v)} className="flex w-full items-center justify-between rounded-2xl px-2 py-2 text-sm font-extrabold text-muted hover:text-ink">
            Review your answers
            <ChevronDown className={cn('size-5 transition-transform', review && 'rotate-180')} />
          </button>
          {review && (
            <ul className="mt-2 flex flex-col gap-2.5">
              {lesson.questions.map((q, i) => {
                const a = lesson.answers[q.id];
                const v = a?.result.verdict ?? 'incorrect';
                return (
                  <li key={q.id} className="rounded-2xl border-2 border-line bg-elev p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full text-white',
                          v === 'correct' ? 'bg-ok' : v === 'partial' ? 'bg-warn' : 'bg-bad',
                        )}
                      >
                        {v === 'correct' ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-extrabold">
                          {i + 1}. <InlineText text={q.prompt.replace(/___/g, '____')} />
                        </div>
                        <div className="mt-1 text-[13px] font-semibold text-muted">
                          You: <span className={v === 'correct' ? 'text-ok-ink' : 'text-bad-ink'}>{describeAnswer(q, a?.answer)}</span>
                        </div>
                        {v !== 'correct' && (
                          <div className="text-[13px] font-semibold text-ok-ink">
                            Correct: <InlineText text={describeCorrect(q)} />
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex w-full gap-3">
          {!result.passed && lesson.topicId && (
            <Button
              variant="secondary"
              size="lg"
              caps
              icon={<RotateCcw className="size-5" />}
              onClick={() => {
                onClose();
                void startLesson({ trackId: lesson.trackId, kind: 'lesson', topicId: lesson.topicId });
              }}
            >
              Try again
            </Button>
          )}
          <Button size="lg" caps block onClick={onClose}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
