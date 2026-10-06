import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { AnswerResult, Question, UserAnswer } from '@shared/types';
import { cn } from '../../../lib/format';

export interface QuestionProps {
  q: Question;
  locked: boolean;
  result: AnswerResult | null;
  onAnswer: (answer: UserAnswer | null) => void;
  /** Submit immediately (used by match, and Ctrl+Enter in short answers). */
  onSubmit: (answer?: UserAnswer) => void;
  /** The answer to show selected (reviewing an earlier question). */
  initial?: UserAnswer | null;
  /** Hidden behind another view: keyboard shortcuts are off. */
  paused?: boolean;
}

export type TileState = 'selected' | 'correct' | 'wrong' | 'dim' | 'missed' | undefined;

export function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  // Never present an ordering puzzle already solved.
  if (copy.length > 1 && copy.every((v, i) => v === items[i])) return [...copy.slice(1), copy[0]];
  return copy;
}

/** Number keys 1-9 pick options while the question is open. */
export function useDigitKeys(count: number, onDigit: (index: number) => void, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= count) {
        e.preventDefault();
        onDigit(n - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [count, onDigit, active]);
}

export function OptionTile({
  index,
  state,
  onClick,
  disabled,
  children,
  indicator,
  className,
  data,
}: {
  index?: number;
  state: TileState;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  indicator?: ReactNode;
  className?: string;
  data?: Record<`data-${string}`, string>;
}) {
  return (
    <button
      type="button"
      {...data}
      data-option={index}
      onMouseDown={(e) => e.preventDefault()}
      data-state={state === 'missed' ? 'correct' : state}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'tile press flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-[15px] font-bold disabled:cursor-default',
        state === 'missed' && 'border-dashed! opacity-80',
        className,
      )}
    >
      {indicator ??
        (index !== undefined && (
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-black',
              state === 'selected' ? 'border-brand text-brand' : state === 'correct' || state === 'missed' ? 'border-ok text-ok' : state === 'wrong' ? 'border-bad text-bad' : 'border-line text-faint',
            )}
          >
            {index + 1}
          </span>
        ))}
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
    </button>
  );
}
