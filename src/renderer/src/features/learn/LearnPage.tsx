import { AlertTriangle, EllipsisVertical, Play, Plus, RefreshCw, Signal, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { startLevelOption } from '@shared/constants';
import { nextTopic, trackStats } from '@shared/progress';
import type { AppSnapshot, Track } from '@shared/types';
import { ActivityFeed, useJobs } from '../../components/AgentActivity';
import { Mascot, SpeechBubble } from '../../components/Mascot';
import { ConfirmModal, Modal } from '../../components/Modal';
import { PageFrame } from '../../components/Page';
import { useClickAway } from '../../components/Shell';
import { Badge, Button, EmptyState, ProgressBar } from '../../components/ui';
import { api } from '../../lib/api';
import { activeTrack } from '../../lib/derive';
import { cn, greeting } from '../../lib/format';
import { attempt, startLesson, useApp } from '../../lib/store';
import { AddTrackModal } from './AddTrackModal';
import { PathView } from './PathView';
import { RightRail } from './RightRail';

function TrackSwitcher({ snapshot, current, onAdd }: { snapshot: AppSnapshot; current?: Track; onAdd: () => void }) {
  const tracks = snapshot.tracks.filter((t) => t.kind !== 'target');
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tracks.map((t) => {
        const s = trackStats(t, snapshot.topicProgress, snapshot.trackProgress);
        const active = current?.id === t.id;
        return (
          <button
            key={t.id}
            onClick={() => void api.tracks.setActive(t.id)}
            className={cn(
              'no-drag flex items-center gap-2 rounded-2xl border-2 px-3.5 py-2 text-[13.5px] font-extrabold transition-colors',
              active ? 'bg-elev shadow-card' : 'border-transparent text-muted hover:bg-hover hover:text-ink',
            )}
            style={active ? { borderColor: t.color } : undefined}
          >
            <span className="text-lg">{t.emoji}</span>
            <span>{t.title}</span>
            {t.status === 'ready' && <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-black text-muted">L{s.currentLevel}</span>}
            {t.status === 'generating' && <span className="size-2 animate-pulse rounded-full bg-brand" />}
          </button>
        );
      })}
      <button onClick={onAdd} className="no-drag flex items-center gap-1.5 rounded-2xl border-2 border-dashed border-line px-3.5 py-2 text-[13.5px] font-extrabold text-muted hover:bg-hover hover:text-ink">
        <Plus className="size-4" /> Add track
      </button>
    </div>
  );
}

