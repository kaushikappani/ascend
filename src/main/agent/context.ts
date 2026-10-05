// Builds compact, prompt-ready descriptions of the learner from stored progress.
import { MASTERED } from '@shared/constants';
import { daysBetween, dayKey, findTopic, trackStats } from '@shared/progress';
import type { AppData, Attempt, Target, Track } from '@shared/types';
import { truncate } from '../util';

export function learnerProfileText(d: AppData): string {
  const p = d.profile;
  return [
    `Name: ${p.name || 'the learner'}`,
    `Current role: ${p.currentRole || 'not specified'} (${p.experienceYears} years of experience)`,
    `Target role: ${p.targetRole || 'not specified'}`,
    p.goals ? `Goals: ${p.goals}` : '',
    p.timeline ? `Interview timeline: ${p.timeline}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function tracksOverviewText(d: AppData): string {
  const lines = d.tracks
    .filter((t) => t.status === 'ready')
    .map((t) => {
      const s = trackStats(t, d.topicProgress, d.trackProgress);
      return `- ${t.title}${t.kind === 'target' ? ' (company prep)' : ''}: level ${s.currentLevel}/${t.levels.length}, ${s.completedTopics}/${s.totalTopics} topics done, average mastery ${s.avgMastery}/100`;
    });
  return lines.length ? lines.join('\n') : '- No tracks yet';
}

export interface ConceptEntry {
  concept: string;
  strength: number;
  attempts: number;
  topicId: string;
  topicTitle: string;
  trackId: string;
  trackTitle: string;
}

export function conceptEntries(d: AppData, opts: { trackId?: string; topicIds?: string[] } = {}): ConceptEntry[] {
  const entries: ConceptEntry[] = [];
  for (const tp of Object.values(d.topicProgress)) {
    if (opts.trackId && tp.trackId !== opts.trackId) continue;
    if (opts.topicIds && !opts.topicIds.includes(tp.topicId)) continue;
    const track = d.tracks.find((t) => t.id === tp.trackId);
    if (!track) continue;
    const topicTitle = findTopic(track, tp.topicId)?.topic.title ?? 'Unknown topic';
    for (const [concept, stat] of Object.entries(tp.concepts)) {
      entries.push({
        concept,
        strength: Math.round(stat.strength),
        attempts: stat.attempts,
        topicId: tp.topicId,
        topicTitle,
        trackId: track.id,
        trackTitle: track.title,
      });
    }
  }
  return entries;
}

export function weakConcepts(d: AppData, opts: { trackId?: string; topicIds?: string[] } = {}, limit = 8): ConceptEntry[] {
  return conceptEntries(d, opts)
    .filter((c) => c.strength < 60)
    .sort((a, b) => a.strength - b.strength || b.attempts - a.attempts)
    .slice(0, limit);
}

export function strongConcepts(d: AppData, opts: { trackId?: string; topicIds?: string[] } = {}, limit = 6): ConceptEntry[] {
  return conceptEntries(d, opts)
    .filter((c) => c.strength >= 80 && c.attempts >= 2)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);
}

export function conceptListText(entries: ConceptEntry[], withTopic = true): string {
  if (!entries.length) return 'none recorded yet';
  return entries.map((c) => `${c.concept} (${c.strength}/100${withTopic ? `, ${c.topicTitle}` : ''})`).join('; ');
}

export function topicLearnerText(d: AppData, topicId: string, title?: string): string {
  const tp = d.topicProgress[topicId];
  const label = title ? `“${title}”` : 'this topic';
  if (!tp || tp.attempts === 0) return `First time studying ${label}.`;
  const weak = Object.entries(tp.concepts)
    .filter(([, s]) => s.strength < 60)
    .map(([c]) => c);
  const strong = Object.entries(tp.concepts)
    .filter(([, s]) => s.strength >= 80)
    .map(([c]) => c);
  return [
    `Mastery of ${label}: ${Math.round(tp.mastery)}/100 after ${tp.attempts} answers (${Math.round((tp.correct / tp.attempts) * 100)}% correct), ${tp.lessonsCompleted} lessons.`,
    weak.length ? `Weak here: ${weak.join(', ')}.` : '',
    strong.length ? `Solid here: ${strong.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function recentMistakes(d: AppData, filter: { topicIds?: string[]; trackId?: string }, limit = 6): Attempt[] {
  const out: Attempt[] = [];
  for (let i = d.attempts.length - 1; i >= 0 && out.length < limit; i--) {
    const a = d.attempts[i];
    if (a.correct || a.resolved) continue;
    if (filter.trackId && a.trackId !== filter.trackId) continue;
    if (filter.topicIds && (!a.topicId || !filter.topicIds.includes(a.topicId))) continue;
    out.push(a);
  }
  return out;
}

export function mistakesText(attempts: Attempt[]): string {
  if (!attempts.length) return 'none';
  return attempts
    .map(
      (a) =>
        `- [${a.concepts.join(', ')}] Q: ${truncate(a.prompt, 140)} | learner answered: ${truncate(a.userAnswerText || '(no answer)', 100)} | correct: ${truncate(a.correctAnswerText, 100)}`,
    )
    .join('\n');
}

export function askedBefore(d: AppData, topicIds: string[], limit = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = d.attempts.length - 1; i >= 0 && out.length < limit; i--) {
    const a = d.attempts[i];
    if (!a.topicId || !topicIds.includes(a.topicId)) continue;
    const stem = truncate(a.prompt, 90);
    if (seen.has(stem)) continue;
    seen.add(stem);
    out.push(stem);
  }
  return out;
}

export function notesText(d: AppData, opts: { trackId?: string; limit?: number } = {}): string {
  const notes = [...d.notes]
    .filter((n) => !opts.trackId || !n.trackId || n.trackId === opts.trackId)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, opts.limit ?? 10);
  if (!notes.length) return 'none yet';
  return notes.map((n) => `- (${n.kind}) ${n.text}`).join('\n');
}

export function daysUntil(target: Target): number | undefined {
  return target.interviewDate ? daysBetween(dayKey(), target.interviewDate) : undefined;
}

export function targetSummaryText(target: Target | undefined): string {
  if (!target) return '';
  const days = daysUntil(target);
  const when = days === undefined ? '' : days >= 0 ? ` — interview in ${days} day${days === 1 ? '' : 's'}` : ' — interview date has passed';
  const b = target.brief;
  const parts = [`${target.role} at ${target.company}${when}`];
  if (b) {
    if (b.mustHave.length) parts.push(`Must-have skills: ${b.mustHave.slice(0, 8).join(', ')}`);
    const gaps = b.skillGaps.filter((g) => g.importance === 'critical' || g.importance === 'high').slice(0, 5);
    if (gaps.length) parts.push(`Key gaps: ${gaps.map((g) => g.skill).join(', ')}`);
    if (b.values.length) parts.push(`Company values: ${b.values.slice(0, 6).map((v) => v.name).join(', ')}`);
  }
  return parts.join('\n');
}

export function activeTarget(d: AppData): Target | undefined {
  return d.targets.find((t) => t.id === d.profile.activeTargetId && t.status === 'ready');
}

export function levelLabel(track: Track, levelNumber?: number): string {
  if (!levelNumber) return '';
  const level = track.levels.find((l) => l.number === levelNumber);
  const noun = track.kind === 'target' ? 'Stage' : 'Level';
  return `${noun} ${levelNumber} of ${track.levels.length}${level ? `: ${level.title}` : ''}`;
}

/** Full JSON view of the learner for the coach's get_learner_profile tool. */
export function profileDump(d: AppData): unknown {
  return {
    profile: d.profile,
    today: dayKey(),
    stats: {
      xp: d.stats.xp,
      streak: d.stats.streak,
      lessonsCompleted: d.stats.lessonsCompleted,
      questionsAnswered: d.stats.questionsAnswered,
      accuracy: d.stats.questionsAnswered ? Math.round((d.stats.correctAnswers / d.stats.questionsAnswered) * 100) : null,
      mockInterviews: d.stats.interviewsCompleted,
    },
    tracks: d.tracks
      .filter((t) => t.status === 'ready')
      .map((t) => {
        const s = trackStats(t, d.topicProgress, d.trackProgress);
        return {
          id: t.id,
          title: t.title,
          kind: t.kind,
          currentLevel: s.currentLevel,
          levels: t.levels.map((l) => ({
            number: l.number,
            title: l.title,
            topics: l.topics.map((tp) => {
              const p = d.topicProgress[tp.id];
              return {
                id: tp.id,
                title: tp.title,
                mastery: p ? Math.round(p.mastery) : null,
                completed: !!p?.completed,
                mastered: (p?.mastery ?? 0) >= MASTERED,
              };
            }),
          })),
        };
      }),
    weakConcepts: weakConcepts(d, {}, 12).map((c) => ({ concept: c.concept, strength: c.strength, topic: c.topicTitle, track: c.trackTitle })),
    strongConcepts: strongConcepts(d, {}, 10).map((c) => ({ concept: c.concept, strength: c.strength, topic: c.topicTitle })),
    coachNotes: d.notes.slice(-20).map((n) => ({ kind: n.kind, text: n.text, at: n.createdAt })),
    targets: d.targets.map((t) => ({
      company: t.company,
      role: t.role,
      interviewDate: t.interviewDate,
      status: t.status,
      mustHave: t.brief?.mustHave,
      gaps: t.brief?.skillGaps.map((g) => `${g.skill} (${g.importance})`),
    })),
    recentMockInterviews: d.interviews
      .filter((i) => i.scorecard)
      .slice(-5)
      .map((i) => ({ title: i.title, overall: i.scorecard?.overall, improvements: i.scorecard?.improvements })),
  };
}
