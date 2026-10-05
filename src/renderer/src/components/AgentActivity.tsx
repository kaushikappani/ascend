import { Brain, CircleAlert, Globe, LoaderCircle, PenLine, RotateCcw, Search, Wrench } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ActivityKind, JobInfo, JobKind } from '@shared/types';
import { cn } from '../lib/format';
import { useApp } from '../lib/store';

const KIND_ICON: Record<ActivityKind, typeof Search> = {
  status: LoaderCircle,
  search: Search,
  fetch: Globe,
  tool: Wrench,
  thinking: Brain,
  writing: PenLine,
  retry: RotateCcw,
};

const KIND_COLOR: Record<ActivityKind, string> = {
  status: 'text-faint',
  search: 'text-info',
  fetch: 'text-info',
  tool: 'text-brand',
  thinking: 'text-brand',
  writing: 'text-ok',
  retry: 'text-warn',
};

/** Running (and just-finished) jobs for a given reference id. */
export function useJobs(refId?: string, kinds?: JobKind[]): JobInfo[] {
  const jobs = useApp((s) => s.jobs);
  return jobs.filter((j) => (!refId || j.refId === refId) && (!kinds || kinds.includes(j.kind)));
}

export function useRunning(refId?: string, kinds?: JobKind[]): JobInfo[] {
  return useJobs(refId, kinds).filter((j) => j.status === 'running');
}

export function ActivityFeed({ jobs, max = 5, className, compact }: { jobs: JobInfo[]; max?: number; className?: string; compact?: boolean }) {
  const items = jobs
    .flatMap((j) => j.activity.map((a) => ({ ...a, job: j })))
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-max);
  const running = jobs.some((j) => j.status === 'running');
  if (!items.length) {
    return running ? (
      <div className={cn('flex items-center gap-2 text-sm font-semibold text-muted', className)}>
        <LoaderCircle className="size-4 animate-spin text-brand" /> Starting Claude Code…
      </div>
    ) : null;
  }
  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      <AnimatePresence initial={false}>
        {items.map((item, i) => {
          const Icon = KIND_ICON[item.kind];
          const last = i === items.length - 1;
          const live = last && item.job.status === 'running';
          return (
            <motion.li
              key={`${item.job.id}-${item.at}-${item.text}`}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: last ? 1 : 0.55, y: 0 }}
              className={cn('flex items-start gap-2.5 font-semibold', compact ? 'text-[12.5px]' : 'text-sm')}
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', KIND_COLOR[item.kind], live && item.kind === 'status' && 'animate-spin')} />
              <span className={cn('min-w-0 flex-1', last ? 'text-ink' : 'text-muted')}>{item.text}</span>
              {live && <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-faint" />}
            </motion.li>
          );
        })}
      </AnimatePresence>
      {jobs.some((j) => j.status === 'error') && (
        <li className="flex items-start gap-2.5 text-sm font-semibold text-bad">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {jobs.find((j) => j.status === 'error')?.error}
        </li>
      )}
    </ul>
  );
}
