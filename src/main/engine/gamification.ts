// XP, streaks, daily goals and achievements.
import { MASTERED } from '@shared/constants';
import { addDays, currentLevelNumber, dayKey } from '@shared/progress';
import type { AnswerResult, AppData, Question } from '@shared/types';
import { nowIso } from '../util';

export function xpForAnswer(q: Question, r: AnswerResult, hintUsed = false): number {
  if (r.verdict === 'incorrect') return 0;
  const base = 4 + 2 * q.difficulty;
  const xp = r.verdict === 'correct' ? base : Math.round(base / 2);
  return hintUsed ? Math.ceil(xp / 2) : xp;
}

function touchStreak(d: AppData, day: string): void {
  const s = d.stats.streak;
  if (s.lastDay === day) return;
  s.current = s.lastDay === addDays(day, -1) ? s.current + 1 : 1;
  s.lastDay = day;
  s.longest = Math.max(s.longest, s.current);
}

/** Adds XP for today; returns true when this award crossed the daily goal. */
export function awardXp(d: AppData, amount: number): boolean {
  if (amount <= 0) return false;
  const day = dayKey();
  const before = d.stats.xpByDay[day] ?? 0;
  d.stats.xp += amount;
  d.stats.xpByDay[day] = before + amount;
  touchStreak(d, day);
  const goal = d.settings.dailyGoalXp;
  return before < goal && before + amount >= goal;
}

export function addMinutes(d: AppData, ms: number): void {
  if (ms <= 0) return;
  const day = dayKey();
  d.stats.minutesByDay[day] = Math.round(((d.stats.minutesByDay[day] ?? 0) + ms / 60000) * 10) / 10;
}

/** A streak survives until the end of the day after the last active day. */
export function refreshStreak(d: AppData): void {
  const s = d.stats.streak;
  if (s.lastDay && s.lastDay < addDays(dayKey(), -1)) s.current = 0;
}

/** Grants any newly earned achievements and returns their ids. */
export function checkAchievements(d: AppData): string[] {
  const unlocked: string[] = [];
  const s = d.stats;
  const grant = (id: string, earned: boolean) => {
    if (earned && !s.achievements[id]) {
      s.achievements[id] = nowIso();
      unlocked.push(id);
    }
  };
  const levelTracks = d.tracks.filter((t) => t.kind !== 'target' && t.status === 'ready');
  const maxLevel = Math.max(0, ...levelTracks.map((t) => currentLevelNumber(t, d.topicProgress, d.trackProgress)));
  const practicedTracks = new Set(Object.values(d.topicProgress).filter((p) => p.attempts > 0).map((p) => p.trackId));

  grant('first_steps', s.lessonsCompleted >= 1);
  grant('flawless', s.perfectLessons >= 1);
  grant('streak_3', s.streak.longest >= 3);
  grant('streak_7', s.streak.longest >= 7);
  grant('streak_30', s.streak.longest >= 30);
  grant('xp_500', s.xp >= 500);
  grant('xp_2500', s.xp >= 2500);
  grant('xp_10000', s.xp >= 10000);
  grant('level_3', maxLevel >= 3);
  grant('level_6', maxLevel >= 6);
  grant('level_10', maxLevel >= 10);
  grant('beyond', maxLevel >= 11);
  grant('gatekeeper', Object.values(d.trackProgress).some((tp) => Object.values(tp.checkpoints).some((c) => c.passed)));
  grant('deep_diver', Object.values(d.topicProgress).some((p) => p.mastery >= MASTERED));
  grant('centurion', s.questionsAnswered >= 100);
  grant('mistake_hunter', Object.values(d.lessons).some((l) => l.kind === 'mistakes' && l.status === 'completed'));
  grant('hot_seat', s.interviewsCompleted >= 1);
  grant('offer_ready', d.interviews.some((i) => (i.scorecard?.overall ?? 0) >= 80));
  grant('scout', d.targets.some((t) => t.status === 'ready'));
  grant('polymath', practicedTracks.size >= 3);
  return unlocked;
}
