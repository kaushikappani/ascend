// Tracks and their AI-designed roadmaps.
import type { NewTrackInput } from '@shared/api';
import { START_LEVEL_OPTIONS } from '@shared/constants';
import { nextTopic } from '@shared/progress';
import type { Level, Track } from '@shared/types';
import { activeTarget, daysUntil, learnerProfileText, targetSummaryText, tracksOverviewText } from '../agent/context';
import { roadmapPrompt, SYSTEM, targetRoadmapPrompt } from '../agent/prompts';
import { mainModel, runAgent } from '../agent/runtime';
import { roadmapSchema, type RoadmapOutput } from '../agent/schemas';
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
    startLevel: kind === 'target' ? 99 : clamp(Math.round(input.startLevel || 1), 1, 10),
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

function normalizeLevels(out: RoadmapOutput, max: number): Level[] {
  return (out.levels ?? [])
    .slice(0, max)
    .map((l, i) => ({
      number: i + 1,
      title: truncate(asString(l.title) || `Level ${i + 1}`, 60),
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
      const startLabel = START_LEVEL_OPTIONS.find((o) => o.level === track.startLevel)?.label ?? 'self-placed';
      const t = activeTarget(d);
      prompt = roadmapPrompt({
        track,
        learner: learnerProfileText(d),
        research: d.settings.research,
        startLabel,
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
    if (levels.length < Math.min(min, 3)) throw new Error('The roadmap came back incomplete. Please retry.');
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
  });
  void generateRoadmap(trackId).catch(() => undefined);
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