function StartLevelModal({ track, open, onClose }: { track: Track; open: boolean; onClose: () => void }) {
  const [level, setLevel] = useState(track.startLevel);
  useEffect(() => {
    if (open) setLevel(track.startLevel);
  }, [open, track.startLevel]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Where do you want to start?"
      subtitle={`${track.title}: levels up to the one you pick are open; later levels unlock as you finish each one (or pass its checkpoint). Your progress is kept.${
        (track.baseLevel ?? 1) > 1 ? ` Level 1 is already pitched at your level (${startLevelOption(track.baseLevel ?? 1).label}), so most people start there.` : ''
      }`}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={level === track.startLevel}
            onClick={() => {
              void attempt("Couldn't change the starting level", () => api.tracks.setStartLevel(track.id, level));
              onClose();
            }}
          >
            Start at level {level}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        {track.levels.map((l) => (
          <button
            key={l.number}
            onClick={() => setLevel(l.number)}
            data-state={level === l.number ? 'selected' : undefined}
            className="tile press flex items-center gap-3 px-4 py-2.5 text-left"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sunken text-sm font-black">{l.number}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold">{l.title}</span>
              <span className="block truncate text-xs font-semibold text-muted">{l.summary}</span>
            </span>
            {l.number === 1 && <Badge tone="ok">Beginner</Badge>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function TrackMenu({ track }: { track: Track }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<'regen' | 'remove' | 'level' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(ref, () => setOpen(false), open);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="rounded-xl p-2 text-white/80 hover:bg-white/15 hover:text-white" aria-label="Track options">
        <EllipsisVertical className="size-5" />
      </button>
      {open && (
        <div className="absolute top-10 right-0 z-30 w-64 rounded-2xl border-2 border-line bg-elev p-1.5 text-ink shadow-float">
          {track.status === 'ready' && (
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-hover" onClick={() => { setOpen(false); setConfirm('level'); }}>
              <Signal className="size-4" /> Change starting level
              <span className="ml-auto text-xs font-black text-faint">L{track.startLevel}</span>
            </button>
          )}
          <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-hover" onClick={() => { setOpen(false); setConfirm('regen'); }}>
            <RefreshCw className="size-4" /> Redesign roadmap
          </button>
          <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-bad hover:bg-bad-soft" onClick={() => { setOpen(false); setConfirm('remove'); }}>
            <Trash2 className="size-4" /> Remove track
          </button>
        </div>
      )}
      <ConfirmModal
        open={confirm === 'regen'}
        title="Redesign this roadmap?"
        body="Claude will design a fresh 10-level roadmap, starting at your level and using everything it knows about you now. Progress on this track's current topics will be reset."
        confirmLabel="Redesign"
        onConfirm={() => void attempt("Couldn't redesign", () => api.tracks.regenerate(track.id))}
        onClose={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'remove'}
        title={`Remove ${track.title}?`}
        body="This deletes the roadmap and its progress. Your XP and achievements stay."
        confirmLabel="Remove"
        danger
        onConfirm={() => void attempt("Couldn't remove", () => api.tracks.remove(track.id))}
        onClose={() => setConfirm(null)}
      />
      <StartLevelModal track={track} open={confirm === 'level'} onClose={() => setConfirm(null)} />
    </div>
  );
}

function TrackHeader({ track, snapshot }: { track: Track; snapshot: AppSnapshot }) {
  const s = trackStats(track, snapshot.topicProgress, snapshot.trackProgress);
  const next = nextTopic(track, snapshot.topicProgress, snapshot.trackProgress);
  return (
    <div className="relative z-10 rounded-[28px] p-6 text-white" style={{ background: `linear-gradient(135deg, ${track.color}, color-mix(in srgb, ${track.color} 65%, #1d1e33))` }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-white/10" />
        <div className="absolute right-40 -bottom-20 size-40 rounded-full bg-white/[0.07]" />
      </div>
      <div className="relative flex items-start gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-3xl bg-white/20 text-4xl">{track.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl leading-tight font-black">{track.title}</h2>
            {(track.baseLevel ?? 1) > 1 && (
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11.5px] font-black tracking-wide" title="Level 1 of this roadmap is pitched at your starting point">
                Starts at your level · {startLevelOption(track.baseLevel ?? 1).label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm font-semibold opacity-90">{track.tagline}</p>
          {track.status === 'ready' && (
            <div className="mt-3 flex items-center gap-3">
              <ProgressBar value={s.percent / 100} color="#fff" track="rgba(255,255,255,0.25)" height={10} className="max-w-[260px]" />
              <span className="text-[13px] font-black">
                Level {s.currentLevel}/{track.levels.length} · {s.percent}% · mastery {s.avgMastery}
              </span>
            </div>
          )}
        </div>
        <TrackMenu track={track} />
      </div>
      {track.status === 'ready' && next && (
        <div className="relative mt-5 flex items-center justify-between gap-4 rounded-2xl bg-white/15 p-3 pl-4">
          <div className="min-w-0">
            <div className="text-[11px] font-black tracking-widest uppercase opacity-80">Up next · Level {next.level.number}</div>
            <div className="truncate text-[15px] font-extrabold">{next.topic.title}</div>
          </div>
          <button
            onClick={() => void startLesson({ trackId: track.id, kind: 'lesson', topicId: next.topic.id })}
            className="press flex shrink-0 items-center gap-2 rounded-2xl bg-white px-5 py-3 text-[14px] font-black tracking-wider uppercase shadow-[0_4px_0_rgba(0,0,0,0.22)]"
            style={{ color: track.color }}
          >
            <Play className="size-4" fill="currentColor" /> Continue
          </button>
        </div>
      )}
    </div>
  );
}

function Generating({ track }: { track: Track }) {
  const jobs = useJobs(track.id, ['roadmap']);
  return (
    <div className="flex flex-col items-center gap-6 rounded-[28px] border-2 border-line bg-elev px-8 py-12">
      <div className="flex items-center gap-5">
        <Mascot mood="thinking" size={104} />
        <SpeechBubble>
          Designing your {track.title} roadmap…
          <div className="mt-1 text-[13px] font-semibold text-muted">10 levels, from where you are today to expert interview depth.</div>
        </SpeechBubble>
      </div>
      <ActivityFeed jobs={jobs} className="w-full max-w-md" />
      <div className="grid w-full max-w-md gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shimmer h-12 rounded-2xl" style={{ opacity: 1 - i * 0.25 }} />
        ))}
      </div>
    </div>
  );
}

export function LearnPage() {
  const snapshot = useApp((s) => s.snapshot) as AppSnapshot;
  const [adding, setAdding] = useState(false);
  const track = useMemo(() => activeTrack(snapshot), [snapshot]);
  const coreTracks = snapshot.tracks.filter((t) => t.kind !== 'target');
  const shown = track && track.kind === 'target' ? coreTracks[0] ?? track : track;

  return (
    <PageFrame title={`${greeting(snapshot.profile.name)} 👋`}>
      <div className="flex gap-8">
        <div className="min-w-0 flex-1">
          <TrackSwitcher snapshot={snapshot} current={shown} onAdd={() => setAdding(true)} />
          <div className="mt-5">
            {!shown ? (
              <EmptyState title="No tracks yet" action={<Button onClick={() => setAdding(true)}>Add your first track</Button>}>
                Pick a subject and Claude will design your roadmap.
              </EmptyState>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div key={shown.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-8">
                  <TrackHeader track={shown} snapshot={snapshot} />
                  {shown.status === 'generating' && <Generating track={shown} />}
                  {shown.status === 'error' && (
                    <div className="flex items-center gap-4 rounded-3xl border-2 border-bad/40 bg-bad-soft p-5">
                      <AlertTriangle className="size-6 shrink-0 text-bad" />
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-bad-ink">Couldn't design this roadmap</div>
                        <div className="text-sm font-semibold text-bad-ink/80">{shown.error}</div>
                      </div>
                      <Button variant="danger" icon={<RefreshCw className="size-4" />} onClick={() => void attempt('Retry failed', () => api.tracks.regenerate(shown.id))}>
                        Retry
                      </Button>
                    </div>
                  )}
                  {shown.status === 'ready' && (
                    <div className="mx-auto w-full max-w-[640px]">
                      <PathView track={shown} snapshot={snapshot} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
        <div className="w-[330px] shrink-0">
          <div className="sticky top-0">
            <RightRail snapshot={snapshot} track={shown} />
          </div>
        </div>
      </div>
      <AddTrackModal open={adding} onClose={() => setAdding(false)} />
    </PageFrame>
  );
}
