import { CalendarClock, Check, Mic, MessageCircle, Target, TriangleAlert, WandSparkles, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { AppSnapshot, Attempt } from '@shared/types';
import { InlineText } from '../../components/Markdown';
import { PageFrame } from '../../components/Page';
import { Badge, Button, Card, Chip, EmptyState, SectionTitle, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { activeTrack, dueCount, weakRows } from '../../lib/derive';
import { relTime } from '../../lib/format';
import { attempt, startLesson, useApp } from '../../lib/store';

function ModeCard({
  icon,
  color,
  title,
  body,
  action,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  color: string;
  title: string;
  body: ReactNode;
  action: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col rounded-3xl border-2 border-line bg-elev p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: color, boxShadow: `0 4px 0 color-mix(in srgb, ${color} 70%, #000)` }}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[16px] font-black">{title}</div>
          <div className="mt-0.5 text-[13px] font-semibold text-muted">{body}</div>
        </div>
      </div>
      <div className="flex-1" />
      <Button variant="secondary" className="mt-4" disabled={disabled} onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

function MistakeCard({ a, onResolved }: { a: Attempt; onResolved: () => void }) {
  const navigate = useApp((s) => s.navigate);
  const ask = async () => {
    const id = await attempt("Couldn't open the coach", () =>
      api.chat.create({
        title: `Mistake: ${a.concepts[0] ?? 'question'}`,
        contextLabel: 'A past mistake',
        context: `Question: ${a.prompt}\nLearner answered: ${a.userAnswerText}\nCorrect answer: ${a.correctAnswerText}\nExplanation: ${a.explanation}`,
      }),
    );
    if (id) navigate({ name: 'coach', id });
  };
  return (
    <div className="rounded-3xl border-2 border-line bg-elev p-5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {a.concepts.map((c) => (
          <Badge key={c} tone="warn">
            {c}
          </Badge>
        ))}
        <span className="ml-auto text-xs font-bold text-faint">{relTime(a.at)}</span>
      </div>
      <div className="text-[15px] leading-snug font-extrabold">
        <InlineText text={a.prompt} />
      </div>
      <div className="mt-3 grid gap-2 text-[13.5px] font-semibold">
        <div className="rounded-2xl bg-bad-soft px-3.5 py-2 text-bad-ink">
          <span className="font-black">You: </span>
          {a.userAnswerText || '(no answer)'}
        </div>
        <div className="rounded-2xl bg-ok-soft px-3.5 py-2 text-ok-ink">
          <span className="font-black">Correct: </span>
          <InlineText text={a.correctAnswerText} />
        </div>
      </div>
      <p className="mt-3 text-[13.5px] font-semibold text-muted">{a.explanation}</p>
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="soft" icon={<Check className="size-4" />} onClick={() => void attempt("Couldn't update", () => api.practice.resolveMistake(a.id)).then(onResolved)}>
          Got it now
        </Button>
        <Button size="sm" variant="ghost" icon={<MessageCircle className="size-4" />} onClick={() => void ask()}>
          Ask coach
        </Button>
      </div>
    </div>
  );
}

