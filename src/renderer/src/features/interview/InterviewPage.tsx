import { ArrowLeft, Briefcase, Brain, Code2, Layers, Mic, RotateCcw, Square, Timer, Trash2, Users, Volume2, VolumeX, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StartInterviewInput } from '@shared/api';
import type { AppSnapshot, InterviewDifficulty, InterviewPersona, InterviewSession, InterviewStyle } from '@shared/types';
import { ActivityFeed, useRunning } from '../../components/AgentActivity';
import { Markdown } from '../../components/Markdown';
import { Mascot, SpeechBubble } from '../../components/Mascot';
import { ConfirmModal } from '../../components/Modal';
import { PageFrame } from '../../components/Page';
import { Badge, Button, EmptyState, IconButton, Input, Label, Segmented, Select } from '../../components/ui';
import { api } from '../../lib/api';
import { cn, fmtDuration, relTime } from '../../lib/format';
import { attempt, useApp } from '../../lib/store';
import { Composer } from '../coach/ChatView';
import { ScorecardView } from './Scorecard';

const STYLES: { value: InterviewStyle; label: string; desc: string; icon: typeof Code2 }[] = [
  { value: 'technical', label: 'Technical', desc: 'Concepts, internals, code and debugging', icon: Code2 },
  { value: 'behavioral', label: 'Behavioral', desc: 'STAR stories, ownership, conflict, impact', icon: Users },
  { value: 'system_design', label: 'System design', desc: 'Requirements to architecture and trade-offs', icon: Layers },
  { value: 'rapid_fire', label: 'Rapid fire', desc: 'Quick conceptual questions, brisk pace', icon: Zap },
  { value: 'mixed', label: 'Mixed', desc: 'A realistic blend of all of the above', icon: Brain },
];

