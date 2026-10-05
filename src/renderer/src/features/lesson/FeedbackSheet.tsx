import { Check, Lightbulb, MessageCircleQuestion, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import type { AnswerResult, Question } from '@shared/types';
import { InlineText, Markdown } from '../../components/Markdown';
import { Button, Kbd, Ring } from '../../components/ui';
import { cn, ENCOURAGE, pick, PRAISE } from '../../lib/format';

function correctAnswer(q: Question): string | null {
  switch (q.type) {
    case 'mcq':
      return q.options?.[q.correctIndex ?? -1] ?? null;
    case 'multi_select':
      return (q.correctIndices ?? []).map((i) => q.options?.[i]).join(' · ');
    case 'true_false':
      return q.answer ? 'True' : 'False';
    default:
      return null;
  }
}

export function FeedbackSheet({
  q,
  result,
  onContinue,
  onExplain,
}: {
  q: Question;
  result: AnswerResult;
  onContinue: () => void;
  onExplain: () => void;
}) {
  const v = result.verdict;
  const title = useMemo(() => (v === 'correct' ? pick(PRAISE) : v === 'partial' ? 'Partly right' : pick(ENCOURAGE)), [v]);
  const tone = {
    correct: 'bg-ok-soft border-ok/40 text-ok-ink',
    partial: 'bg-warn-soft border-warn/40 text-warn-ink',
    incorrect: 'bg-bad-soft border-bad/40 text-bad-ink',
  }[v];
  const answer = v !== 'correct' ? correctAnswer(q) : null;
  const isShort = q.type === 'short_answer';
  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className={cn('border-t-2', tone)}
    >
      <div className="mx-auto flex max-w-[900px] items-start gap-5 px-8 py-5">
        <div
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-full bg-elev',
            v === 'correct' ? 'text-ok' : v === 'partial' ? 'text-warn' : 'text-bad',
          )}
        >
          {isShort ? (
            <Ring value={result.score} size={52} stroke={5} color={v === 'correct' ? 'var(--ok)' : v === 'partial' ? 'var(--warn)' : 'var(--bad)'}>
              <span className="text-[13px] font-black">{Math.round(result.score * 100)}</span>
            </Ring>
          ) : v === 'incorrect' ? (
            <X className="size-8" strokeWidth={3.2} />
          ) : (
            <Check className="size-8" strokeWidth={3.2} />
          )}
        </div>
        <div className="max-h-[36vh] min-w-0 flex-1 overflow-y-auto pr-2">
          <div className="text-[22px] font-black">{title}</div>
          {answer && (
            <div className="mt-1 text-[15px] font-extrabold">
              Correct answer: <InlineText text={answer} className="font-bold" />
            </div>
          )}
          {isShort ? (
            <div className="mt-2 flex flex-col gap-3 text-ink">
              {result.feedback && <p className="text-[15px] font-semibold">{result.feedback}</p>}
              {!!result.missing?.length && (
                <div>
                  <div className="text-[12px] font-black tracking-wider uppercase opacity-80">What to add</div>
                  <ul className="mt-1 list-disc pl-5 text-sm font-semibold">
                    {result.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.modelAnswer && (
                <div className="rounded-2xl bg-elev/80 px-4 py-3">
                  <div className="text-[12px] font-black tracking-wider text-ok-ink uppercase">A strong answer</div>
                  <p className="selectable mt-1 text-sm font-semibold">{result.modelAnswer}</p>
                </div>
              )}
            </div>
          ) : (
            <Markdown text={q.explanation} className="mt-1.5 text-[14.5px] text-ink" />
          )}
          {q.interviewTip && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-elev/70 px-3.5 py-2.5 text-[13.5px] font-semibold text-ink">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" /> {q.interviewTip}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button caps size="lg" variant={v === 'correct' ? 'success' : v === 'partial' ? 'warn' : 'danger'} onClick={onContinue}>
            Continue
          </Button>
          <div className="flex items-center gap-1 text-[11px] font-bold opacity-70">
            <Kbd>Enter</Kbd>
          </div>
          <button onClick={onExplain} className="flex items-center gap-1.5 rounded-xl px-2 py-1 text-[13px] font-extrabold hover:bg-elev/60">
            <MessageCircleQuestion className="size-4" /> Explain more
          </button>
        </div>
      </div>
    </motion.div>
  );
}
