import { Check, SquareCheckBig, Square, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { InlineText } from '../../../components/Markdown';
import { cn } from '../../../lib/format';
import { sfx } from '../../../lib/sound';
import { OptionTile, useDigitKeys, type QuestionProps, type TileState } from './shared';

export function McqQuestion({ q, locked, onAnswer, initial, paused }: QuestionProps) {
  const [sel, setSel] = useState<number | null>(initial?.type === 'mcq' ? initial.index : null);
  const options = q.options ?? [];
  const pick = useCallback(
    (i: number) => {
      if (locked) return;
      setSel(i);
      sfx.tap();
      onAnswer({ type: 'mcq', index: i });
    },
    [locked, onAnswer],
  );
  useDigitKeys(options.length, pick, !locked && !paused);
  const stateOf = (i: number): TileState => {
    if (!locked) return sel === i ? 'selected' : undefined;
    if (i === q.correctIndex) return 'correct';
    return sel === i ? 'wrong' : 'dim';
  };
  return (
    <div className="flex flex-col gap-3">
      {options.map((opt, i) => (
        <div key={i}>
          <OptionTile index={i} state={stateOf(i)} onClick={() => pick(i)} disabled={locked}>
            <InlineText text={opt} />
          </OptionTile>
          {locked && q.optionFeedback?.[i] && (sel === i || i === q.correctIndex) && (
            <p className={cn('mt-1.5 px-2 text-[13px] font-semibold', i === q.correctIndex ? 'text-ok-ink' : 'text-bad-ink')}>{q.optionFeedback[i]}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function MultiSelectQuestion({ q, locked, onAnswer, initial, paused }: QuestionProps) {
  const [sel, setSel] = useState<number[]>(initial?.type === 'multi_select' ? initial.indices : []);
  const options = q.options ?? [];
  const correct = new Set(q.correctIndices ?? []);
  const toggle = useCallback(
    (i: number) => {
      if (locked) return;
      sfx.tap();
      const next = sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort();
      setSel(next);
      onAnswer(next.length ? { type: 'multi_select', indices: next } : null);
    },
    [locked, onAnswer, sel],
  );
  useDigitKeys(options.length, toggle, !locked && !paused);
  const stateOf = (i: number): TileState => {
    const chosen = sel.includes(i);
    if (!locked) return chosen ? 'selected' : undefined;
    if (correct.has(i)) return chosen ? 'correct' : 'missed';
    return chosen ? 'wrong' : 'dim';
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[13px] font-extrabold tracking-wide text-brand uppercase">Select all that apply</div>
      {options.map((opt, i) => {
        const state = stateOf(i);
        const Box = sel.includes(i) ? SquareCheckBig : Square;
        return (
          <div key={i}>
            <OptionTile
              state={state}
              onClick={() => toggle(i)}
              disabled={locked}
              indicator={<Box className={cn('size-6 shrink-0', state === 'selected' ? 'text-brand' : state === 'correct' || state === 'missed' ? 'text-ok' : state === 'wrong' ? 'text-bad' : 'text-faint')} />}
            >
              <InlineText text={opt} />
              {locked && state === 'missed' && <span className="ml-2 text-xs font-black text-ok uppercase">missed</span>}
            </OptionTile>
            {locked && q.optionFeedback?.[i] && (sel.includes(i) || correct.has(i)) && (
              <p className={cn('mt-1.5 px-2 text-[13px] font-semibold', correct.has(i) ? 'text-ok-ink' : 'text-bad-ink')}>{q.optionFeedback[i]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TrueFalseQuestion({ q, locked, onAnswer, initial, paused }: QuestionProps) {
  const [sel, setSel] = useState<boolean | null>(initial?.type === 'true_false' ? initial.value : null);
  const pick = useCallback(
    (i: number) => {
      if (locked) return;
      const value = i === 0;
      setSel(value);
      sfx.tap();
      onAnswer({ type: 'true_false', value });
    },
    [locked, onAnswer],
  );
  useDigitKeys(2, pick, !locked && !paused);
  const stateOf = (value: boolean): TileState => {
    if (!locked) return sel === value ? 'selected' : undefined;
    if (value === q.answer) return 'correct';
    return sel === value ? 'wrong' : 'dim';
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      {[true, false].map((value, i) => {
        const Icon = value ? Check : X;
        return (
          <OptionTile
            key={String(value)}
            state={stateOf(value)}
            onClick={() => pick(i)}
            disabled={locked}
            className="flex-col justify-center gap-2 py-7 text-center text-lg"
            indicator={
              <span className={cn('flex size-12 items-center justify-center rounded-2xl', value ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad')}>
                <Icon className="size-7" strokeWidth={3} />
              </span>
            }
          >
            <span className="block text-center font-black">{value ? 'True' : 'False'}</span>
            <span className="block text-center text-[11px] font-bold text-faint">press {i + 1}</span>
          </OptionTile>
        );
      })}
    </div>
  );
}
