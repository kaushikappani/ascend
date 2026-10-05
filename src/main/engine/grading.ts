// Instant local grading for objective question types, plus human-readable answer text.
import type { AnswerResult, Question, UserAnswer, Verdict } from '@shared/types';
import { clamp, editDistance } from '../util';

export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^[`'"“”‘’]+|[`'"“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/;$/, '')
    .replace(/\(\)$/, '')
    .replace(/^@/, '')
    .trim();
}

function verdictFor(score: number, exact: boolean): Verdict {
  if (exact) return 'correct';
  return score >= 0.5 ? 'partial' : 'incorrect';
}

function result(score: number, exact: boolean, extra: Partial<AnswerResult> = {}): AnswerResult {
  const s = clamp(score, 0, 1);
  return { verdict: verdictFor(s, exact), correct: exact, score: exact ? 1 : s, ...extra };
}

function matchBlank(value: string, accepted: string[], allowTypo: boolean): { ok: boolean; typo: boolean } {
  const v = normalizeAnswer(value);
  if (!v) return { ok: false, typo: false };
  const options = accepted.map(normalizeAnswer).filter(Boolean);
  if (options.includes(v)) return { ok: true, typo: false };
  if (allowTypo && options.some((o) => o.length >= 5 && editDistance(o, v) === 1)) return { ok: true, typo: true };
  return { ok: false, typo: false };
}

export function gradeObjective(q: Question, answer: UserAnswer): AnswerResult {
  if (answer.type === 'skip') return { verdict: 'incorrect', correct: false, score: 0 };
  switch (q.type) {
    case 'mcq': {
      const ok = answer.type === 'mcq' && answer.index === q.correctIndex;
      return result(ok ? 1 : 0, ok);
    }
    case 'multi_select': {
      if (answer.type !== 'multi_select') return result(0, false);
      const correct = new Set(q.correctIndices ?? []);
      const chosen = new Set(answer.indices);
      const truePos = [...chosen].filter((i) => correct.has(i)).length;
      const falsePos = chosen.size - truePos;
      const exact = truePos === correct.size && falsePos === 0;
      const score = correct.size ? (truePos - falsePos) / correct.size : 0;
      return result(score, exact);
    }
    case 'true_false': {
      const ok = answer.type === 'true_false' && answer.value === q.answer;
      return result(ok ? 1 : 0, ok);
    }
    case 'fill_blank': {
      if (answer.type !== 'fill_blank') return result(0, false);
      const blanks = q.blanks ?? [];
      const typed = !q.wordBank?.length;
      let typo = false;
      const parts = blanks.map((accepted, i) => {
        const m = matchBlank(answer.values[i] ?? '', accepted, typed);
        if (m.typo) typo = true;
        return m.ok;
      });
      const hits = parts.filter(Boolean).length;
      const exact = blanks.length > 0 && hits === blanks.length;
      return result(blanks.length ? hits / blanks.length : 0, exact, { parts, typoAccepted: exact && typo });
    }
    case 'ordering': {
      if (answer.type !== 'ordering') return result(0, false);
      const items = q.items ?? [];
      const parts = items.map((item, i) => answer.sequence[i] === item);
      const hits = parts.filter(Boolean).length;
      return result(items.length ? hits / items.length : 0, hits === items.length && items.length > 0, { parts });
    }
    case 'match': {
      if (answer.type !== 'match') return result(0, false);
      const pairs = q.pairs?.length ?? 1;
      return result(1 - answer.mistakes / pairs, answer.mistakes === 0);
    }
    case 'short_answer':
      return result(0, false);
  }
}

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9@#+.\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

/** Offline fallback when the grading agent is unavailable: key-point overlap. */
export function heuristicShortAnswer(q: Question, text: string): AnswerResult {
  const words = new Set(tokenize(text));
  const points = q.keyPoints ?? [];
  const covered = points.filter((p) => {
    const toks = tokenize(p).filter((t) => t.length > 3);
    return toks.length > 0 && toks.filter((t) => words.has(t)).length / toks.length >= 0.5;
  });
  const score = points.length ? covered.length / points.length : text.trim().length > 60 ? 0.5 : 0;
  return {
    verdict: score >= 0.8 ? 'correct' : score >= 0.5 ? 'partial' : 'incorrect',
    correct: score >= 0.8,
    score,
    feedback: 'Claude was unavailable, so your answer was compared with the key points automatically.',
    missing: points.filter((p) => !covered.includes(p)),
    modelAnswer: q.sampleAnswer,
  };
}

export function answerText(q: Question, answer: UserAnswer): string {
  switch (answer.type) {
    case 'skip':
      return "(skipped — I don't know)";
    case 'mcq':
      return q.options?.[answer.index] ?? '';
    case 'multi_select':
      return answer.indices.map((i) => q.options?.[i] ?? '').join(' | ');
    case 'true_false':
      return answer.value ? 'True' : 'False';
    case 'fill_blank':
      return answer.values.join(' | ');
    case 'short_answer':
      return answer.text;
    case 'ordering':
      return answer.sequence.join(' → ');
    case 'match':
      return answer.mistakes === 0 ? 'All pairs matched' : `${answer.mistakes} wrong match${answer.mistakes === 1 ? '' : 'es'}`;
  }
}

export function correctAnswerText(q: Question): string {
  switch (q.type) {
    case 'mcq':
      return q.options?.[q.correctIndex ?? -1] ?? '';
    case 'multi_select':
      return (q.correctIndices ?? []).map((i) => q.options?.[i] ?? '').join(' | ');
    case 'true_false':
      return q.answer ? 'True' : 'False';
    case 'fill_blank':
      return (q.blanks ?? []).map((b) => b[0] ?? '').join(' | ');
    case 'short_answer':
      return q.sampleAnswer ?? (q.keyPoints ?? []).join('; ');
    case 'ordering':
      return (q.items ?? []).join(' → ');
    case 'match':
      return (q.pairs ?? []).map((p) => `${p.left} = ${p.right}`).join('; ');
  }
}
