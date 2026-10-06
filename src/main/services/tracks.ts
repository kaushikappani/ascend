// Tracks and their AI-designed roadmaps.
import type { NewTrackInput } from '@shared/api';
import { CORE_LEVELS, EXTEND_LEVELS, MAX_LEVELS } from '@shared/constants';
import { canExtendTrack, nextTopic } from '@shared/progress';
import type { Level, Track } from '@shared/types';
import {
  activeTarget,
  conceptListText,
  daysUntil,
  learnerProfileText,
  strongConcepts,
  targetSummaryText,
  tracksOverviewText,
  weakConcepts,
} from '../agent/context';
import { extendRoadmapPrompt, roadmapPrompt, SYSTEM, targetRoadmapPrompt } from '../agent/prompts';
import { mainModel, runAgent } from '../agent/runtime';
import { extensionSchema, roadmapSchema, type RoadmapOutput } from '../agent/schemas';
import { toast } from '../events';
import { jobs } from '../jobs';
import { store } from '../store';
import { asString, asStringArray, clamp, errorMessage, nowIso, truncate, uid } from '../util';
import { prefetchNext } from './lessons';

export function createTrack(input: NewTrackInput): string {
  const now = nowIso();
  const kind = input.kind ?? 'core';
  const track: Track = {
    id: uid('trk_'),
    kind,
    title: truncate(input.title, 60) || 'New track',
    subject: input.subject.trim() || input.title,
    tagline: input.tagline ?? '',
    emoji: input.emoji || '📘',
    color: input.color || '#6D5DF6',
    levels: [],
    // Everyone starts at level 1; the roadmap itself is pitched at the learner's starting point.
    startLevel: kind === 'target' ? 99 : 1,
    baseLevel: kind === 'target' ? undefined : clamp(Math.round(input.proficiency || 1), 1, 10),
    status: 'generating',
    createdAt: now,
    updatedAt: now,
  };
  store.mutate((d) => {
    d.tracks.push(track);
    d.trackProgress[track.id] = { trackId: track.id, checkpoints: {} };
    const hasActive = d.tracks.some((t) => t.id === d.profile.activeTrackId);
    if (!hasActive && kind !== 'target') d.profile.activeTrackId = track.id;
  });
  if (kind !== 'target') void generateRoadmap(track.id).catch(() => undefined);
  return track.id;
}

function normalizeLevels(out: Pick<RoadmapOutput, 'levels'>, max: number, offset = 0): Level[] {
  return (out.levels ?? [])
    .slice(0, max)
    .map((l, i) => ({
      number: offset + i + 1,
      title: truncate(asString(l.title) || `Level ${offset + i + 1}`, 60),
      summary: asString(l.summary),
      topics: (l.topics ?? [])
        .slice(0, 7)
        .map((t) => ({
          id: uid('tpc_'),
          title: truncate(asString(t.title), 70),
          summary: asString(t.summary),
          concepts: asStringArray(t.concepts, 7),
          interviewFocus: asString(t.interviewFocus),
        }))
        .filter((t) => t.title),
    }))
    .filter((l) => l.topics.length > 0);
}

