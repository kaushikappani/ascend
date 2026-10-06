import { Check, Crown, Lock, MessageCircle, Mountain, Play, Plus, RotateCcw, Sparkles, Star, Trophy, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CHECKPOINT_PASS_SCORE, CORE_LEVELS, EXTEND_LEVELS, MASTERED, MAX_LEVELS } from '@shared/constants';
import { canExtendTrack, dayKey, isLevelComplete, isLevelUnlocked, masteryLabel, nextTopic } from '@shared/progress';
import type { AppSnapshot, Level, Topic, Track } from '@shared/types';
import { ActivityFeed, useJobs } from '../../components/AgentActivity';
import { Mascot } from '../../components/Mascot';
import { Badge, Button, ProgressBar } from '../../components/ui';
import { api } from '../../lib/api';
import { cn, fmtDate, relTime } from '../../lib/format';
import { attempt, startLesson, useApp } from '../../lib/store';

const OFFSETS = [0, 58, 88, 58, 0, -58, -88, -58];

function deep(color: string): string {
  return `color-mix(in srgb, ${color} 72%, #000)`;
}

type NodeState = 'locked' | 'available' | 'next' | 'completed' | 'mastered';

function TopicNode({
  topic,
  state,
  mastery,
  color,
  offset,
  onClick,
  selected,
}: {
  topic: Topic;
  state: NodeState;
  mastery: number;
  color: string;
  offset: number;
  onClick: () => void;
  selected: boolean;
}) {
  const fill =
    state === 'mastered' ? '#ffb020' : state === 'completed' || state === 'next' ? color : state === 'available' ? 'var(--bg-elev)' : 'var(--bg-sunken)';
  const shadow =
    state === 'mastered' ? '#c98506' : state === 'completed' || state === 'next' ? deep(color) : state === 'available' ? 'var(--border-strong)' : 'var(--border)';
  const Icon = state === 'locked' ? Lock : state === 'mastered' ? Crown : state === 'completed' ? Check : topic.addedByCoach ? Sparkles : Star;
  const iconColor = state === 'available' ? color : state === 'locked' ? 'var(--text-faint)' : '#fff';
  const size = 92;
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn('relative flex flex-col items-center', state === 'next' && 'mt-10')} style={{ transform: `translateX(${offset}px)` }}>
      {state === 'next' && (
        <motion.div
          initial={{ y: 0 }}
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          className="absolute -top-11 z-10 rounded-xl border-2 border-line bg-elev px-3 py-1.5 text-[13px] font-black tracking-wider uppercase shadow-pop"
          style={{ color }}
        >
          Start
          <span className="absolute -bottom-[7px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r-2 border-b-2 border-line bg-elev" />
        </motion.div>
      )}
      <div className="relative" style={{ width: size, height: size }}>
        {state === 'next' && <span className="animate-pulse-ring absolute inset-1 rounded-full" style={{ background: color, opacity: 0.35 }} />}
        {mastery > 0 && state !== 'locked' && (
          <svg width={size} height={size} className="absolute inset-0 -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth="5" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={mastery >= MASTERED ? '#ffb020' : color}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - mastery / 100)}
            />
          </svg>
        )}
        <button
          onClick={onClick}
          aria-label={topic.title}
          className={cn(
            'press absolute top-1/2 left-1/2 flex size-[70px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full',
            state === 'available' && 'border-[3px]',
            selected && 'ring-4 ring-brand/30',
          )}
          style={{ background: fill, boxShadow: `0 6px 0 ${shadow}`, borderColor: state === 'available' ? color : undefined, ['--press-shadow' as string]: shadow }}
        >
          <Icon className="size-8" color={iconColor} fill={state === 'mastered' || state === 'next' ? iconColor : 'none'} strokeWidth={2.6} />
        </button>
      </div>
      <div className={cn('mt-1 max-w-[170px] text-center text-[13px] leading-tight font-extrabold', state === 'locked' ? 'text-faint' : 'text-ink')}>
        {topic.title}
      </div>
      {topic.addedByCoach && state !== 'locked' && (
        <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-brand">
          <Sparkles className="size-3" /> Added by coach
        </div>
      )}
    </div>
  );
}

