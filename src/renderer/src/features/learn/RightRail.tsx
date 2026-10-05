import { Building2, CalendarClock, Flame, Lightbulb, RotateCcw, Target as TargetIcon, TriangleAlert, Zap } from 'lucide-react';
import { addDays, dayKey, parseDay } from '@shared/progress';
import type { AppSnapshot, Track } from '@shared/types';
import { Button, Card, ProgressBar, Ring, SectionTitle } from '../../components/ui';
import { daysLeft, dueCount, targetReadiness, todayXp, weakRows } from '../../lib/derive';
import { cn, fmtDate } from '../../lib/format';
import { startLesson, useApp } from '../../lib/store';

function DailyGoal({ snapshot }: { snapshot: AppSnapshot }) {
  const xp = todayXp(snapshot);
  const goal = snapshot.settings.dailyGoalXp;
  const done = xp >= goal;
  const week = Array.from({ length: 7 }, (_, i) => addDays(dayKey(), i - 6));
  return (
    <Card>
      <div className="flex items-center gap-4">
        <Ring value={xp / goal} size={74} stroke={8} color={done ? 'var(--ok)' : 'var(--xp)'}>
          <Zap className={cn('size-7', done ? 'text-ok' : 'text-xp')} fill="currentColor" />
        </Ring>
        <div className="min-w-0">
          <div className="text-[13px] font-extrabold tracking-wider text-faint uppercase">Daily goal</div>
          <div className="text-xl font-black">
            {xp} <span className="text-base text-faint">/ {goal} XP</span>
          </div>
          <div className="text-[13px] font-bold text-muted">{done ? 'Goal reached — great work! 🎉' : `${goal - xp} XP to go today`}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-black text-streak">
          <Flame className="size-5" fill="currentColor" /> {snapshot.stats.streak.current}-day streak
        </div>
        <div className="flex gap-1.5">
          {week.map((d) => {
            const active = (snapshot.stats.xpByDay[d] ?? 0) > 0;
            return (
              <div
                key={d}
                title={fmtDate(d)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-[10px] font-black',
                  active ? 'bg-streak text-white' : 'bg-sunken text-faint',
                  d === dayKey() && 'ring-2 ring-streak/40 ring-offset-2 ring-offset-elev',
                )}
              >
                {parseDay(d).toLocaleDateString(undefined, { weekday: 'narrow' })}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function CoachFocus({ snapshot, track }: { snapshot: AppSnapshot; track?: Track }) {
  const weak = weakRows(snapshot, track?.id, 3);
  const weaknessNotes = [...snapshot.notes]
    .reverse()
    .filter((n) => n.kind === 'weakness' && (!track || !n.trackId || n.trackId === track.id))
    .slice(0, 2);
  return (
    <Card>
      <SectionTitle>Coach's focus</SectionTitle>
      {!weak.length && weaknessNotes.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2.5">
            {weaknessNotes.map((n) => (
              <li key={n.id} className="flex gap-2.5 rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13px] font-semibold text-warn-ink">
                <TargetIcon className="mt-0.5 size-4 shrink-0" /> {n.text}
              </li>
            ))}
          </ul>
          {track && snapshot.mistakesCount > 0 && (
            <Button variant="warn" block className="mt-4" icon={<TargetIcon className="size-4" />} onClick={() => void startLesson({ trackId: track.id, kind: 'mistakes' })}>
              Fix these now
            </Button>
          )}
        </>
      ) : weak.length ? (
        <>
          <ul className="flex flex-col gap-3">
            {weak.map((w) => (
              <li key={`${w.topicId}-${w.concept}`}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[13.5px] font-extrabold">
                  <span className="truncate">{w.concept}</span>
                  <span className="text-warn-ink">{w.strength}%</span>
                </div>
                <ProgressBar value={w.strength / 100} color="var(--warn)" height={8} />
                <div className="mt-1 truncate text-[11.5px] font-bold text-faint">{w.topicTitle}</div>
              </li>
            ))}
          </ul>
          {track && (
            <Button variant="warn" block className="mt-4" icon={<TargetIcon className="size-4" />} onClick={() => void startLesson({ trackId: track.id, kind: 'weakspots' })}>
              Drill weak spots
            </Button>
          )}
        </>
      ) : (
        <p className="text-[13.5px] font-semibold text-muted">
          Finish a lesson and I'll pinpoint the concepts to focus on. Every answer teaches me how you learn.
        </p>
      )}
    </Card>
  );
}

function Reviews({ snapshot, track }: { snapshot: AppSnapshot; track?: Track }) {
  const due = dueCount(snapshot, track?.id);
  const upcoming = Object.values(snapshot.topicProgress)
    .filter((p) => (!track || p.trackId === track.id) && p.completed && p.srs.due && p.srs.due > dayKey())
    .map((p) => p.srs.due as string)
    .sort()[0];
  const mistakes = snapshot.mistakesCount;
  if (!track) return null;
  return (
    <Card>
      <SectionTitle>Keep it fresh</SectionTitle>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-info-soft text-info">
            <CalendarClock className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold">{due ? `${due} topic${due === 1 ? '' : 's'} due for review` : 'No reviews due'}</div>
            <div className="text-xs font-semibold text-muted">
              {due ? 'Spaced repetition locks it into long-term memory' : upcoming ? `Next review ${fmtDate(upcoming)}` : 'Complete lessons to schedule reviews'}
            </div>
          </div>
          {due > 0 && (
            <Button size="sm" variant="soft" icon={<RotateCcw className="size-3.5" />} onClick={() => void startLesson({ trackId: track.id, kind: 'review' })}>
              Review
            </Button>
          )}
        </div>
        {mistakes > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-bad-soft text-bad">
              <TriangleAlert className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold">{mistakes} mistake{mistakes === 1 ? '' : 's'} to fix</div>
              <div className="text-xs font-semibold text-muted">Fresh questions on what you missed</div>
            </div>
            <Button size="sm" variant="soft" onClick={() => void startLesson({ trackId: track.id, kind: 'mistakes' })}>
              Fix
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function ActiveTarget({ snapshot }: { snapshot: AppSnapshot }) {
  const navigate = useApp((s) => s.navigate);
  const target = snapshot.targets.find((t) => t.id === snapshot.profile.activeTargetId);
  if (!target) {
    return (
      <Card className="border-dashed">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Building2 className="size-5" />
          </div>
          <div>
            <div className="text-sm font-extrabold">Interviewing somewhere?</div>
            <p className="mt-0.5 text-[13px] font-semibold text-muted">Paste the job description and I'll research the company and build a prep plan for that exact role.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate({ name: 'targets' })}>
              Add a company target
            </Button>
          </div>
        </div>
      </Card>
    );
  }
  const days = daysLeft(target);
  const readiness = targetReadiness(snapshot, target);
  return (
    <Card onClick={() => navigate({ name: 'target', id: target.id })}>
      <SectionTitle>Company prep</SectionTitle>
      <div className="flex items-center gap-3">
        <Ring value={readiness.score / 100} size={56} stroke={6} color="var(--info)">
          <span className="text-sm font-black">{readiness.score}</span>
        </Ring>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-black">{target.company}</div>
          <div className="truncate text-[13px] font-semibold text-muted">{target.role}</div>
          <div className="text-xs font-bold text-info-ink">
            {target.status !== 'ready' ? 'Researching…' : days === undefined ? 'No interview date' : days >= 0 ? `Interview in ${days} day${days === 1 ? '' : 's'}` : 'Interview date passed'}
          </div>
        </div>
      </div>
    </Card>
  );
}

function LatestNote({ snapshot }: { snapshot: AppSnapshot }) {
  const note = [...snapshot.notes].reverse().find((n) => n.kind === 'insight' || n.kind === 'weakness' || n.kind === 'plan');
  if (!note) return null;
  return (
    <div className="flex gap-3 rounded-3xl border-2 border-brand/25 bg-brand-soft/60 p-4">
      <Lightbulb className="mt-0.5 size-5 shrink-0 text-brand" />
      <div>
        <div className="text-[12px] font-extrabold tracking-wider text-brand-ink uppercase">Coach note</div>
        <p className="mt-0.5 text-[13.5px] font-semibold text-ink">{note.text}</p>
      </div>
    </div>
  );
}

export function RightRail({ snapshot, track }: { snapshot: AppSnapshot; track?: Track }) {
  return (
    <div className="flex flex-col gap-4">
      <DailyGoal snapshot={snapshot} />
      <CoachFocus snapshot={snapshot} track={track} />
      <Reviews snapshot={snapshot} track={track} />
      <ActiveTarget snapshot={snapshot} />
      <LatestNote snapshot={snapshot} />
    </div>
  );
}