export async function generateRoadmap(trackId: string): Promise<void> {
  const d = store.data;
  const track = d.tracks.find((t) => t.id === trackId);
  if (!track || jobs.isRunning('roadmap', trackId)) return;
  const target = track.targetId ? d.targets.find((t) => t.id === track.targetId) : undefined;
  const isTarget = track.kind === 'target' && !!target;
  const model = mainModel();
  const job = jobs.start('roadmap', isTarget ? `Designing your ${target?.company} prep path` : `Designing your ${track.title} roadmap`, {
    refId: trackId,
    model,
  });
  store.mutate(() => {
    track.status = 'generating';
    track.error = undefined;
  });
  try {
    let prompt: string;
    let min = 10;
    let max = 10;
    if (isTarget && target) {
      const days = daysUntil(target);
      [min, max] = days === undefined ? [5, 7] : days <= 7 ? [3, 4] : days <= 21 ? [4, 6] : [6, 8];
      prompt = targetRoadmapPrompt({
        target,
        learner: learnerProfileText(d),
        tracks: `Tracks:\n${tracksOverviewText(d)}`,
        minStages: min,
        maxStages: max,
      });
    } else {
      const t = activeTarget(d);
      prompt = roadmapPrompt({
        track,
        learner: learnerProfileText(d),
        research: d.settings.research,
        targetText: t ? targetSummaryText(t) : undefined,
      });
    }
    const out = await runAgent<RoadmapOutput>({
      job,
      system: SYSTEM.roadmap,
      prompt,
      model,
      effort: 'high',
      schema: roadmapSchema(min, max),
      web: !isTarget && d.settings.research !== 'off',
      maxTurns: 14,
    });
    const levels = normalizeLevels(out.data as RoadmapOutput, max);
    // Core roadmaps always have their full 10 levels; company prep paths may be shorter.
    if (levels.length < (isTarget ? Math.min(min, 3) : CORE_LEVELS)) throw new Error('The roadmap came back incomplete. Please retry.');
    store.mutate(() => {
      track.levels = levels;
      track.tagline = track.tagline || truncate(asString(out.data?.tagline), 90);
      track.status = 'ready';
      track.updatedAt = nowIso();
      track.startLevel = isTarget ? levels.length : Math.min(track.startLevel, levels.length);
    });
    job.done();
    const topicCount = levels.reduce((s, l) => s + l.topics.length, 0);
    toast({
      kind: 'success',
      title: `${track.emoji} ${track.title} is ready`,
      body: `${levels.length} ${isTarget ? 'stages' : 'levels'} and ${topicCount} topics, tailored to you.`,
    });
    prefetchNext(trackId);
  } catch (error) {
    store.mutate(() => {
      track.status = 'error';
      track.error = errorMessage(error);
    });
    job.fail(error);
    if (!job.signal.aborted) toast({ kind: 'error', title: `Couldn't build ${track.title}`, body: errorMessage(error) });
    throw error;
  }
}

/** Start over with a freshly designed roadmap (progress on this track is reset). */
export function regenerateTrack(trackId: string): void {
  store.mutate((d) => {
    const track = d.tracks.find((t) => t.id === trackId);
    if (!track) return;
    for (const [id, p] of Object.entries(d.topicProgress)) if (p.trackId === trackId) delete d.topicProgress[id];
    for (const [id, l] of Object.entries(d.lessons)) if (l.trackId === trackId && l.status !== 'completed') delete d.lessons[id];
    d.trackProgress[trackId] = { trackId, checkpoints: {} };
    track.levels = [];
    if (track.kind !== 'target') {
      // Roadmaps from before calibration placed the learner by unlocking levels; the new one starts at their level instead.
      track.baseLevel ??= track.startLevel;
      track.startLevel = 1;
    }
  });
  void generateRoadmap(trackId).catch(() => undefined);
}

/** Learning doesn't stop at level 10: once the last level is done, design the next few around what the learner has mastered. */
export function extendRoadmap(trackId: string): void {
  const d = store.data;
  const track = d.tracks.find((t) => t.id === trackId);
  if (!track || track.kind === 'target' || track.status !== 'ready' || jobs.isRunning('roadmap', trackId)) return;
  if (!canExtendTrack(track, d.topicProgress, d.trackProgress)) {
    throw new Error(`Finish all ${Math.max(CORE_LEVELS, track.levels.length)} levels first — then your roadmap keeps growing.`);
  }
  const count = Math.min(EXTEND_LEVELS, MAX_LEVELS - track.levels.length);
  if (count <= 0) throw new Error(`This roadmap already has ${MAX_LEVELS} levels. Add a new track to go further.`);
  void designExtension(track, count).catch(() => undefined);
}

