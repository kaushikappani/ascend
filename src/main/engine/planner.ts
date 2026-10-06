// Decides the shape of each lesson: question types, difficulty curve and topic mix.
import type { LessonKind, QuestionType } from '@shared/types';
import type { PlannedQuestion } from '../agent/prompts';
import { clamp } from '../util';

const PATTERNS: Record<LessonKind, QuestionType[]> = {
  lesson: ['mcq', 'true_false', 'fill_blank', 'mcq', 'match', 'multi_select', 'short_answer', 'ordering', 'mcq', 'fill_blank', 'short_answer', 'true_false'],
  custom: ['mcq', 'fill_blank', 'true_false', 'mcq', 'ordering', 'multi_select', 'short_answer', 'match', 'mcq', 'short_answer', 'fill_blank', 'true_false'],
  weakspots: ['mcq', 'fill_blank', 'true_false', 'short_answer', 'mcq', 'multi_select', 'match', 'short_answer', 'mcq', 'ordering', 'fill_blank', 'mcq'],
  mistakes: ['mcq', 'true_false', 'fill_blank', 'short_answer', 'mcq', 'multi_select', 'ordering', 'mcq', 'short_answer', 'match', 'true_false', 'mcq'],
  review: ['mcq', 'fill_blank', 'true_false', 'multi_select', 'mcq', 'short_answer', 'ordering', 'mcq', 'true_false', 'match', 'fill_blank', 'mcq'],
  checkpoint: ['mcq', 'true_false', 'fill_blank', 'mcq', 'multi_select', 'short_answer', 'mcq', 'ordering', 'true_false', 'mcq', 'short_answer', 'match'],
  rapid: ['mcq', 'true_false', 'mcq', 'mcq', 'true_false', 'mcq', 'true_false', 'mcq', 'mcq', 'true_false', 'mcq', 'true_false'],
};

/** Center difficulty (1-5) from how deep the level is (0-1, see levelDepth) and the learner's mastery. */
export function centerDifficulty(depth: number, mastery: number, attempts: number): number {
  let center = 1.3 + clamp(depth, 0, 1) * 3.2;
  if (attempts >= 4) {
    if (mastery >= 75) center += 0.7;
    else if (mastery < 35) center -= 0.7;
  }
  return clamp(center, 1, 5);
}

export function questionPlan(p: {
  kind: LessonKind;
  count: number;
  enabled: Record<QuestionType, boolean>;
  center: number;
  topicIds: string[];
  primaryTopicId?: string;
  reviewTopicIds?: string[];
}): PlannedQuestion[] {
  let pattern = PATTERNS[p.kind].filter((t) => p.enabled[t]);
  if (p.kind === 'rapid') pattern = pattern.filter((t) => t === 'mcq' || t === 'true_false');
  if (!pattern.length) pattern = ['mcq'];
  // Alternate match/ordering between lessons for variety.
  if (Math.random() < 0.5) pattern = pattern.map((t) => (t === 'match' ? 'ordering' : t === 'ordering' ? 'match' : t)).filter((t) => p.enabled[t]);
  const types: QuestionType[] = Array.from({ length: p.count }, (_, i) => pattern[i % pattern.length]);

  const topicFor = (i: number): string => {
    if (p.primaryTopicId) {
      const reviews = p.reviewTopicIds ?? [];
      // One interleaved review question in the middle of longer lessons.
      if (reviews.length && p.count >= 6 && i === Math.floor(p.count / 2)) return reviews[0];
      if (reviews.length > 1 && p.count >= 10 && i === p.count - 3) return reviews[1];
      return p.primaryTopicId;
    }
    return p.topicIds.length ? p.topicIds[i % p.topicIds.length] : '*';
  };

  return types.map((type, i) => {
    const ramp = p.count > 1 ? i / (p.count - 1) : 0.5;
    const difficulty = clamp(Math.round(p.center - 1 + ramp * 2), 1, 5);
    return { type, difficulty, topicId: topicFor(i) };
  });
}
