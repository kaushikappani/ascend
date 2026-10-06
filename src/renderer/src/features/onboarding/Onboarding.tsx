import { ArrowLeft, ArrowRight, Check, CircleAlert, KeyRound, LoaderCircle, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { NewTrackInput } from '@shared/api';
import { DAILY_GOALS, FALLBACK_MODELS, START_LEVEL_OPTIONS, startLevelOption, TRACK_COLORS, TRACK_PRESETS } from '@shared/constants';
import { ActivityFeed, useJobs } from '../../components/AgentActivity';
import { Logo, Mascot, SpeechBubble, type Mood } from '../../components/Mascot';
import { Button, Chip, Input, Label, Segmented, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { cn } from '../../lib/format';
import { attempt, toastError, useApp } from '../../lib/store';

const EXPERIENCE = [
  { value: 0, label: '< 1 yr' },
  { value: 2, label: '1–3 yrs' },
  { value: 4, label: '3–5 yrs' },
  { value: 6, label: '5–8 yrs' },
  { value: 10, label: '8+ yrs' },
];

const ROLE_SUGGESTIONS = ['Backend Engineer (Java)', 'Senior Software Engineer', 'AI / ML Engineer', 'Agentic AI Engineer', 'Full-stack Engineer', 'Tech Lead'];
const TIMELINES = ['Interviewing now', 'Within a month', 'In 1–3 months', 'Just levelling up'];

interface CustomTrack {
  title: string;
  subject: string;
}

function StepShell({ mood, bubble, children }: { mood: Mood; bubble: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-5">
        <Mascot mood={mood} size={104} />
        <SpeechBubble className="flex-1">{bubble}</SpeechBubble>
      </div>
      {children}
    </div>
  );
}

function ConnectionCard() {
  const connection = useApp((s) => s.connection);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const retry = () => void attempt('Check failed', () => api.claude.check());
  if (connection.state === 'connected') {
    return (
      <div className="flex items-center gap-4 rounded-3xl border-2 border-ok/40 bg-ok-soft p-5">
        <div className="flex size-11 items-center justify-center rounded-full bg-ok text-white">
          <Check className="size-6" strokeWidth={3} />
        </div>
        <div className="min-w-0">
          <div className="font-black text-ok-ink">Connected to Claude Code</div>
          <div className="truncate text-sm font-semibold text-ok-ink/80">
            {[connection.email, connection.subscription && `Claude ${connection.subscription.replace(/^Claude /, '')}`, connection.organization, connection.claudeVersion && `v${connection.claudeVersion}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>
    );
  }
  if (connection.state === 'error') {
    return (
      <div className="rounded-3xl border-2 border-bad/40 bg-bad-soft p-5 text-bad-ink">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 size-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-black">Claude Code isn't ready yet</div>
            <div className="mt-1 text-sm font-semibold opacity-90">{connection.error}</div>
            <ol className="mt-3 list-decimal pl-5 text-sm font-semibold">
              <li>Open a terminal and run <code className="rounded bg-elev px-1.5 font-mono">claude</code></li>
              <li>
                Type <code className="rounded bg-elev px-1.5 font-mono">/login</code> and sign in with your Claude account
              </li>
              <li>Come back here and press Retry</li>
            </ol>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="danger" size="sm" icon={<RotateCcw className="size-4" />} onClick={retry}>
            Retry
          </Button>
          <Button variant="ghost" size="sm" icon={<KeyRound className="size-4" />} onClick={() => setShowKey((v) => !v)}>
            Use an API key instead
          </Button>
        </div>
        {showKey && (
          <div className="mt-3 flex gap-2">
            <Input type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
            <Button disabled={!key.trim()} onClick={() => void attempt("Couldn't save the key", () => api.claude.setApiKey(key.trim()))}>
              Save
            </Button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 rounded-3xl border-2 border-line bg-elev p-5">
      <LoaderCircle className="size-7 animate-spin text-brand" />
      <div>
        <div className="font-black">Connecting to Claude Code…</div>
        <div className="text-sm font-semibold text-muted">Checking your sign-in and the models you can use.</div>
      </div>
    </div>
  );
}

function BuildStep({ trackIds }: { trackIds: string[] }) {
  const snapshot = useApp((s) => s.snapshot);
  const setActive = useApp((s) => s.setOnboardingActive);
  const jobs = useJobs(undefined, ['roadmap']);
  const tracks = snapshot?.tracks.filter((t) => trackIds.length === 0 || trackIds.includes(t.id)) ?? [];
  const anyReady = tracks.some((t) => t.status === 'ready');
  const allDone = tracks.length > 0 && tracks.every((t) => t.status !== 'generating');
  return (
    <StepShell
      mood={allDone ? 'celebrate' : 'thinking'}
      bubble={
        allDone ? (
          'Your roadmaps are ready. Time to start climbing!'
        ) : (
          <>
            Designing your personal roadmaps…
            <div className="mt-1 text-[13px] font-semibold text-muted">Claude is mapping 10 levels per track around your experience and goals. This takes a minute or two.</div>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {tracks.map((t) => {
          const topicCount = t.levels.reduce((s, l) => s + l.topics.length, 0);
          const trackJobs = jobs.filter((j) => j.refId === t.id);
          return (
            <div key={t.id} className="rounded-3xl border-2 border-line bg-elev p-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{t.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-black">{t.title}</div>
                  <div className="text-[13px] font-semibold text-muted">
                    {t.status === 'ready'
                      ? `${t.levels.length} levels · ${topicCount} topics · Level 1 pitched at “${startLevelOption(t.baseLevel ?? 1).label}”`
                      : t.status === 'error'
                        ? t.error
                        : 'Designing…'}
                  </div>
                </div>
                {t.status === 'ready' ? (
                  <span className="flex size-9 items-center justify-center rounded-full bg-ok text-white">
                    <Check className="size-5" strokeWidth={3} />
                  </span>
                ) : t.status === 'error' ? (
                  <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => void api.tracks.regenerate(t.id)}>
                    Retry
                  </Button>
                ) : (
                  <LoaderCircle className="size-6 animate-spin text-brand" />
                )}
              </div>
              {t.status === 'generating' && <ActivityFeed jobs={trackJobs} max={3} compact className="mt-3 border-t-2 border-dashed border-line pt-3" />}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button caps size="lg" disabled={!anyReady} icon={<Sparkles className="size-5" />} onClick={() => setActive(false)}>
          {anyReady ? 'Start learning' : 'Almost there…'}
        </Button>
      </div>
    </StepShell>
  );
}

export function Onboarding() {
  const snapshot = useApp((s) => s.snapshot);
  const models = useApp((s) => s.models);
  const setActive = useApp((s) => s.setOnboardingActive);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(snapshot?.profile.name ?? '');
  const [currentRole, setCurrentRole] = useState('');
  const [experience, setExperience] = useState(2);
  const [targetRole, setTargetRole] = useState('');
  const [timeline, setTimeline] = useState('');
  const [goals, setGoals] = useState('');
  const [selected, setSelected] = useState<string[]>(['java-spring', 'agentic-ai']);
  const [custom, setCustom] = useState<CustomTrack[]>([]);
  const [customTitle, setCustomTitle] = useState('');
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [goal, setGoal] = useState(50);
  const [model, setModel] = useState(snapshot?.settings.model ?? FALLBACK_MODELS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [createdIds, setCreatedIds] = useState<string[]>([]);

  useEffect(() => {
    setActive(true);
  }, [setActive]);

  const modelList = (models.length ? models : FALLBACK_MODELS).filter((m) => m.value !== 'default');
  const defaultLevel = experience >= 4 ? 3 : 1;
  const chosenTracks = useMemo(
    () => [
      ...TRACK_PRESETS.filter((p) => selected.includes(p.key)).map((p) => ({ key: p.key, title: p.title, emoji: p.emoji })),
      ...custom.map((c, i) => ({ key: `custom-${i}`, title: c.title, emoji: '📘' })),
    ],
    [selected, custom],
  );

  const submit = async () => {
    setSubmitting(true);
    const tracks: NewTrackInput[] = [
      ...TRACK_PRESETS.filter((p) => selected.includes(p.key)).map((p) => ({
        title: p.title,
        subject: p.subject,
        emoji: p.emoji,
        color: p.color,
        tagline: p.tagline,
        proficiency: levels[p.key] ?? defaultLevel,
        kind: 'core' as const,
      })),
      ...custom.map((c, i) => ({
        title: c.title,
        subject: c.subject || c.title,
        emoji: '📘',
        color: TRACK_COLORS[(i + 3) % TRACK_COLORS.length],
        proficiency: levels[`custom-${i}`] ?? defaultLevel,
        kind: 'custom' as const,
      })),
    ];
    const before = new Set(snapshot?.tracks.map((t) => t.id) ?? []);
    try {
      await api.onboarding.complete({
        profile: { name: name.trim(), currentRole: currentRole.trim(), experienceYears: experience, targetRole: targetRole.trim(), goals: goals.trim(), timeline },
        tracks,
        dailyGoalXp: goal,
        model,
      });
    } catch (error) {
      toastError("Couldn't save your setup", error);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    const snap = await api.app.snapshot();
    setCreatedIds(snap.tracks.filter((t) => !before.has(t.id)).map((t) => t.id));
    setStep(5);
  };

  const canNext = [true, name.trim().length > 0, chosenTracks.length > 0, true, true][step] ?? false;
  const next = () => {
    if (step === 4) void submit();
    else setStep((s) => s + 1);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="drag flex h-12 shrink-0 items-center gap-2.5 px-6">
        <Logo size={24} />
        <span className="text-[15px] font-black">Ascend</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-8 px-8 pt-6 pb-16">
          <div className="flex items-center gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={cn('h-2.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-brand' : 'bg-sunken')} />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
              {step === 0 && (
                <StepShell
                  mood="wave"
                  bubble={
                    <>
                      Hi! I'm <span className="text-brand">Ace</span>, your AI interview coach.
                      <div className="mt-1 text-[13.5px] font-semibold text-muted">
                        Powered by Claude Code, I design a roadmap that starts at your level and keeps growing past level 10, teach with bite-sized reads and hands-on warm-ups, quiz you Duolingo-style, and adapt to every answer — plus company-specific prep and mock interviews.
                      </div>
                    </>
                  }
                >
                  <ConnectionCard />
                </StepShell>
              )}
              {step === 1 && (
                <StepShell mood="happy" bubble="Tell me a little about yourself so I can pitch everything at the right level.">
                  <div className="grid gap-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Your name</Label>
                        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kaushik" />
                      </div>
                      <div>
                        <Label hint="optional">Current role</Label>
                        <Input value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} placeholder="e.g. Software Engineer at …" />
                      </div>
                    </div>
                    <div>
                      <Label>Experience</Label>
                      <Segmented value={experience} onChange={setExperience} options={EXPERIENCE} />
                    </div>
                    <div>
                      <Label>Role you're preparing for</Label>
                      <Input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ROLE_SUGGESTIONS.map((r) => (
                          <Chip key={r} active={targetRole === r} onClick={() => setTargetRole(r)}>
                            {r}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Timeline</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {TIMELINES.map((t) => (
                          <Chip key={t} active={timeline === t} onClick={() => setTimeline(t)}>
                            {t}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label hint="optional">Anything I should know?</Label>
                      <Textarea rows={3} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. I want to move into agentic AI roles; system design is my weak spot; interviews at product companies." />
                    </div>
                  </div>
                </StepShell>
              )}
              {step === 2 && (
                <StepShell mood="happy" bubble="What do you want to master? Pick as many as you like — you can add more any time.">
                  <div className="grid grid-cols-2 gap-3">
                    {TRACK_PRESETS.map((p) => {
                      const on = selected.includes(p.key);
                      return (
                        <button
                          key={p.key}
                          data-state={on ? 'selected' : undefined}
                          onClick={() => setSelected((s) => (on ? s.filter((k) => k !== p.key) : [...s, p.key]))}
                          className="tile press relative flex items-start gap-3 p-4 text-left"
                        >
                          <span className="text-3xl">{p.emoji}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-black">{p.title}</span>
                            <span className="block text-xs font-semibold text-muted">{p.tagline}</span>
                          </span>
                          {on && (
                            <span className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-brand text-white">
                              <Check className="size-4" strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="rounded-3xl border-2 border-dashed border-line p-4">
                    <Label>Add your own subject</Label>
                    <div className="flex gap-2">
                      <Input
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        placeholder="e.g. Kubernetes, React, Low-level design, Python for AI"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customTitle.trim()) {
                            setCustom((c) => [...c, { title: customTitle.trim(), subject: customTitle.trim() }]);
                            setCustomTitle('');
                          }
                        }}
                      />
                      <Button
                        variant="secondary"
                        icon={<Plus className="size-4" />}
                        disabled={!customTitle.trim()}
                        onClick={() => {
                          setCustom((c) => [...c, { title: customTitle.trim(), subject: customTitle.trim() }]);
                          setCustomTitle('');
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    {custom.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {custom.map((c, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand-ink">
                            📘 {c.title}
                            <button onClick={() => setCustom((list) => list.filter((_, j) => j !== i))} aria-label="Remove">
                              <X className="size-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </StepShell>
              )}
              {step === 3 && (
                <StepShell mood="thinking" bubble="Where are you starting from? You'll always begin at Level 1 — I'll pitch Level 1 at exactly this point.">
                  <div className="flex flex-col gap-3">
                    {chosenTracks.map((t) => {
                      const level = levels[t.key] ?? defaultLevel;
                      return (
                        <div key={t.key} className="flex items-center gap-4 rounded-3xl border-2 border-line bg-elev p-4">
                          <span className="text-3xl">{t.emoji}</span>
                          <div className="min-w-0 flex-1">
                            <div className="font-black">{t.title}</div>
                            <div className="text-xs font-bold text-muted">
                              {level === 1 ? 'Level 1 starts from the very basics' : `Level 1 starts at “${startLevelOption(level).label}” depth — no re-learning what you know`}
                            </div>
                          </div>
                          <Segmented
                            size="sm"
                            value={level}
                            onChange={(v) => setLevels((l) => ({ ...l, [t.key]: v }))}
                            options={START_LEVEL_OPTIONS.map((o) => ({ value: o.level, label: o.label, hint: o.hint }))}
                          />
                        </div>
                      );
                    })}
                    <p className="text-xs font-semibold text-faint">You can change this later from the track's ⋯ menu.</p>
                  </div>
                </StepShell>
              )}
              {step === 4 && (
                <StepShell mood="happy" bubble="Last thing: how much time can you give me each day? Small daily practice beats cramming.">
                  <div className="grid grid-cols-4 gap-3">
                    {DAILY_GOALS.map((g) => (
                      <button
                        key={g.xp}
                        data-state={goal === g.xp ? 'selected' : undefined}
                        onClick={() => setGoal(g.xp)}
                        className="tile press flex flex-col items-center gap-1 px-3 py-5"
                      >
                        <span className="text-2xl font-black">{g.xp}</span>
                        <span className="text-[11px] font-black tracking-wider text-faint uppercase">XP / day</span>
                        <span className="mt-1 text-sm font-extrabold">{g.label}</span>
                        <span className="text-xs font-semibold text-muted">{g.hint}</span>
                      </button>
                    ))}
                  </div>
                  <div>
                    <Label hint="change any time in Settings">Coaching model</Label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {modelList.slice(0, 8).map((m) => (
                        <button
                          key={m.value}
                          data-state={model === m.value ? 'selected' : undefined}
                          onClick={() => setModel(m.value)}
                          className="tile press px-4 py-3 text-left"
                        >
                          <div className="text-sm font-black">{m.displayName}</div>
                          <div className="line-clamp-2 text-xs font-semibold text-muted">{m.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </StepShell>
              )}
              {step === 5 && <BuildStep trackIds={createdIds} />}
            </motion.div>
          </AnimatePresence>
          {step < 5 && (
            <div className="flex items-center justify-between">
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
              <Button caps size="lg" disabled={!canNext} loading={submitting} onClick={next}>
                {step === 4 ? 'Build my roadmaps' : 'Continue'} <ArrowRight className="size-5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
