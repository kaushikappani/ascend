import { Check, ChevronDown, Dumbbell, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import type { InterviewSession } from '@shared/types';
import { Badge, Button, ProgressBar, Ring } from '../../components/ui';
import { cn } from '../../lib/format';
import { startLesson, useApp } from '../../lib/store';

const VERDICT: Record<string, { label: string; tone: 'ok' | 'info' | 'warn' | 'bad' }> = {
  strong_hire: { label: 'Strong hire', tone: 'ok' },
  hire: { label: 'Hire', tone: 'ok' },
  lean_hire: { label: 'Lean hire', tone: 'info' },
  lean_no_hire: { label: 'Lean no hire', tone: 'warn' },
  no_hire: { label: 'No hire', tone: 'bad' },
};

export function ScorecardView({ session }: { session: InterviewSession }) {
  const card = session.scorecard;
  const snapshot = useApp((s) => s.snapshot);
  const [open, setOpen] = useState<number | null>(0);
  if (!card) return null;
  const verdict = VERDICT[card.verdict] ?? VERDICT.lean_no_hire;
  const color = card.overall >= 70 ? 'var(--ok)' : card.overall >= 55 ? 'var(--warn)' : 'var(--bad)';
  const trackId = session.trackId ?? snapshot?.profile.activeTrackId;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-6 rounded-3xl border-2 border-line bg-elev p-6">
        <Ring value={card.overall / 100} size={120} stroke={11} color={color}>
          <div className="text-center">
            <div className="text-3xl font-black">{card.overall}</div>
            <div className="text-[10px] font-black tracking-wider text-faint uppercase">of 100</div>
          </div>
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone={verdict.tone} className="px-3 py-1 text-sm">
              {verdict.label}
            </Badge>
            {session.xp && <Badge tone="warn">+{session.xp} XP</Badge>}
          </div>
          <p className="mt-3 text-[15px] font-semibold text-ink">{card.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-3xl border-2 border-line bg-elev p-5">
          <div className="mb-3 text-[13px] font-extrabold tracking-wider text-faint uppercase">Dimensions</div>
          <div className="flex flex-col gap-3.5">
            {card.dimensions.map((d) => (
              <div key={d.name}>
                <div className="mb-1 flex items-center justify-between text-sm font-extrabold">
                  <span>{d.name}</span>
                  <span>{d.score}/5</span>
                </div>
                <ProgressBar value={d.score / 5} color={d.score >= 4 ? 'var(--ok)' : d.score >= 3 ? 'var(--warn)' : 'var(--bad)'} height={9} />
                <p className="mt-1 text-xs font-semibold text-muted">{d.comment}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border-2 border-ok/30 bg-ok-soft p-5">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-extrabold tracking-wider text-ok-ink uppercase">
              <Check className="size-4" /> What went well
            </div>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm font-semibold text-ok-ink">
              {card.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border-2 border-warn/30 bg-warn-soft p-5">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-extrabold tracking-wider text-warn-ink uppercase">
              <TrendingUp className="size-4" /> To improve
            </div>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm font-semibold text-warn-ink">
              {card.improvements.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {card.focusTopics.length > 0 && (
        <div className="flex items-center gap-4 rounded-3xl border-2 border-brand/30 bg-brand-soft p-5">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-extrabold tracking-wider text-brand-ink uppercase">Study next</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {card.focusTopics.map((t) => (
                <Badge key={t} tone="brand" className="bg-elev">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
          {trackId && (
            <Button
              icon={<Dumbbell className="size-4" />}
              onClick={() => void startLesson({ trackId, kind: 'custom', title: 'Interview follow-up drill', focus: `Close the gaps from my mock interview: ${card.focusTopics.join(', ')}` })}
            >
              Drill these
            </Button>
          )}
        </div>
      )}

      <div>
        <div className="mb-3 text-[13px] font-extrabold tracking-wider text-faint uppercase">Question by question</div>
        <div className="flex flex-col gap-2.5">
          {card.questions.map((q, i) => (
            <div key={i} className="rounded-2xl border-2 border-line bg-elev">
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white',
                    q.score >= 4 ? 'bg-ok' : q.score >= 3 ? 'bg-warn' : 'bg-bad',
                  )}
                >
                  {q.score}/5
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-extrabold">{q.question}</span>
                <ChevronDown className={cn('size-5 shrink-0 text-faint transition-transform', open === i && 'rotate-180')} />
              </button>
              {open === i && (
                <div className="flex flex-col gap-3 border-t-2 border-line px-4 py-4">
                  <p className="text-sm font-semibold text-ink">{q.feedback}</p>
                  <div className="rounded-2xl bg-ok-soft px-4 py-3">
                    <div className="text-[12px] font-black tracking-wider text-ok-ink uppercase">What a strong answer covers</div>
                    <p className="selectable mt-1 text-sm font-semibold text-ok-ink">{q.idealAnswer}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
