// Derived views over the snapshot used across pages.
import { daysBetween, dayKey, findTopic } from '@shared/progress';
import type { AppSnapshot, Target, Track } from '@shared/types';

export interface ConceptRow {
  concept: string;
  strength: number;
  attempts: number;
  topicId: string;
  topicTitle: string;
  trackId: string;
  trackTitle: string;
}

export function conceptRows(s: AppSnapshot, trackId?: string): ConceptRow[] {
  const rows: ConceptRow[] = [];
  for (const p of Object.values(s.topicProgress)) {
    if (trackId && p.trackId !== trackId) continue;
    const track = s.tracks.find((t) => t.id === p.trackId);
    if (!track) continue;
    const topicTitle = findTopic(track, p.topicId)?.topic.title ?? 'Topic';
    for (const [concept, stat] of Object.entries(p.concepts)) {
      rows.push({
        concept,
        strength: Math.round(stat.strength),
        attempts: stat.attempts,
        topicId: p.topicId,
        topicTitle,
        trackId: track.id,
        trackTitle: track.title,
      });
    }
  }
  return rows;
}

export function weakRows(s: AppSnapshot, trackId?: string, limit = 5): ConceptRow[] {
  return conceptRows(s, trackId)
    .filter((c) => c.strength < 60)
    .sort((a, b) => a.strength - b.strength || b.attempts - a.attempts)
    .slice(0, limit);
}

export function strongRows(s: AppSnapshot, trackId?: string, limit = 5): ConceptRow[] {
  return conceptRows(s, trackId)
    .filter((c) => c.strength >= 80 && c.attempts >= 2)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);
}

export function dueCount(s: AppSnapshot, trackId?: string): number {
  const today = dayKey();
  return Object.values(s.topicProgress).filter((p) => (!trackId || p.trackId === trackId) && p.completed && p.srs.due && p.srs.due <= today)
    .length;
}

export function daysLeft(target: Target): number | undefined {
  return target.interviewDate ? daysBetween(dayKey(), target.interviewDate) : undefined;
}

/** Readiness blends practice mastery on the target path with mock interview results. */
export function targetReadiness(s: AppSnapshot, target: Target): { score: number; estimated: boolean } {
  const track = s.tracks.find((t) => t.id === target.trackId);
  const topics = track ? track.levels.flatMap((l) => l.topics) : [];
  const practiced = topics.map((t) => s.topicProgress[t.id]).filter((p) => p && p.attempts > 0);
  const interviews = s.interviews.filter((i) => i.targetId === target.id && i.scorecard);
  if (!practiced.length && !interviews.length) return { score: target.brief?.readinessEstimate ?? 0, estimated: true };
  const coverage = topics.length ? topics.reduce((sum, t) => sum + (s.topicProgress[t.id]?.mastery ?? 0), 0) / topics.length : 0;
  const initial = target.brief?.readinessEstimate ?? coverage;
  const mastery = Math.max(coverage, initial * 0.6 + coverage * 0.4);
  if (!interviews.length) return { score: Math.round(mastery), estimated: false };
  const latest = interviews[0].scorecard?.overall ?? 0;
  return { score: Math.round(mastery * 0.6 + latest * 0.4), estimated: false };
}

export function activeTrack(s: AppSnapshot): Track | undefined {
  return s.tracks.find((t) => t.id === s.profile.activeTrackId) ?? s.tracks.find((t) => t.kind !== 'target') ?? s.tracks[0];
}

export function todayXp(s: AppSnapshot): number {
  return s.stats.xpByDay[dayKey()] ?? 0;
}
