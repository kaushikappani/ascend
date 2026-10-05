import { ArrowLeft, CalendarDays, ChevronDown, ExternalLink, Lightbulb, MapPin, Mic, Newspaper, RotateCcw, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { daysBetween, dayKey } from '@shared/progress';
import type { AppSnapshot, CompanyBrief, InterviewStyle, Target } from '@shared/types';
import { ActivityFeed, useJobs } from '../../components/AgentActivity';
import { Markdown } from '../../components/Markdown';
import { Mascot, SpeechBubble } from '../../components/Mascot';
import { ConfirmModal } from '../../components/Modal';
import { PageFrame } from '../../components/Page';
import { Badge, Button, Card, IconButton, Ring, SectionTitle } from '../../components/ui';
import { api } from '../../lib/api';
import { daysLeft, targetReadiness } from '../../lib/derive';
import { cn, fmtDate } from '../../lib/format';
import { attempt, useApp } from '../../lib/store';
import { PathView } from '../learn/PathView';
import { CompanyAvatar } from './TargetsPage';

type Tab = 'overview' | 'role' | 'plan' | 'questions' | 'path';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'role', label: 'Role & gaps' },
  { id: 'plan', label: 'Prep plan' },
  { id: 'questions', label: 'Likely questions' },
  { id: 'path', label: 'Prep path' },
];

const IMPORTANCE_TONE = { critical: 'bad', high: 'warn', medium: 'info', low: 'neutral' } as const;
const LEVEL_TONE = { none: 'bad', basic: 'warn', intermediate: 'info', strong: 'ok' } as const;
const CATEGORY_LABEL: Record<CompanyBrief['likelyQuestions'][number]['category'], string> = {
  technical: 'Technical',
  coding: 'Coding',
  system_design: 'System design',
  behavioral: 'Behavioral',
  company: 'Company & motivation',
};
const CATEGORY_STYLE: Record<string, InterviewStyle> = { technical: 'technical', coding: 'technical', system_design: 'system_design', behavioral: 'behavioral', company: 'behavioral' };

