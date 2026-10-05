import { Building2, CalendarDays, LoaderCircle, Plus, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { AppSnapshot, Target } from '@shared/types';
import { PageFrame } from '../../components/Page';
import { Mascot } from '../../components/Mascot';
import { Badge, Button, Ring } from '../../components/ui';
import { daysLeft, targetReadiness } from '../../lib/derive';
import { fmtDate } from '../../lib/format';
import { useApp } from '../../lib/store';
import { NewTargetModal } from './NewTargetModal';

const AVATAR_COLORS = ['#6c5ce7', '#0ea5e9', '#10b981', '#f43f5e', '#f08a24', '#6366f1', '#14b8a6'];

export function CompanyAvatar({ name, size = 52 }: { name: string; size?: number }) {
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className="flex shrink-0 items-center justify-center rounded-2xl font-black text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function TargetCard({ target, snapshot }: { target: Target; snapshot: AppSnapshot }) {
  const navigate = useApp((s) => s.navigate);
  const days = daysLeft(target);
  const readiness = targetReadiness(snapshot, target);
  const active = snapshot.profile.activeTargetId === target.id;
  const busy = target.status === 'researching' || target.status === 'building';
  return (
    <button onClick={() => navigate({ name: 'target', id: target.id })} className="tile press flex flex-col gap-4 p-5 text-left">
      <div className="flex w-full items-start gap-3">
        <CompanyAvatar name={target.company} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-black">{target.company}</div>
          <div className="truncate text-[13.5px] font-semibold text-muted">{target.role}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {active && <Badge tone="brand">Active</Badge>}
            {target.seniority && <Badge>{target.seniority}</Badge>}
            {busy && (
              <Badge tone="info" icon={<LoaderCircle className="size-3 animate-spin" />}>
                {target.status === 'researching' ? 'Researching' : 'Building path'}
              </Badge>
            )}
            {target.status === 'error' && (
              <Badge tone="bad" icon={<TriangleAlert className="size-3" />}>
                Failed
              </Badge>
            )}
          </div>
        </div>
        {target.status === 'ready' && (
          <Ring value={readiness.score / 100} size={54} stroke={6} color="var(--info)">
            <span className="text-[13px] font-black">{readiness.score}</span>
          </Ring>
        )}
      </div>
      <div className="flex w-full items-center gap-2 text-[13px] font-bold text-muted">
        <CalendarDays className="size-4" />
        {target.interviewDate ? (
          <span>
            {fmtDate(target.interviewDate)} · {days !== undefined && days >= 0 ? `${days} day${days === 1 ? '' : 's'} left` : 'date passed'}
          </span>
        ) : (
          <span>No interview date yet</span>
        )}
      </div>
    </button>
  );
}

export function TargetsPage() {
  const snapshot = useApp((s) => s.snapshot) as AppSnapshot;
  const [open, setOpen] = useState(false);
  return (
    <PageFrame
      title="Company prep"
      right={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
          New target
        </Button>
      }
    >
      {snapshot.targets.length === 0 ? (
        <div className="flex flex-col items-center gap-6 rounded-[28px] border-2 border-dashed border-line px-10 py-14 text-center">
          <Mascot mood="wave" size={120} />
          <div>
            <h2 className="text-2xl font-black">Got an interview coming up?</h2>
            <p className="mx-auto mt-2 max-w-xl text-[15px] font-semibold text-muted">
              Paste the job description and I'll research the company on the web, map the role's must-have skills against your profile, find your gaps, and build a day-by-day plan with a question track just for that interview.
            </p>
          </div>
          <Button caps size="lg" icon={<Building2 className="size-5" />} onClick={() => setOpen(true)}>
            Add a company target
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {snapshot.targets.map((t) => (
            <TargetCard key={t.id} target={t} snapshot={snapshot} />
          ))}
        </div>
      )}
      <NewTargetModal open={open} onClose={() => setOpen(false)} />
    </PageFrame>
  );
}