function TopicCard({ track, level, topic, snapshot, onClose, locked }: { track: Track; level: Level; topic: Topic; snapshot: AppSnapshot; onClose: () => void; locked: boolean }) {
  const navigate = useApp((s) => s.navigate);
  const p = snapshot.topicProgress[topic.id];
  const mastery = Math.round(p?.mastery ?? 0);
  const prefetched = snapshot.lessons.some((l) => l.prefetched && l.topicId === topic.id && l.status === 'ready');
  const partDone = snapshot.lessons.find((l) => l.kind === 'lesson' && l.topicId === topic.id && l.status === 'in_progress' && l.answeredCount > 0);
  const askCoach = async () => {
    const id = await attempt("Couldn't open the coach", () =>
      api.chat.create({
        title: topic.title,
        contextLabel: `${track.title} · ${topic.title}`,
        context: `Track: ${track.title}\nLevel ${level.number}: ${level.title}\nTopic: ${topic.title} — ${topic.summary}\nKey concepts: ${topic.concepts.join(', ')}\nLearner mastery: ${mastery}/100`,
      }),
    );
    if (id) navigate({ name: 'coach', id });
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      className="relative z-10 w-full max-w-[540px] rounded-3xl border-2 bg-elev p-5 shadow-pop"
      style={{ borderColor: track.color }}
    >
      <button onClick={onClose} className="absolute top-3 right-3 rounded-lg p-1.5 text-faint hover:bg-hover hover:text-ink" aria-label="Close">
        <X className="size-4" />
      </button>
      <div className="pr-8">
        <div className="text-xs font-extrabold tracking-wider uppercase" style={{ color: track.color }}>
          {track.kind === 'target' ? 'Stage' : 'Level'} {level.number} · {level.title}
        </div>
        <h3 className="mt-1 text-xl font-black">{topic.title}</h3>
        <p className="mt-1 text-sm font-semibold text-muted">{topic.summary}</p>
      </div>
      {topic.addedByCoach && topic.reason && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-brand-soft px-3 py-2 text-[13px] font-semibold text-brand-ink">
          <Sparkles className="mt-0.5 size-4 shrink-0" /> {topic.reason}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {topic.concepts.map((c) => {
          const stat = p && Object.entries(p.concepts).find(([k]) => k.toLowerCase() === c.toLowerCase())?.[1];
          const tone = !stat ? 'neutral' : stat.strength >= 80 ? 'ok' : stat.strength >= 60 ? 'info' : 'warn';
          return (
            <Badge key={c} tone={tone}>
              {c}
            </Badge>
          );
        })}
      </div>
      {topic.interviewFocus && <p className="mt-3 text-[13px] font-semibold text-muted">🎯 {topic.interviewFocus}</p>}
      <div className="mt-4 rounded-2xl bg-sunken p-3">
        <div className="mb-2 flex items-center justify-between text-[13px] font-extrabold">
          <span>Mastery · {masteryLabel(mastery, p?.attempts ?? 0)}</span>
          <span style={{ color: track.color }}>{mastery}%</span>
        </div>
        <ProgressBar value={mastery / 100} color={mastery >= MASTERED ? '#ffb020' : track.color} height={10} />
        {p && p.attempts > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted">
            <span>{p.lessonsCompleted} lessons</span>
            <span>{Math.round((p.correct / p.attempts) * 100)}% accuracy</span>
            {p.lastPracticedAt && <span>Practised {relTime(p.lastPracticedAt)}</span>}
            {p.srs.due && <span>Review {p.srs.due <= dayKey() ? 'due now' : fmtDate(p.srs.due)}</span>}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        {locked ? (
          <div className="flex items-center gap-2 text-sm font-bold text-muted">
            <Lock className="size-4" /> Finish the previous {track.kind === 'target' ? 'stage' : 'level'} or pass its checkpoint to unlock.
          </div>
        ) : (
          <>
            <Button
              caps
              size="lg"
              className="flex-1"
              icon={p?.completed && !partDone ? <RotateCcw className="size-5" /> : <Play className="size-5" fill="currentColor" />}
              style={{ background: track.color, boxShadow: `0 4px 0 ${deep(track.color)}`, ['--press-shadow' as string]: deep(track.color) }}
              onClick={() => void startLesson({ trackId: track.id, kind: 'lesson', topicId: topic.id })}
            >
              {partDone
                ? `Resume · ${Math.min(partDone.answeredCount, partDone.questionCount)}/${partDone.questionCount}`
                : p?.completed
                  ? 'Practise again'
                  : prefetched
                    ? 'Start · ready'
                    : 'Start lesson'}
            </Button>
            <Button variant="secondary" size="lg" icon={<MessageCircle className="size-5" />} onClick={() => void askCoach()}>
              Ask coach
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}

function LevelHeader({ track, level, unlocked, complete, jumpable, snapshot }: { track: Track; level: Level; unlocked: boolean; complete: boolean; jumpable: boolean; snapshot: AppSnapshot }) {
  const noun = track.kind === 'target' ? 'Stage' : 'Level';
  const core = level.topics.filter((t) => !t.addedByCoach);
  const done = core.filter((t) => snapshot.topicProgress[t.id]?.completed).length;
  const checkpoint = snapshot.trackProgress[track.id]?.checkpoints[level.number];
  return (
    <div
      className={cn('relative overflow-hidden rounded-3xl px-6 py-5 text-white', !unlocked && 'grayscale-[0.85]')}
      style={{ background: unlocked ? track.color : 'var(--border-strong)', boxShadow: `0 5px 0 ${unlocked ? deep(track.color) : 'var(--border)'}` }}
    >
      <div className="absolute -top-8 -right-6 size-32 rounded-full bg-white/10" />
      <div className="absolute right-20 -bottom-10 size-24 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-black tracking-[0.14em] uppercase opacity-85">
            {noun} {level.number}
            {!unlocked && ' · Locked'}
          </div>
          <div className="text-[21px] leading-tight font-black">{level.title}</div>
          <div className="mt-1 text-[13.5px] font-semibold opacity-90">{level.summary}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="rounded-full bg-white/20 px-3 py-1 text-[13px] font-black">
            {done}/{core.length}
          </div>
          {complete ? (
            <span className="flex items-center gap-1 text-[12px] font-black tracking-wide uppercase">
              <Check className="size-4" /> {checkpoint?.passed ? 'Checkpoint passed' : 'Complete'}
            </span>
          ) : unlocked ? (
            <button
              onClick={() => void startLesson({ trackId: track.id, kind: 'checkpoint', level: level.number })}
              className="press rounded-xl bg-white px-3 py-1.5 text-[12px] font-black tracking-wide uppercase shadow-[0_3px_0_rgba(0,0,0,0.2)]"
              style={{ color: track.color }}
              title={`Pass with ${Math.round(CHECKPOINT_PASS_SCORE * 100)}% to complete this ${noun.toLowerCase()} at once`}
            >
              <Trophy className="mr-1 inline size-3.5" /> Test out
            </button>
          ) : jumpable ? (
            <span className="text-[12px] font-bold opacity-90">Pass {noun.toLowerCase()} {level.number - 1}'s checkpoint to jump here</span>
          ) : (
            <Lock className="size-5 opacity-80" />
          )}
        </div>
      </div>
    </div>
  );
}

/** The top of the path: once the last level is done the roadmap keeps growing. */
function RoadmapEnd({ track, snapshot }: { track: Track; snapshot: AppSnapshot }) {
  const jobs = useJobs(track.id, ['roadmap']);
  const extending = jobs.some((j) => j.status === 'running');
  const failed = !extending && jobs.at(-1)?.status === 'error';
  const finished = canExtendTrack(track, snapshot.topicProgress, snapshot.trackProgress);
  const from = track.levels.length + 1;
  const to = Math.min(MAX_LEVELS, from + EXTEND_LEVELS - 1);
  const atCap = track.levels.length >= MAX_LEVELS;
  return (
    <div
      data-roadmap-end={extending ? 'extending' : finished ? 'ready' : 'locked'}
      className={cn('flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed px-6 py-7 text-center', finished ? 'border-transparent bg-elev shadow-pop' : 'border-line')}
      style={finished ? { borderColor: track.color } : undefined}
    >
      {extending ? (
        <>
          <Mascot mood="thinking" size={84} />
          <div>
            <div className="text-lg font-black">Designing levels {from}–{to}…</div>
            <div className="mt-0.5 text-sm font-semibold text-muted">Going past what you've covered, and back over your weak spots at a harder angle.</div>
          </div>
          <ActivityFeed jobs={jobs.filter((j) => j.status === 'running')} max={3} compact className="w-full max-w-sm text-left" />
        </>
      ) : finished ? (
        <>
          <Mascot mood="celebrate" size={90} />
          <div>
            <div className="text-xl font-black">You've reached the top of this roadmap 🏔️</div>
            <div className="mt-1 text-sm font-semibold text-muted">
              {atCap ? 'This track is as long as it gets — start a new track to keep going.' : "Learning has no ceiling. I'll design the next levels around what you've mastered."}
            </div>
            {failed && <div className="mt-2 text-sm font-bold text-bad-ink">{jobs.at(-1)?.error}</div>}
          </div>
          {!atCap && (
            <Button
              caps
              size="lg"
              icon={failed ? <RotateCcw className="size-5" /> : <Plus className="size-5" />}
              style={{ background: track.color, boxShadow: `0 4px 0 ${deep(track.color)}`, ['--press-shadow' as string]: deep(track.color) }}
              onClick={() => void attempt("Couldn't extend the roadmap", () => api.tracks.extend(track.id))}
            >
              {failed ? 'Try again' : `Add levels ${from}–${to}`}
            </Button>
          )}
        </>
      ) : (
        <>
          <Mountain className="size-9 text-faint" />
          <div>
            <div className="text-[15px] font-black text-muted">The path keeps going</div>
            <div className="mt-0.5 text-[13px] font-semibold text-faint">
              Finish level {track.levels.length} and Ace designs levels {from}–{to} for you — learning never runs out.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PathView({ track, snapshot }: { track: Track; snapshot: AppSnapshot }) {
  const [selected, setSelected] = useState<string | null>(null);
  const tp = snapshot.topicProgress;
  const trp = snapshot.trackProgress;
  const next = useMemo(() => nextTopic(track, tp, trp), [track, tp, trp]);
  const nextRef = useRef<HTMLDivElement | null>(null);
  const scrolledFor = useRef<string | null>(null);

  // Bring the learner's current node into view (once per track), like Duolingo's path.
  useEffect(() => {
    const el = nextRef.current;
    if (!el || scrolledFor.current === track.id) return;
    scrolledFor.current = track.id;
    if (el.getBoundingClientRect().top > window.innerHeight * 0.7) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    }
  }, [track.id, next?.topic.id]);

  let nodeIndex = 0;
  return (
    <div className="flex flex-col gap-10 pb-16">
      {track.levels.map((level) => {
        const unlocked = isLevelUnlocked(track, level.number, tp, trp);
        const complete = isLevelComplete(track, level, tp, trp);
        const jumpable = !unlocked && isLevelUnlocked(track, level.number - 1, tp, trp);
        const checkpoint = trp[track.id]?.checkpoints[level.number];
        return (
          <section key={level.number} className="flex flex-col gap-7">
            <LevelHeader track={track} level={level} unlocked={unlocked} complete={complete} jumpable={jumpable} snapshot={snapshot} />
            <div className="flex flex-col items-center gap-7 pt-7">
              {level.topics.map((topic) => {
                const p = tp[topic.id];
                const mastery = Math.round(p?.mastery ?? 0);
                const state: NodeState = !unlocked
                  ? 'locked'
                  : mastery >= MASTERED && p?.completed
                    ? 'mastered'
                    : p?.completed
                      ? 'completed'
                      : next?.topic.id === topic.id
                        ? 'next'
                        : 'available';
                const offset = OFFSETS[nodeIndex++ % OFFSETS.length];
                return (
                  <div key={topic.id} ref={state === 'next' ? nextRef : undefined} className="flex w-full flex-col items-center gap-4">
                    <TopicNode
                      topic={topic}
                      state={state}
                      mastery={mastery}
                      color={track.color}
                      offset={offset}
                      selected={selected === topic.id}
                      onClick={() => setSelected((s) => (s === topic.id ? null : topic.id))}
                    />
                    <AnimatePresence>
                      {selected === topic.id && (
                        <TopicCard track={track} level={level} topic={topic} snapshot={snapshot} locked={!unlocked} onClose={() => setSelected(null)} />
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              {unlocked && (
                <div className="flex flex-col items-center" style={{ transform: `translateX(${OFFSETS[nodeIndex++ % OFFSETS.length]}px)` }}>
                  <button
                    onClick={() => void startLesson({ trackId: track.id, kind: 'checkpoint', level: level.number })}
                    className="press flex size-[74px] items-center justify-center rounded-[22px]"
                    title="Level checkpoint"
                    style={{
                      background: checkpoint?.passed ? '#ffb020' : 'var(--bg-elev)',
                      border: checkpoint?.passed ? 'none' : `3px solid ${track.color}`,
                      boxShadow: `0 6px 0 ${checkpoint?.passed ? '#c98506' : 'var(--border-strong)'}`,
                      ['--press-shadow' as string]: checkpoint?.passed ? '#c98506' : 'var(--border-strong)',
                    }}
                  >
                    <Trophy className="size-8" color={checkpoint?.passed ? '#fff' : track.color} strokeWidth={2.5} />
                  </button>
                  <div className="mt-2 text-[12.5px] font-extrabold text-muted">
                    {checkpoint?.passed ? `Checkpoint · best ${Math.round(checkpoint.bestScore * 100)}%` : 'Checkpoint'}
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}
      {/* The first 10 levels are mandatory; the path only grows past them. */}
      {track.kind !== 'target' && track.levels.length >= CORE_LEVELS && <RoadmapEnd track={track} snapshot={snapshot} />}
    </div>
  );
}