async function designExtension(track: Track, count: number): Promise<void> {
  const d = store.data;
  const trackId = track.id;
  const from = track.levels.length + 1;
  const to = from + count - 1;
  const model = mainModel();
  const job = jobs.start('roadmap', `Designing levels ${from}–${to} of ${track.title}`, { refId: trackId, model });
  try {
    const t = activeTarget(d);
    const out = await runAgent<Pick<RoadmapOutput, 'levels'>>({
      job,
      system: SYSTEM.roadmap,
      prompt: extendRoadmapPrompt({
        track,
        learner: learnerProfileText(d),
        strong: conceptListText(strongConcepts(d, { trackId }, 8)),
        weak: conceptListText(weakConcepts(d, { trackId }, 8)),
        from,
        count,
        research: d.settings.research,
        targetText: t ? targetSummaryText(t) : undefined,
      }),
      model,
      effort: 'high',
      schema: extensionSchema(count),
      web: d.settings.research !== 'off',
      maxTurns: 14,
    });
    const taken = new Set(track.levels.flatMap((l) => l.topics.map((tp) => tp.title.toLowerCase())));
    const levels = normalizeLevels(out.data as Pick<RoadmapOutput, 'levels'>, count, track.levels.length)
      .map((l) => ({ ...l, topics: l.topics.filter((tp) => !taken.has(tp.title.toLowerCase())) }))
      .filter((l) => l.topics.length > 0);
    if (!levels.length) throw new Error('The new levels came back empty. Please retry.');
    if (!store.data.tracks.includes(track)) {
      job.done();
      return;
    }
    store.mutate(() => {
      track.levels.push(...levels);
      track.updatedAt = nowIso();
    });
    job.done();
    const last = levels.at(-1)?.number ?? to;
    toast({
      kind: 'success',
      title: `${track.emoji} Your ${track.title} roadmap grew`,
      body: `Levels ${from}–${last} are ready: ${levels.map((l) => l.title).join(', ')}.`,
    });
    prefetchNext(trackId);
  } catch (error) {
    job.fail(error);
    if (!job.signal.aborted) toast({ kind: 'error', title: `Couldn't extend ${track.title}`, body: errorMessage(error) });
    throw error;
  }
}

export function removeTrack(trackId: string): void {
  jobs.cancelFor(trackId);
  store.mutate((d) => {
    d.tracks = d.tracks.filter((t) => t.id !== trackId);
    delete d.trackProgress[trackId];
    for (const [id, p] of Object.entries(d.topicProgress)) if (p.trackId === trackId) delete d.topicProgress[id];
    for (const [id, l] of Object.entries(d.lessons)) {
      if (l.trackId !== trackId) continue;
      jobs.cancelFor(id);
      delete d.lessons[id];
    }
    for (const t of d.targets) if (t.trackId === trackId) t.trackId = undefined;
    if (d.profile.activeTrackId === trackId) d.profile.activeTrackId = d.tracks.find((t) => t.kind !== 'target')?.id ?? d.tracks[0]?.id;
  });
}

/** Re-place the learner on a track: levels up to `level` are open, later ones unlock as usual. */
export function setStartLevel(trackId: string, level: number): void {
  store.mutate((d) => {
    const track = d.tracks.find((t) => t.id === trackId);
    if (!track || track.kind === 'target') return;
    track.startLevel = clamp(Math.round(level), 1, Math.max(1, track.levels.length));
    track.updatedAt = nowIso();
    // In-flight prefetches for the old placement make way for the new next topic; finished ones are kept for later.
    const next = nextTopic(track, d.topicProgress, d.trackProgress)?.topic.id;
    for (const [id, l] of Object.entries(d.lessons)) {
      if (l.trackId === trackId && l.prefetched && l.status === 'generating' && l.topicId !== next && !Object.keys(l.answers).length) {
        jobs.cancelFor(id);
        delete d.lessons[id];
      }
    }
  });
  prefetchNext(trackId);
}

export function setActiveTrack(trackId: string): void {
  store.mutate((d) => {
    if (d.tracks.some((t) => t.id === trackId)) d.profile.activeTrackId = trackId;
  });
  prefetchNext(trackId);
}