export function PracticePage() {
  const snapshot = useApp((s) => s.snapshot) as AppSnapshot;
  const navigate = useApp((s) => s.navigate);
  const ready = snapshot.tracks.filter((t) => t.status === 'ready');
  const [trackId, setTrackId] = useState(() => activeTrack(snapshot)?.id ?? ready[0]?.id);
  const track = ready.find((t) => t.id === trackId) ?? ready[0];
  const [mistakes, setMistakes] = useState<Attempt[]>([]);
  const [focus, setFocus] = useState('');

  const load = () => void api.practice.mistakes().then(setMistakes).catch(() => undefined);
  useEffect(load, [snapshot.mistakesCount]);

  const trackMistakes = useMemo(() => mistakes.filter((m) => !track || m.trackId === track.id), [mistakes, track]);
  const weak = track ? weakRows(snapshot, track.id, 3) : [];
  const due = track ? dueCount(snapshot, track.id) : 0;
  const completedTopics = track ? Object.values(snapshot.topicProgress).filter((p) => p.trackId === track.id && p.completed).length : 0;

  if (!track) {
    return (
      <PageFrame title="Practice">
        <EmptyState title="Nothing to practise yet" action={<Button onClick={() => navigate({ name: 'learn' })}>Go to Learn</Button>}>
          Your practice modes unlock once a roadmap is ready and you've completed a lesson.
        </EmptyState>
      </PageFrame>
    );
  }

  return (
    <PageFrame title="Practice">
      <div className="mb-6 flex flex-wrap gap-2">
        {ready.map((t) => (
          <Chip key={t.id} active={t.id === track.id} onClick={() => setTrackId(t.id)} icon={<span>{t.emoji}</span>}>
            {t.title}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <ModeCard
          icon={<CalendarClock className="size-6" />}
          color="#1e9be8"
          title="Smart review"
          body={due ? `${due} topic${due === 1 ? '' : 's'} due — spaced repetition keeps them sharp.` : completedTopics ? 'Nothing due, but a refresher on your shakiest topics never hurts.' : 'Complete a lesson to start your review schedule.'}
          action="Start review"
          disabled={!completedTopics}
          onClick={() => void startLesson({ trackId: track.id, kind: 'review' })}
        />
        <ModeCard
          icon={<Target className="size-6" />}
          color="#f2a516"
          title="Weak spots"
          body={weak.length ? `Drill ${weak.map((w) => w.concept).join(', ')}.` : 'No weak spots yet — they appear as you answer questions.'}
          action="Drill weak spots"
          disabled={!weak.length}
          onClick={() => void startLesson({ trackId: track.id, kind: 'weakspots' })}
        />
        <ModeCard
          icon={<TriangleAlert className="size-6" />}
          color="#ef4e6a"
          title="Fix my mistakes"
          body={trackMistakes.length ? `${trackMistakes.length} mistake${trackMistakes.length === 1 ? '' : 's'} — fresh questions on the same misconceptions.` : 'No open mistakes in this track. 🎉'}
          action="Fix mistakes"
          disabled={!trackMistakes.length}
          onClick={() => void startLesson({ trackId: track.id, kind: 'mistakes' })}
        />
        <ModeCard
          icon={<Zap className="size-6" fill="currentColor" />}
          color="#f5a623"
          title="Rapid fire"
          body="10 quick questions across what you've learned. Great for a 3-minute warm-up."
          action="Go fast"
          onClick={() => void startLesson({ trackId: track.id, kind: 'rapid' })}
        />
        <div className="flex flex-col rounded-3xl border-2 border-line bg-elev p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_4px_0_var(--brand-deep)]">
              <WandSparkles className="size-6" />
            </div>
            <div>
              <div className="text-[16px] font-black">Custom drill</div>
              <div className="mt-0.5 text-[13px] font-semibold text-muted">Anything you want: a concept, a scenario, an interview question you fear.</div>
            </div>
          </div>
          <Textarea rows={2} className="mt-3" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. @Transactional propagation with REQUIRES_NEW" />
          <Button
            className="mt-3"
            disabled={focus.trim().length < 3}
            onClick={() => {
              void startLesson({ trackId: track.id, kind: 'custom', focus: focus.trim() });
              setFocus('');
            }}
          >
            Create drill
          </Button>
        </div>
        <ModeCard
          icon={<Mic className="size-6" />}
          color="#10b981"
          title="Mock interview"
          body="A realistic interviewer that probes your weak spots, then scores you like a hiring panel."
          action="Set up interview"
          onClick={() => navigate({ name: 'interview' })}
        />
      </div>

      <div className="mt-10">
        <SectionTitle>Mistakes notebook · {track.title}</SectionTitle>
        {trackMistakes.length ? (
          <div className="grid grid-cols-2 gap-4">
            {trackMistakes.slice(0, 40).map((a) => (
              <MistakeCard key={a.id} a={a} onResolved={load} />
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-sm font-semibold text-muted">Questions you miss land here with the right answer and an explanation, so you can review them any time.</p>
          </Card>
        )}
      </div>
    </PageFrame>
  );
}
