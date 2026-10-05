import type { Question, UserAnswer } from '@shared/types';

export function describeAnswer(q: Question, a?: UserAnswer): string {
  if (!a) return '(not answered)';
  switch (a.type) {
    case 'skip':
      return "I don't know";
    case 'mcq':
      return q.options?.[a.index] ?? '';
    case 'multi_select':
      return a.indices.map((i) => q.options?.[i]).join(' · ');
    case 'true_false':
      return a.value ? 'True' : 'False';
    case 'fill_blank':
      return a.values.join(' · ');
    case 'short_answer':
      return a.text;
    case 'ordering':
      return a.sequence.join(' → ');
    case 'match':
      return a.mistakes ? `${a.mistakes} wrong match${a.mistakes === 1 ? '' : 'es'}` : 'All pairs matched first time';
  }
}

export function describeCorrect(q: Question): string {
  switch (q.type) {
    case 'mcq':
      return q.options?.[q.correctIndex ?? -1] ?? '';
    case 'multi_select':
      return (q.correctIndices ?? []).map((i) => q.options?.[i]).join(' · ');
    case 'true_false':
      return q.answer ? 'True' : 'False';
    case 'fill_blank':
      return (q.blanks ?? []).map((b) => b[0]).join(' · ');
    case 'short_answer':
      return q.sampleAnswer ?? (q.keyPoints ?? []).join('; ');
    case 'ordering':
      return (q.items ?? []).join(' → ');
    case 'match':
      return (q.pairs ?? []).map((p) => `${p.left} = ${p.right}`).join('; ');
  }
}
