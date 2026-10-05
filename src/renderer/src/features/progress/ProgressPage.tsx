import { Award, BookOpenCheck, ChevronDown, Clock, Flame, LoaderCircle, Mic, Pin, PinOff, Plus, Sparkles, Target, Trash2, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ACHIEVEMENTS, MASTERED } from '@shared/constants';
import { masteryLabel, trackStats } from '@shared/progress';
import type { AppSnapshot, NoteKind } from '@shared/types';
import { useRunning } from '../../components/AgentActivity';
import { PageFrame } from '../../components/Page';
import { Badge, Button, Card, IconButton, Input, ProgressBar, SectionTitle, Select, Stat } from '../../components/ui';
import { api } from '../../lib/api';
import { strongRows, weakRows } from '../../lib/derive';
import { cn, fmtNumber, relTime } from '../../lib/format';
import { attempt, startLesson, useApp } from '../../lib/store';
import { ActivityHeatmap, XpChart } from './Charts';

const NOTE_TONE: Record<NoteKind, 'ok' | 'warn' | 'brand' | 'info'> = { strength: 'ok', weakness: 'warn', insight: 'brand', plan: 'info' };

function InsightCard({ snapshot }: { snapshot: AppSnapshot }) {
  const running = useRunning('insight', ['insight']);
  const insight = snapshot.insights[0];
  return (
    <Card className="border-brand/30">
      <SectionTitle
        action={
          <Button size="sm" variant="soft" loading={running.length > 0} icon={<Sparkles className="size-3.5" />} onClick={() => void attempt("Couldn't start the report", () => api.insights.generate())}>
            {insight ? 'Refresh report' : 'Generate report'}
          </Button>
        }
      >
        Coach's progress report
      </SectionTitle>
      {running.length > 0 && !insight && (
        <div className="flex items-center gap-2 text-sm font-bold text-muted">
          <LoaderCircle className="size-4 animate-spin" /> Analysing your data…
        </div>
      )}
      {!insight && !running.length && <p className="text-sm font-semibold text-muted">Get an honest read on your progress, risks and a 7-day plan, written by your coach from your actual data.</p>}
      {insight && (
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-lg font-black">{insight.headline}</div>
            <div className="text-xs font-bold text-faint">{relTime(insight.createdAt)}</div>
            <p className="mt-2 text-[14.5px] font-semibold">{insight.summary}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-ok-soft p-4">
              <div className="mb-1.5 text-xs font-black tracking-wider text-ok-ink uppercase">Wins</div>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm font-semibold text-ok-ink">
                {insight.wins.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-warn-soft p-4">
              <div className="mb-1.5 text-xs font-black tracking-wider text-warn-ink uppercase">Risks</div>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm font-semibold text-warn-ink">
                {insight.risks.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
          {insight.plan.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-black tracking-wider text-faint uppercase">Next 7 days</div>
              <div className="grid grid-cols-2 gap-2">
                {insight.plan.map((p, i) => (
                  <div key={i} className="flex gap-3 rounded-2xl bg-sunken px-3.5 py-2.5 text-sm">
                    <span className="w-20 shrink-0 font-black text-brand">{p.when}</span>
                    <span className="font-semibold">{p.focus}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {insight.readiness.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-black tracking-wider text-faint uppercase">Interview readiness</div>
              <div className="flex flex-col gap-2.5">
                {insight.readiness.map((r) => (
                  <div key={r.area} className="grid grid-cols-[180px_1fr_40px] items-center gap-3">
                    <span className="truncate text-sm font-extrabold">{r.area}</span>
                    <div>
                      <ProgressBar value={r.score / 100} color="var(--info)" height={9} />
                      <div className="mt-0.5 text-xs font-semibold text-muted">{r.comment}</div>
                    </div>
                    <span className="text-right text-sm font-black">{r.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function NotesCard({ snapshot }: { snapshot: AppSnapshot }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<NoteKind>('plan');
  const notes = [...snapshot.notes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt));
  return (
    <Card>
      <SectionTitle>What your coach remembers</SectionTitle>
      <p className="mb-3 text-[13px] font-semibold text-muted">
        These notes shape every lesson, review and interview. Pin what matters; delete anything that's no longer true.
      </p>
      <div className="mb-4 flex gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value as NoteKind)} className="w-36">
          <option value="plan">Goal / plan</option>
          <option value="weakness">Weakness</option>
          <option value="strength">Strength</option>
          <option value="insight">Insight</option>
        </Select>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell your coach something, e.g. “Focus on system design for senior roles”" />
        <Button
          icon={<Plus className="size-4" />}
          disabled={!text.trim()}
          onClick={() => {
            void attempt("Couldn't save the note", () => api.notes.add({ kind, text }));
            setText('');
          }}
        >
          Add
        </Button>
      </div>
      <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
        {notes.map((n) => (
          <li key={n.id} className="group flex items-start gap-3 rounded-2xl bg-sunken px-3.5 py-2.5">
            <Badge tone={NOTE_TONE[n.kind]} className="mt-0.5">
              {n.kind}
            </Badge>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{n.text}</div>
              <div className="text-[11px] font-bold text-faint">
                {n.source} · {relTime(n.createdAt)}
              </div>
            </div>
            <IconButton label={n.pinned ? 'Unpin' : 'Pin'} className="size-7" onClick={() => void api.notes.togglePin(n.id)}>
              {n.pinned ? <PinOff className="size-3.5 text-brand" /> : <Pin className="size-3.5" />}
            </IconButton>
            <IconButton label="Delete note" className="size-7 opacity-0 group-hover:opacity-100" onClick={() => void api.notes.remove(n.id)}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </li>
        ))}
        {!notes.length && <li className="text-sm font-semibold text-faint">No notes yet — they appear as you learn.</li>}
      </ul>
    </Card>
  );
}

function MasteryBreakdown({ snapshot }: { snapshot: AppSnapshot }) {
  const [open, setOpen] = useState<string | null>(snapshot.profile.activeTrackId ?? null);
  const tracks = snapshot.tracks.filter((t) => t.status === 'ready');
  return (
    <div className="flex flex-col gap-3">
      {tracks.map((t) => {
        const s = trackStats(t, snapshot.topicProgress, snapshot.trackProgress);
        const isOpen = open === t.id;
        return (
          <div key={t.id} className="rounded-3xl border-2 border-line bg-elev">
            <button onClick={() => setOpen(isOpen ? null : t.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left">
              <span className="text-2xl">{t.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-black">{t.title}</span>
                  <span className="text-[13px] font-bold text-muted">
                    {t.kind === 'target' ? 'Stage' : 'Level'} {s.currentLevel}/{t.levels.length} · {s.completedTopics}/{s.totalTopics} topics · {s.masteredTopics} mastered
                  </span>
                </div>
                <ProgressBar value={s.percent / 100} color={t.color} height={9} className="mt-2" />
              </div>
              <ChevronDown className={cn('size-5 shrink-0 text-faint transition-transform', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-t-2 border-line px-5 py-4">
                {t.levels.map((l) => (
                  <div key={l.number}>
                    <div className="mb-2 text-xs font-black tracking-wider text-faint uppercase">
                      {l.number}. {l.title}
                    </div>
                    <ul className="flex flex-col gap-2">
                      {l.topics.map((topic) => {
                        const p = snapshot.topicProgress[topic.id];
                        const m = Math.round(p?.mastery ?? 0);
                        return (
                          <li key={topic.id} className="grid grid-cols-[1fr_120px_36px] items-center gap-3 text-[13px]">
                            <span className="truncate font-bold" title={masteryLabel(m, p?.attempts ?? 0)}>
                              {topic.title}
                            </span>
                            <ProgressBar value={m / 100} height={7} color={m >= MASTERED ? '#ffb020' : t.color} />
                            <span className="text-right font-black text-muted tabular-nums">{p?.attempts ? m : '–'}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProgressPage() {
  const snapshot = useApp((s) => s.snapshot) as AppSnapshot;
  const s = snapshot.stats;
  const minutes = Object.values(s.minutesByDay).reduce((a, b) => a + b, 0);
  const accuracy = s.questionsAnswered ? Math.round((s.correctAnswers / s.questionsAnswered) * 100) : 0;
  const weak = useMemo(() => weakRows(snapshot, undefined, 6), [snapshot]);
  const strong = useMemo(() => strongRows(snapshot, undefined, 6), [snapshot]);
  const unlocked = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;

  return (
    <PageFrame title="Progress">
      <div className="grid grid-cols-6 gap-3">
        <Stat label="Total XP" value={fmtNumber(s.xp)} icon={<Zap className="size-5" fill="currentColor" />} tone="var(--xp)" />
        <Stat label="Day streak" value={s.streak.current} sub={`best ${s.streak.longest}`} icon={<Flame className="size-5" fill="currentColor" />} tone="var(--streak)" />
        <Stat label="Lessons" value={s.lessonsCompleted} icon={<BookOpenCheck className="size-5" />} tone="var(--brand)" />
        <Stat label="Accuracy" value={`${accuracy}%`} sub={`${fmtNumber(s.questionsAnswered)} answers`} icon={<Target className="size-5" />} tone="var(--ok)" />
        <Stat label="Mock interviews" value={s.interviewsCompleted} icon={<Mic className="size-5" />} tone="var(--info)" />
        <Stat label="Time practised" value={minutes >= 60 ? `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m` : `${Math.round(minutes)}m`} icon={<Clock className="size-5" />} tone="#8b5cf6" />
      </div>

      <div className="mt-6 grid grid-cols-[1.4fr_1fr] gap-6">
        <Card>
          <SectionTitle>XP per day</SectionTitle>
          <XpChart stats={s} goal={snapshot.settings.dailyGoalXp} />
        </Card>
        <Card>
          <SectionTitle>Activity</SectionTitle>
          <ActivityHeatmap stats={s} weeks={18} />
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sunken px-4 py-3 text-sm font-semibold">
            <Flame className="size-5 text-streak" fill="currentColor" />
            {s.streak.current > 0 ? `You're on a ${s.streak.current}-day streak. Keep it alive today!` : 'Complete a lesson today to start a streak.'}
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <InsightCard snapshot={snapshot} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <Card>
          <SectionTitle>Strongest concepts</SectionTitle>
          {strong.length ? (
            <ul className="flex flex-col gap-3">
              {strong.map((c) => (
                <li key={`${c.topicId}-${c.concept}`}>
                  <div className="mb-1 flex justify-between text-[13.5px] font-extrabold">
                    <span className="truncate">{c.concept}</span>
                    <span className="text-muted">{c.strength}%</span>
                  </div>
                  <ProgressBar value={c.strength / 100} color="var(--ok)" height={8} />
                  <div className="mt-0.5 truncate text-[11.5px] font-bold text-faint">
                    {c.trackTitle} · {c.topicTitle}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-semibold text-muted">Strengths show up after you answer a few questions on a concept correctly.</p>
          )}
        </Card>
        <Card>
          <SectionTitle>Needs work</SectionTitle>
          {weak.length ? (
            <ul className="flex flex-col gap-3">
              {weak.map((c) => (
                <li key={`${c.topicId}-${c.concept}`} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex justify-between text-[13.5px] font-extrabold">
                      <span className="truncate">{c.concept}</span>
                      <span className="text-muted">{c.strength}%</span>
                    </div>
                    <ProgressBar value={c.strength / 100} color="var(--warn)" height={8} />
                    <div className="mt-0.5 truncate text-[11.5px] font-bold text-faint">
                      {c.trackTitle} · {c.topicTitle}
                    </div>
                  </div>
                  <Button size="sm" variant="soft" onClick={() => void startLesson({ trackId: c.trackId, kind: 'custom', focus: `${c.concept} (${c.topicTitle})`, title: `Drill: ${c.concept}` })}>
                    Drill
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-semibold text-muted">Nothing flagged yet. Your coach tracks every concept you practise.</p>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <SectionTitle>Topic mastery</SectionTitle>
        <MasteryBreakdown snapshot={snapshot} />
      </div>

      <div className="mt-6 grid grid-cols-[1.2fr_1fr] gap-6">
        <NotesCard snapshot={snapshot} />
        <Card>
          <SectionTitle>
            Achievements · {unlocked}/{ACHIEVEMENTS.length}
          </SectionTitle>
          <div className="grid grid-cols-3 gap-2.5">
            {ACHIEVEMENTS.map((a) => {
              const at = s.achievements[a.id];
              return (
                <div
                  key={a.id}
                  title={a.description}
                  className={cn('flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center', at ? 'border-xp/40 bg-warn-soft' : 'border-line bg-sunken opacity-55 grayscale')}
                >
                  <span className="text-2xl">{a.emoji}</span>
                  <span className="text-[12px] leading-tight font-black">{a.title}</span>
                  <span className="text-[10.5px] leading-tight font-semibold text-muted">{at ? relTime(at) : a.description}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-bold text-faint">
            <Award className="size-4" /> Achievements unlock automatically as you learn.
          </div>
        </Card>
      </div>
    </PageFrame>
  );
}
