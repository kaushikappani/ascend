// Learner model: Elo-style topic mastery, concept strength and SM-2-style spaced repetition.
import { PASS_SCORE } from '@shared/constants';
import { addDays } from '@shared/progress';
import type { AnswerResult, AppData, Question, SrsState, TopicProgress } from '@shared/types';
import { clamp } from '../util';

/** Mastery at which a question of each difficulty is answered correctly half the time. */
const DIFFICULTY_TARGET = [0, 15, 35, 55, 75, 90];

export function ensureTopicProgress(d: AppData, trackId: string, topicId: string): TopicProgress {
  return (d.topicProgress[topicId] ??= {
    topicId,
    trackId,
    mastery: 0,
    attempts: 0,
    correct: 0,
    lessonsCompleted: 0,
    bestScore: 0,
    completed: false,
    srs: { reps: 0, interval: 0, ease: 2.3 },
    concepts: {},
  });
}

export function expectedScore(mastery: number, difficulty: number): number {
  const target = DIFFICULTY_TARGET[clamp(Math.round(difficulty), 1, 5)];
  return 1 / (1 + Math.exp(-(mastery - target) / 12));
}

function conceptKey(tp: TopicProgress, concept: string): string {
  const clean = concept.trim();
  const lower = clean.toLowerCase();
  return Object.keys(tp.concepts).find((k) => k.toLowerCase() === lower) ?? clean;
}

/** Update mastery after one answer: big moves when evidence is thin or the result is surprising. */
export function applyAnswer(tp: TopicProgress, q: Question, result: AnswerResult, at: string): void {
  const confidence = Math.min(1, tp.attempts / 20);
  tp.attempts += 1;
  if (result.correct) tp.correct += 1;
  const k = 26 * (1 - 0.55 * confidence);
  tp.mastery = clamp(tp.mastery + k * (result.score - expectedScore(tp.mastery, q.difficulty)), 0, 100);
  for (const concept of q.concepts) {
    if (!concept.trim()) continue;
    const key = conceptKey(tp, concept);
    const stat = tp.concepts[key];
    if (!stat) {
      tp.concepts[key] = { attempts: 1, correct: result.correct ? 1 : 0, strength: result.score * 100, lastSeen: at };
    } else {
      stat.strength = stat.strength * 0.6 + result.score * 100 * 0.4;
      stat.attempts += 1;
      if (result.correct) stat.correct += 1;
      stat.lastSeen = at;
    }
  }
  tp.lastPracticedAt = at;
}

export function scheduleSrs(srs: SrsState, score: number, today: string): SrsState {
  if (score >= PASS_SCORE) {
    const reps = srs.reps + 1;
    const ease = clamp(srs.ease + (0.1 - (1 - score) * 0.8), 1.3, 2.8);
    const interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.max(4, Math.round(Math.max(srs.interval, 1) * ease));
    return { reps, ease, interval, due: addDays(today, interval) };
  }
  return { reps: 0, ease: clamp(srs.ease - 0.2, 1.3, 2.8), interval: 1, due: addDays(today, 1) };
}

export function applyLessonOutcome(tp: TopicProgress, score: number, today: string, countsAsLesson: boolean): void {
  if (countsAsLesson) {
    tp.lessonsCompleted += 1;
    tp.bestScore = Math.max(tp.bestScore, score);
    if (score >= PASS_SCORE) tp.completed = true;
  }
  tp.srs = scheduleSrs(tp.srs, score, today);
}
