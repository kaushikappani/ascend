// Pure progress derivations shared by the main process and the renderer.
import { MASTERED } from './constants';
import type { DayKey, Level, Topic, TopicProgress, Track, TrackProgress } from './types';

type TopicMap = Record<string, TopicProgress>;
type TrackProgressMap = Record<string, TrackProgress>;

export function dayKey(date: Date = new Date()): DayKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDay(day: DayKey): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: DayKey, days: number): DayKey {
  const date = parseDay(day);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

export function isLevelComplete(track: Track, level: Level, topics: TopicMap, trackProgress: TrackProgressMap): boolean {
  if (trackProgress[track.id]?.checkpoints[level.number]?.passed) return true;
  // Topics the coach inserted later are optional, so they never re-lock a finished level.
  const core = level.topics.filter((t) => !t.addedByCoach);
  return core.length > 0 && core.every((t) => topics[t.id]?.completed);
}

export function isLevelUnlocked(track: Track, levelNumber: number, topics: TopicMap, trackProgress: TrackProgressMap): boolean {
  if (levelNumber <= Math.max(1, track.startLevel)) return true;
  const prev = track.levels.find((l) => l.number === levelNumber - 1);
  if (!prev) return false;
  return isLevelComplete(track, prev, topics, trackProgress) && isLevelUnlocked(track, prev.number, topics, trackProgress);
}

/** Highest unlocked level number. */
export function currentLevelNumber(track: Track, topics: TopicMap, trackProgress: TrackProgressMap): number {
  let current = 1;
  for (const level of track.levels) {
    if (isLevelUnlocked(track, level.number, topics, trackProgress)) current = level.number;
    else break;
  }
  return current;
}

/** The first not-yet-completed topic in an unlocked level (the "next up" node). */
export function nextTopic(
  track: Track,
  topics: TopicMap,
  trackProgress: TrackProgressMap,
): { level: Level; topic: Topic } | undefined {
  const unlocked = track.levels.filter((l) => isLevelUnlocked(track, l.number, topics, trackProgress));
  const ordered = [...unlocked].sort((a, b) => a.number - b.number);
  // Start from the learner's placement level (company prep paths unlock every stage
  // up front but are still worked through from stage 1)…
  let anchor = track.kind === 'target' ? 1 : track.startLevel;
  // …unless they have chosen to take lessons in an earlier level: then follow them there.
  for (const level of ordered) {
    if (level.number >= anchor) break;
    if (level.topics.some((t) => topics[t.id]?.lessonStarted || (topics[t.id]?.lessonsCompleted ?? 0) > 0)) {
      anchor = level.number;
      break;
    }
  }
  const fromStart = ordered.filter((l) => l.number >= Math.min(anchor, ordered.at(-1)?.number ?? 1));
  for (const level of [...fromStart, ...ordered]) {
    const topic = level.topics.find((t) => !topics[t.id]?.completed);
    if (topic) return { level, topic };
  }
  return undefined;
}

export interface TrackStats {
  totalTopics: number;
  completedTopics: number;
  masteredTopics: number;
  percent: number;
  avgMastery: number;
  currentLevel: number;
}

export function trackStats(track: Track, topics: TopicMap, trackProgress: TrackProgressMap): TrackStats {
  const all = track.levels.flatMap((l) => l.topics);
  const progress = all.map((t) => topics[t.id]);
  const completed = progress.filter((p) => p?.completed).length;
  const mastered = progress.filter((p) => (p?.mastery ?? 0) >= MASTERED).length;
  const practiced = progress.filter((p) => p && p.attempts > 0);
  const avgMastery = practiced.length ? practiced.reduce((s, p) => s + (p?.mastery ?? 0), 0) / practiced.length : 0;
  return {
    totalTopics: all.length,
    completedTopics: completed,
    masteredTopics: mastered,
    percent: all.length ? Math.round((completed / all.length) * 100) : 0,
    avgMastery: Math.round(avgMastery),
    currentLevel: currentLevelNumber(track, topics, trackProgress),
  };
}

export function findTopic(track: Track, topicId: string): { level: Level; topic: Topic } | undefined {
  for (const level of track.levels) {
    const topic = level.topics.find((t) => t.id === topicId);
    if (topic) return { level, topic };
  }
  return undefined;
}

export function masteryLabel(mastery: number, attempts: number): string {
  if (attempts === 0) return 'Not started';
  if (mastery >= MASTERED) return 'Mastered';
  if (mastery >= 70) return 'Strong';
  if (mastery >= 50) return 'Developing';
  if (mastery >= 30) return 'Shaky';
  return 'Needs work';
}