function Overview({ brief }: { brief: CompanyBrief }) {
  return (
    <div className="grid grid-cols-[1fr_340px] gap-6">
      <div className="flex flex-col gap-6">
        <Card>
          <SectionTitle>About the company</SectionTitle>
          <Markdown text={brief.overview} />
        </Card>
        {brief.interviewProcess.length > 0 && (
          <Card>
            <SectionTitle>Interview process</SectionTitle>
            <ol className="flex flex-col gap-3">
              {brief.interviewProcess.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-black text-white">{i + 1}</span>
                  <div>
                    <div className="font-extrabold">{s.stage}</div>
                    <div className="text-sm font-semibold text-muted">{s.description}</div>
                    {s.tips && <div className="mt-1 text-[13px] font-semibold text-brand-ink">💡 {s.tips}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        )}
        {brief.values.length > 0 && (
          <Card>
            <SectionTitle>Values & how to show them</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {brief.values.map((v) => (
                <div key={v.name} className="rounded-2xl bg-sunken p-3.5">
                  <div className="font-extrabold">{v.name}</div>
                  <div className="mt-0.5 text-[13px] font-semibold text-muted">{v.howToShow}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      <div className="flex flex-col gap-6">
        {brief.techStack.length > 0 && (
          <Card>
            <SectionTitle>Tech stack</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {brief.techStack.map((t) => (
                <Badge key={t} tone="info">
                  {t}
                </Badge>
              ))}
            </div>
          </Card>
        )}
        {brief.tips.length > 0 && (
          <Card>
            <SectionTitle>Tips for this interview</SectionTitle>
            <ul className="flex flex-col gap-2">
              {brief.tips.map((t) => (
                <li key={t} className="flex gap-2 text-sm font-semibold">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" /> {t}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {brief.recentNews.length > 0 && (
          <Card>
            <SectionTitle>Recent news</SectionTitle>
            <ul className="flex flex-col gap-2">
              {brief.recentNews.map((n) => (
                <li key={n} className="flex gap-2 text-sm font-semibold text-muted">
                  <Newspaper className="mt-0.5 size-4 shrink-0" /> {n}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {brief.sources.length > 0 && (
          <Card>
            <SectionTitle>Sources</SectionTitle>
            <ul className="flex flex-col gap-1.5">
              {brief.sources.map((s) => (
                <li key={s.url}>
                  <button onClick={() => void api.app.openExternal(s.url)} className="flex items-start gap-1.5 text-left text-[13px] font-bold text-brand hover:underline">
                    <ExternalLink className="mt-0.5 size-3.5 shrink-0" /> {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function RoleAndGaps({ brief }: { brief: CompanyBrief }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <SectionTitle>What this role really needs</SectionTitle>
        <p className="text-[15px] font-semibold">{brief.roleSummary}</p>
        <div className="mt-4 grid grid-cols-3 gap-4">
          {(
            [
              ['Must-have', brief.mustHave, 'bad'],
              ['Nice-to-have', brief.niceToHave, 'info'],
              ['Keywords', brief.keywords, 'neutral'],
            ] as const
          ).map(([label, items, tone]) => (
            <div key={label}>
              <div className="mb-2 text-xs font-black tracking-wider text-faint uppercase">{label}</div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((i) => (
                  <Badge key={i} tone={tone}>
                    {i}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle>Your skill gaps</SectionTitle>
        <div className="flex flex-col divide-y-2 divide-line">
          {brief.skillGaps.map((g) => (
            <div key={g.skill} className="grid grid-cols-[220px_1fr] gap-4 py-3.5">
              <div>
                <div className="font-extrabold">{g.skill}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone={IMPORTANCE_TONE[g.importance]}>{g.importance}</Badge>
                  <Badge tone={LEVEL_TONE[g.currentLevel]}>you: {g.currentLevel}</Badge>
                </div>
              </div>
              <div className="text-sm font-semibold">
                <div className="text-muted">{g.gap}</div>
                <div className="mt-1 text-brand-ink">→ {g.action}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Plan({ target }: { target: Target }) {
  const brief = target.brief as CompanyBrief;
  const dayIndex = daysBetween(target.createdAt.slice(0, 10), dayKey());
  return (
    <div className="grid grid-cols-2 gap-4">
      {brief.prepPlan.map((p, i) => {
        const today = i === dayIndex && /day/i.test(p.day);
        return (
          <div key={i} className={cn('rounded-3xl border-2 bg-elev p-5', today ? 'border-brand' : 'border-line')}>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-black text-muted">{p.day}</span>
              {today && <Badge tone="brand">Today</Badge>}
            </div>
            <div className="mt-2 font-black">{p.focus}</div>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm font-semibold text-muted">
              {p.tasks.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Questions({ target, onPractice }: { target: Target; onPractice: (style: InterviewStyle) => void }) {
  const brief = target.brief as CompanyBrief;
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, CompanyBrief['likelyQuestions']>();
    for (const q of brief.likelyQuestions) m.set(q.category, [...(m.get(q.category) ?? []), q]);
    return [...m.entries()];
  }, [brief.likelyQuestions]);
  return (
    <div className="flex flex-col gap-6">
      {groups.map(([category, qs]) => (
        <div key={category}>
          <SectionTitle
            action={
              <Button size="sm" variant="soft" icon={<Mic className="size-3.5" />} onClick={() => onPractice(CATEGORY_STYLE[category] ?? 'mixed')}>
                Practise in a mock interview
              </Button>
            }
          >
            {CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL] ?? category}
          </SectionTitle>
          <div className="flex flex-col gap-2.5">
            {qs.map((q) => (
              <div key={q.question} className="rounded-2xl border-2 border-line bg-elev">
                <button onClick={() => setOpen(open === q.question ? null : q.question)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                  <span className="min-w-0 flex-1 text-[14.5px] font-extrabold">{q.question}</span>
                  <ChevronDown className={cn('size-5 shrink-0 text-faint transition-transform', open === q.question && 'rotate-180')} />
                </button>
                {open === q.question && (
                  <div className="border-t-2 border-line px-4 py-3.5">
                    <div className="text-[13px] font-semibold text-muted">Why they ask: {q.whyAsked}</div>
                    <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm font-semibold">
                      {q.answerHints.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Researching({ target }: { target: Target }) {
  const jobs = useJobs(target.id, ['target']);
  const roadmapJobs = useJobs(target.trackId, ['roadmap']);
  return (
    <div className="flex flex-col items-center gap-6 rounded-[28px] border-2 border-line bg-elev px-8 py-12">
      <div className="flex items-center gap-5">
        <Mascot mood="thinking" size={110} />
        <SpeechBubble className="max-w-md">
          {target.status === 'building' ? `Building your ${target.company} prep path…` : `Researching ${target.company}…`}
          <div className="mt-1 text-[13px] font-semibold text-muted">
            Reading about the company, its interview process and tech stack, then mapping the job description against your profile. You can keep learning meanwhile — I'll notify you.
          </div>
        </SpeechBubble>
      </div>
      <ActivityFeed jobs={[...jobs, ...roadmapJobs]} max={7} className="w-full max-w-lg" />
    </div>
  );
}

export function TargetDetail({ id }: { id: string }) {
  const snapshot = useApp((s) => s.snapshot) as AppSnapshot;
  const navigate = useApp((s) => s.navigate);
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const target = snapshot.targets.find((t) => t.id === id);
  if (!target) {
    return (
      <PageFrame title="Company prep">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => navigate({ name: 'targets' })}>
          Back to targets
        </Button>
      </PageFrame>
    );
  }
  const track = snapshot.tracks.find((t) => t.id === target.trackId);
  const days = daysLeft(target);
  const readiness = targetReadiness(snapshot, target);
  const active = snapshot.profile.activeTargetId === target.id;
  const brief = target.brief;

  const practice = async (style: InterviewStyle) => {
    const sid = await attempt("Couldn't start the interview", () =>
      api.interviews.start({ targetId: target.id, style, difficulty: 'auto', persona: 'neutral', questionCount: 6 }),
    );
    if (sid) navigate({ name: 'interview', id: sid });
  };

  return (
    <PageFrame title="Company prep">
      <button onClick={() => navigate({ name: 'targets' })} className="mb-4 flex items-center gap-1.5 text-sm font-extrabold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All targets
      </button>
      <div className="mb-6 flex items-center gap-5 rounded-[28px] border-2 border-line bg-elev p-6">
        <CompanyAvatar name={target.company} size={68} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] leading-tight font-black">{target.company}</h1>
          <div className="truncate text-[15px] font-semibold text-muted">{target.role}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {target.seniority && <Badge>{target.seniority}</Badge>}
            {target.location && (
              <Badge icon={<MapPin className="size-3" />}>{target.location}</Badge>
            )}
            <Badge tone="info" icon={<CalendarDays className="size-3" />}>
              {target.interviewDate ? `${fmtDate(target.interviewDate)}${days !== undefined && days >= 0 ? ` · ${days} days left` : ''}` : 'No date set'}
            </Badge>
            {active ? (
              <Badge tone="brand" icon={<Star className="size-3" fill="currentColor" />}>
                Active target
              </Badge>
            ) : (
              <button onClick={() => void api.targets.setActive(target.id)} className="rounded-full border-2 border-dashed border-line px-2.5 py-0.5 text-xs font-bold text-muted hover:border-brand hover:text-brand">
                Set as active
              </button>
            )}
          </div>
        </div>
        {target.status === 'ready' && (
          <div className="flex flex-col items-center">
            <Ring value={readiness.score / 100} size={84} stroke={8} color="var(--info)">
              <span className="text-xl font-black">{readiness.score}</span>
            </Ring>
            <span className="mt-1 text-[11px] font-black tracking-wider text-faint uppercase">{readiness.estimated ? 'Initial estimate' : 'Readiness'}</span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {target.status === 'ready' && (
            <Button icon={<Mic className="size-4" />} onClick={() => void practice('mixed')}>
              Mock interview
            </Button>
          )}
          <div className="flex justify-end gap-1">
            {(target.status === 'error' || target.error) && (
              <IconButton label="Retry" onClick={() => void attempt('Retry failed', () => api.targets.retry(target.id))}>
                <RotateCcw className="size-4" />
              </IconButton>
            )}
            <IconButton label="Delete target" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        </div>
      </div>

      {target.error && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-bad/40 bg-bad-soft px-4 py-3 text-sm font-semibold text-bad-ink">
          <span className="flex-1">{target.error}</span>
          <Button size="sm" variant="danger" onClick={() => void attempt('Retry failed', () => api.targets.retry(target.id))}>
            Retry
          </Button>
        </div>
      )}

      {!brief && (target.status === 'researching' || target.status === 'building') && <Researching target={target} />}

      {brief && (
        <>
          <div className="mb-6 flex gap-1 rounded-2xl bg-sunken p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn('flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all', tab === t.id ? 'bg-elev text-ink shadow-card' : 'text-muted hover:text-ink')}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'overview' && <Overview brief={brief} />}
          {tab === 'role' && <RoleAndGaps brief={brief} />}
          {tab === 'plan' && <Plan target={target} />}
          {tab === 'questions' && <Questions target={target} onPractice={(s) => void practice(s)} />}
          {tab === 'path' &&
            (track?.status === 'ready' ? (
              <div className="mx-auto max-w-[640px]">
                <PathView track={track} snapshot={snapshot} />
              </div>
            ) : (
              <Researching target={target} />
            ))}
        </>
      )}
      <ConfirmModal
        open={confirmDelete}
        title={`Delete ${target.company}?`}
        body="This removes the brief, the prep path and its progress."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          void attempt("Couldn't delete", () => api.targets.remove(target.id));
          navigate({ name: 'targets' });
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </PageFrame>
  );
}