function stripMarkers(text: string): string {
  return text.replace(/\[\[(Q|FOLLOWUP|END)[^\]]*\]\]/g, '').replace(/\[\[[A-Z]*$/, '').trimStart();
}

function Lobby({ snapshot }: { snapshot: AppSnapshot }) {
  const navigate = useApp((s) => s.navigate);
  const tracks = snapshot.tracks.filter((t) => t.status === 'ready' && t.kind !== 'target');
  const targets = snapshot.targets.filter((t) => t.status === 'ready');
  const [subject, setSubject] = useState(() =>
    snapshot.profile.activeTargetId && targets.some((t) => t.id === snapshot.profile.activeTargetId)
      ? `target:${snapshot.profile.activeTargetId}`
      : `track:${snapshot.profile.activeTrackId ?? tracks[0]?.id ?? ''}`,
  );
  const [style, setStyle] = useState<InterviewStyle>('technical');
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('auto');
  const [persona, setPersona] = useState<InterviewPersona>('neutral');
  const [count, setCount] = useState(6);
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    const [kind, id] = subject.split(':');
    const input: StartInterviewInput = { style, difficulty, persona, questionCount: count, focus: focus.trim() || undefined };
    if (kind === 'target') input.targetId = id;
    else input.trackId = id;
    setBusy(true);
    const sid = await attempt("Couldn't start the interview", () => api.interviews.start(input));
    setBusy(false);
    if (sid) navigate({ name: 'interview', id: sid });
  };

  return (
    <div className="grid grid-cols-[1fr_380px] gap-8">
      <div className="flex flex-col gap-6 rounded-[28px] border-2 border-line bg-elev p-7">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={80} />
          <div>
            <h2 className="text-2xl font-black">Practise the real thing</h2>
            <p className="text-sm font-semibold text-muted">An AI interviewer asks one question at a time, digs in with follow-ups, then scores you like a hiring panel.</p>
          </div>
        </div>
        <div>
          <Label>Interview for</Label>
          <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {targets.length > 0 && (
              <optgroup label="Company targets">
                {targets.map((t) => (
                  <option key={t.id} value={`target:${t.id}`}>
                    🎯 {t.role} at {t.company}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Tracks">
              {tracks.map((t) => (
                <option key={t.id} value={`track:${t.id}`}>
                  {t.emoji} {t.title}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
        <div>
          <Label>Style</Label>
          <div className="grid grid-cols-5 gap-2.5">
            {STYLES.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.value} data-state={style === s.value ? 'selected' : undefined} onClick={() => setStyle(s.value)} className="tile press flex flex-col items-center gap-1.5 px-2 py-4 text-center">
                  <Icon className="size-6" />
                  <span className="text-[13px] font-black">{s.label}</span>
                  <span className="text-[11px] leading-tight font-semibold text-muted">{s.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <Label>Level</Label>
            <Segmented
              size="sm"
              value={difficulty}
              onChange={setDifficulty}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'junior', label: 'Junior' },
                { value: 'mid', label: 'Mid' },
                { value: 'senior', label: 'Senior' },
                { value: 'staff', label: 'Staff' },
              ]}
            />
          </div>
          <div>
            <Label>Interviewer</Label>
            <Segmented
              size="sm"
              value={persona}
              onChange={setPersona}
              options={[
                { value: 'friendly', label: '😊 Friendly' },
                { value: 'neutral', label: '🙂 Neutral' },
                { value: 'tough', label: '🧐 Tough' },
              ]}
            />
          </div>
          <div>
            <Label>Main questions</Label>
            <Segmented size="sm" value={count} onChange={setCount} options={[4, 6, 8, 10].map((n) => ({ value: n, label: String(n) }))} />
          </div>
          <div>
            <Label hint="optional">Focus</Label>
            <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Spring transactions, RAG evaluation" />
          </div>
        </div>
        <Button caps size="lg" icon={<Mic className="size-5" />} loading={busy} disabled={!subject.split(':')[1]} onClick={() => void start()}>
          Start interview
        </Button>
      </div>
      <div>
        <div className="mb-3 text-[13px] font-extrabold tracking-wider text-faint uppercase">Your interviews</div>
        {snapshot.interviews.length ? (
          <div className="flex flex-col gap-2.5">
            {snapshot.interviews.map((i) => (
              <button key={i.id} onClick={() => navigate({ name: 'interview', id: i.id })} className="tile press flex items-center gap-3 px-4 py-3 text-left">
                <div
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black',
                    i.scorecard ? (i.scorecard.overall >= 70 ? 'bg-ok-soft text-ok-ink' : 'bg-warn-soft text-warn-ink') : 'bg-sunken text-muted',
                  )}
                >
                  {i.scorecard ? i.scorecard.overall : <Mic className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold">{i.title}</div>
                  <div className="text-xs font-semibold text-faint">
                    {i.status === 'active' ? 'In progress' : i.status === 'scoring' ? 'Scoring…' : i.status === 'error' ? 'Needs attention' : `Completed ${relTime(i.endedAt)}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Briefcase className="size-8" />} title="No interviews yet">
            Your first mock interview takes about 15 minutes.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function useElapsed(since: string, running: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now - Date.parse(since);
}

function Room({ session }: { session: InterviewSession }) {
  const navigate = useApp((s) => s.navigate);
  const streams = useApp((s) => s.streams);
  const [speak, setSpeak] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const running = useRunning(session.id);
  const pending = session.messages.some((m) => m.pending);
  const active = session.status === 'active';
  const elapsed = useElapsed(session.startedAt, active);
  const spoken = useRef(new Set<string>());
  const last = session.messages.at(-1);
  const lastText = last ? (last.pending ? (streams[last.id] ?? '') : last.text) : '';

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Live transcript follows the conversation; a finished interview opens on its scorecard.
    if (session.status === 'completed') el.scrollTo({ top: 0 });
    else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [session.messages.length, lastText.length, session.status]);

  useEffect(() => {
    if (!speak || !last || last.role !== 'assistant' || last.pending || last.error || spoken.current.has(last.id)) return;
    spoken.current.add(last.id);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(last.text.replace(/[`*_#>]/g, '')));
  }, [speak, last]);

  useEffect(() => () => window.speechSynthesis.cancel(), []);

  const questionNo = Math.max(1, session.asked);
  const answered = session.messages.filter((m) => m.role === 'user').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-4 border-b-2 border-line bg-elev/60 px-8 py-3">
        <IconButton label="Back to interviews" onClick={() => navigate({ name: 'interview' })}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-black">{session.title}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-faint">
            <Badge tone="brand">{session.difficulty === 'auto' ? 'Auto level' : session.difficulty}</Badge>
            <Badge>{session.persona} interviewer</Badge>
            {session.focus && <Badge tone="info">Focus: {session.focus}</Badge>}
          </div>
        </div>
        {active && (
          <>
            <div className="text-right">
              <div className="text-sm font-black">
                Question {Math.min(questionNo, session.questionCount)} of {session.questionCount}
              </div>
              <div className="flex items-center justify-end gap-1 text-xs font-bold text-faint">
                <Timer className="size-3.5" /> {fmtDuration(elapsed)}
              </div>
            </div>
            <IconButton label={speak ? 'Stop reading questions aloud' : 'Read questions aloud'} onClick={() => setSpeak((v) => !v)}>
              {speak ? <Volume2 className="size-5 text-brand" /> : <VolumeX className="size-5" />}
            </IconButton>
            <Button variant="secondary" size="sm" icon={<Square className="size-3.5" fill="currentColor" />} disabled={answered === 0 && !pending} onClick={() => setConfirmEnd(true)}>
              End & get feedback
            </Button>
          </>
        )}
        {!active && (
          <IconButton label="Delete interview" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-[860px] flex-col gap-5">
          {session.status === 'completed' && session.scorecard ? (
            <>
              <ScorecardView session={session} />
              <details className="rounded-3xl border-2 border-line bg-elev p-5">
                <summary className="cursor-pointer text-sm font-extrabold text-muted">Show transcript</summary>
                <div className="mt-4 flex flex-col gap-3">
                  {session.messages.map((m) => (
                    <div key={m.id} className="text-sm">
                      <span className="font-black">{m.role === 'assistant' ? 'Interviewer' : 'You'}: </span>
                      <span className="selectable font-semibold whitespace-pre-wrap text-muted">{m.text}</span>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : (
            session.messages.map((m) => {
              const text = m.pending ? stripMarkers(streams[m.id] ?? '') : m.text;
              return m.role === 'assistant' ? (
                <div key={m.id} className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1e9be8] to-[#6c5ce7] text-lg">🧑‍💼</div>
                  <div className="min-w-0 max-w-[85%]">
                    {m.questionNumber && <div className="mb-1 text-[11px] font-black tracking-wider text-brand uppercase">Question {m.questionNumber}</div>}
                    {m.followUp && <div className="mb-1 text-[11px] font-black tracking-wider text-info uppercase">Follow-up</div>}
                    <div className={cn('rounded-3xl rounded-tl-lg border-2 bg-elev px-4 py-3', m.error ? 'border-bad/40' : 'border-line')}>
                      {m.pending && !text ? <span className="text-sm font-bold text-faint">…</span> : <Markdown text={text} streaming={m.pending} />}
                    </div>
                    {m.error && active && (
                      <button onClick={() => void attempt('Retry failed', () => api.interviews.retry(session.id))} className="mt-1.5 flex items-center gap-1 text-[13px] font-extrabold text-brand hover:underline">
                        <RotateCcw className="size-3.5" /> Retry
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex justify-end">
                  <div className="selectable max-w-[80%] rounded-3xl rounded-br-lg bg-brand px-4 py-3 text-[15px] font-semibold whitespace-pre-wrap text-white">{m.text}</div>
                </div>
              );
            })
          )}
          {session.status === 'scoring' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="flex items-center gap-4">
                <Mascot mood="thinking" size={96} />
                <SpeechBubble>The panel is reviewing your answers…</SpeechBubble>
              </div>
              <ActivityFeed jobs={running} />
            </div>
          )}
          {session.status === 'error' && (
            <div className="flex items-center gap-4 rounded-3xl border-2 border-bad/40 bg-bad-soft p-5">
              <div className="min-w-0 flex-1 text-sm font-semibold text-bad-ink">Scoring failed: {session.error}</div>
              <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => void attempt('Retry failed', () => api.interviews.finish(session.id))}>
                Retry scoring
              </Button>
            </div>
          )}
        </div>
      </div>

      {active && (
        <div className="border-t-2 border-line bg-bg px-8 py-4">
          <div className="mx-auto max-w-[860px]">
            <Composer
              disabled={pending}
              placeholder={pending ? 'The interviewer is speaking…' : 'Type your answer — Enter to send, Shift+Enter for a new line'}
              onSend={(text) => void attempt("Couldn't send your answer", () => api.interviews.send(session.id, text))}
              autoFocus
            />
          </div>
        </div>
      )}
      <ConfirmModal
        open={confirmEnd}
        title="End the interview?"
        body="You'll get a full scorecard based on the questions you've answered so far."
        confirmLabel="End & score"
        onConfirm={() => void attempt("Couldn't end the interview", () => api.interviews.finish(session.id))}
        onClose={() => setConfirmEnd(false)}
      />
      <ConfirmModal
        open={confirmDelete}
        title="Delete this interview?"
        body="The transcript and scorecard will be removed."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          void attempt("Couldn't delete", () => api.interviews.remove(session.id));
          navigate({ name: 'interview' });
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export function InterviewPage({ id }: { id?: string }) {
  const snapshot = useApp((s) => s.snapshot) as AppSnapshot;
  const session = useMemo(() => snapshot.interviews.find((i) => i.id === id), [snapshot.interviews, id]);
  if (session) {
    return (
      <PageFrame title="Mock interview" scroll={false}>
        <Room session={session} />
      </PageFrame>
    );
  }
  return (
    <PageFrame title="Mock interview">
      <Lobby snapshot={snapshot} />
    </PageFrame>
  );
}
