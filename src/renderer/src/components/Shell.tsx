import {
  BarChart3,
  Check,
  ChevronDown,
  Cpu,
  Dumbbell,
  Flame,
  LoaderCircle,
  Map as MapIcon,
  Mic,
  Settings,
  Sparkles,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FALLBACK_MODELS } from '@shared/constants';
import { dayKey } from '@shared/progress';
import { api } from '../lib/api';
import { todayXp } from '../lib/derive';
import { cn, fmtNumber, initials, modelName } from '../lib/format';
import { attempt, useApp, type Route } from '../lib/store';
import { Logo } from './Mascot';
import { Ring } from './ui';

const NAV: { name: Route['name']; label: string; icon: typeof MapIcon; match?: Route['name'][] }[] = [
  { name: 'learn', label: 'Learn', icon: MapIcon },
  { name: 'practice', label: 'Practice', icon: Dumbbell },
  { name: 'interview', label: 'Mock interview', icon: Mic },
  { name: 'targets', label: 'Company prep', icon: Target, match: ['target'] },
  { name: 'coach', label: 'AI coach', icon: Sparkles },
  { name: 'progress', label: 'Progress', icon: BarChart3 },
];

function JobsTray() {
  const jobs = useApp((s) => s.jobs).filter((j) => j.status === 'running');
  if (!jobs.length) return null;
  return (
    <div className="mx-3 mb-3 rounded-2xl border-2 border-brand/25 bg-brand-soft/60 p-3">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold tracking-wide text-brand-ink uppercase">
        <LoaderCircle className="size-3.5 animate-spin" /> Claude is working
      </div>
      <ul className="flex flex-col gap-2">
        {jobs.slice(0, 3).map((j) => (
          <li key={j.id} className="group flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-bold text-ink">{j.label}</div>
              <div className="truncate text-[11.5px] font-semibold text-muted">{j.activity.at(-1)?.text ?? 'Starting…'}</div>
            </div>
            <button
              className="rounded-md p-0.5 text-faint opacity-0 group-hover:opacity-100 hover:bg-elev hover:text-bad"
              title="Cancel"
              onClick={() => void api.jobs.cancel(j.id)}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {jobs.length > 3 && <li className="text-[11.5px] font-bold text-muted">+{jobs.length - 3} more</li>}
      </ul>
    </div>
  );
}

export function Sidebar() {
  const route = useApp((s) => s.route);
  const navigate = useApp((s) => s.navigate);
  const snapshot = useApp((s) => s.snapshot);
  if (!snapshot) return null;
  const badges: Partial<Record<Route['name'], ReactNode>> = {
    practice: snapshot.dueReviews + snapshot.mistakesCount > 0 ? snapshot.dueReviews + snapshot.mistakesCount : undefined,
    targets: snapshot.targets.some((t) => t.status === 'researching' || t.status === 'building') ? (
      <LoaderCircle className="size-3.5 animate-spin" />
    ) : undefined,
    interview: snapshot.interviews.some((i) => i.status === 'active') ? '●' : undefined,
  };
  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r-2 border-line bg-elev">
      <div className="drag flex h-16 items-center gap-2.5 px-5">
        <Logo size={32} />
        <div className="leading-none">
          <div className="text-[19px] font-black tracking-tight">Ascend</div>
          <div className="text-[10.5px] font-bold tracking-wider text-faint uppercase">AI interview coach</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 px-3 pt-2">
        {NAV.map((item) => {
          const active = route.name === item.name || item.match?.includes(route.name);
          const Icon = item.icon;
          return (
            <button
              key={item.name}
              onClick={() => navigate({ name: item.name } as Route)}
              className={cn(
                'no-drag flex h-12 items-center gap-3 rounded-2xl border-2 px-3.5 text-[14.5px] font-extrabold tracking-wide transition-colors',
                active ? 'border-brand/40 bg-brand-soft text-brand-ink' : 'border-transparent text-muted hover:bg-hover hover:text-ink',
              )}
            >
              <Icon className={cn('size-[22px]', active ? 'text-brand' : '')} strokeWidth={2.4} />
              <span className="flex-1 text-left">{item.label}</span>
              {badges[item.name] !== undefined && (
                <span className="flex min-w-6 items-center justify-center rounded-full bg-bad px-1.5 py-0.5 text-[11px] font-black text-white">
                  {badges[item.name]}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="flex-1" />
      <JobsTray />
      <div className="border-t-2 border-line p-3">
        <button
          onClick={() => navigate({ name: 'settings' })}
          className={cn(
            'no-drag flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-hover',
            route.name === 'settings' && 'bg-hover',
          )}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8e7dff] to-[#5433db] text-sm font-black text-white">
            {initials(snapshot.profile.name || 'You')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold">{snapshot.profile.name || 'Learner'}</div>
            <div className="truncate text-xs font-bold text-faint">{snapshot.profile.targetRole || 'Interview prep'}</div>
          </div>
          <Settings className="size-5 text-faint" />
        </button>
      </div>
    </aside>
  );
}

export function useClickAway(ref: RefObject<HTMLElement | null>, onAway: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [ref, onAway, active]);
}

export function ModelPicker({ compact }: { compact?: boolean }) {
  const models = useApp((s) => s.models);
  const model = useApp((s) => s.snapshot?.settings.model ?? '');
  const navigate = useApp((s) => s.navigate);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(ref, () => setOpen(false), open);
  const list = (models.length ? models : FALLBACK_MODELS).filter((m) => m.value !== 'default');
  return (
    <div ref={ref} className="no-drag relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-xl border-2 border-line bg-elev px-3 text-[13px] font-extrabold text-ink hover:bg-hover"
        title="Claude model used for coaching"
      >
        <Cpu className="size-4 text-brand" />
        {!compact && <span className="max-w-[140px] truncate">{modelName(models, model)}</span>}
        <ChevronDown className="size-3.5 text-faint" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-11 right-0 z-50 w-[320px] rounded-2xl border-2 border-line bg-elev p-2 shadow-float"
          >
            <div className="px-3 pt-2 pb-1 text-[11px] font-extrabold tracking-wider text-faint uppercase">Coaching model</div>
            <div className="max-h-[360px] overflow-y-auto">
              {list.map((m) => (
                <button
                  key={m.value}
                  onClick={() => {
                    setOpen(false);
                    void attempt("Couldn't switch model", () => api.settings.update({ model: m.value }));
                  }}
                  className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover', m.value === model && 'bg-brand-soft')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-extrabold">
                      {m.displayName}
                      {m.value !== m.resolvedModel && m.resolvedModel && (
                        <span className="ml-1.5 text-[11px] font-bold text-faint">{m.value}</span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-muted">{m.description}</div>
                  </div>
                  {m.value === model && <Check className="mt-1 size-4 text-brand" />}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setOpen(false);
                navigate({ name: 'settings' });
              }}
              className="mt-1 w-full rounded-xl px-3 py-2 text-left text-[13px] font-extrabold text-brand hover:bg-hover"
            >
              Model & quality settings →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConnectionDot() {
  const connection = useApp((s) => s.connection);
  const navigate = useApp((s) => s.navigate);
  const color =
    connection.state === 'connected'
      ? 'bg-ok'
      : connection.state === 'error'
        ? 'bg-bad'
        : connection.state === 'checking'
          ? 'bg-warn animate-pulse'
          : 'bg-faint';
  const label =
    connection.state === 'connected'
      ? `Claude Code connected${connection.email ? ` · ${connection.email}` : ''}`
      : connection.state === 'error'
        ? `Claude Code: ${connection.error}`
        : 'Checking Claude Code…';
  return (
    <button onClick={() => navigate({ name: 'settings' })} title={label} className="no-drag flex size-9 items-center justify-center rounded-xl hover:bg-hover">
      <span className={cn('size-2.5 rounded-full', color)} />
    </button>
  );
}

export function StatChips() {
  const snapshot = useApp((s) => s.snapshot);
  if (!snapshot) return null;
  const xpToday = todayXp(snapshot);
  const goal = snapshot.settings.dailyGoalXp;
  const streak = snapshot.stats.streak.current;
  const activeToday = snapshot.stats.streak.lastDay === dayKey();
  return (
    <div className="no-drag flex items-center gap-1.5">
      <div
        className={cn('flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[14px] font-black', activeToday ? 'text-streak' : 'text-faint')}
        title={`${streak}-day streak`}
      >
        <Flame className="size-5" fill={activeToday ? 'currentColor' : 'none'} strokeWidth={2.2} />
        {streak}
      </div>
      <div className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[14px] font-black text-xp" title="Total XP">
        <Zap className="size-5" fill="currentColor" strokeWidth={2} />
        {fmtNumber(snapshot.stats.xp)}
      </div>
      <div className="flex h-9 items-center gap-2 rounded-xl px-2" title={`Daily goal: ${xpToday}/${goal} XP`}>
        <Ring value={xpToday / goal} size={30} stroke={4} color={xpToday >= goal ? 'var(--ok)' : 'var(--xp)'}>
          <span className="text-[9px] font-black">{Math.min(100, Math.round((xpToday / goal) * 100))}</span>
        </Ring>
      </div>
    </div>
  );
}

export function TopBar({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <header className="drag relative z-30 flex h-16 shrink-0 items-center gap-4 border-b-2 border-line bg-bg/80 pr-[150px] pl-8 backdrop-blur">
      <div className="min-w-0 flex-1 truncate text-[19px] font-black tracking-tight">{title}</div>
      {right}
      <StatChips />
      <ModelPicker />
      <ConnectionDot />
    </header>
  );
}
