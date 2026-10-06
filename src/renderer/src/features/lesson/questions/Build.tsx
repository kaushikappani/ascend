import { X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { InlineText } from '../../../components/Markdown';
import { Kbd, Textarea } from '../../../components/ui';
import { cn } from '../../../lib/format';
import { sfx } from '../../../lib/sound';
import { OptionTile, shuffled, type QuestionProps, type TileState } from './shared';

// ---------------------------------------------------------------------------
// Fill in the blanks (word bank or typed)
// ---------------------------------------------------------------------------

export function FillBlankQuestion({ q, locked, result, onAnswer, initial }: QuestionProps) {
  const blanks = q.blanks ?? [];
  const bank = q.wordBank;
  const [values, setValues] = useState<string[]>(() => blanks.map((_, i) => (initial?.type === 'fill_blank' ? (initial.values[i] ?? '') : '')));
  const [focus, setFocus] = useState(0);
  const promptParts = q.prompt.split('___');
  const codeParts = q.code ? q.code.split('___') : null;
  const promptBlankCount = promptParts.length - 1;

  const update = (next: string[]) => {
    setValues(next);
    onAnswer(next.every((v) => v.trim()) ? { type: 'fill_blank', values: next } : null);
  };

  const place = (word: string) => {
    if (locked) return;
    const target = values[focus] ? values.findIndex((v) => !v) : focus;
    if (target < 0) return;
    const next = [...values];
    next[target] = word;
    sfx.tap();
    update(next);
    const empty = next.findIndex((v) => !v);
    setFocus(empty >= 0 ? empty : target);
  };

  const slotClass = (i: number) => {
    if (locked) return result?.parts?.[i] ? 'border-ok bg-ok-soft text-ok-ink' : 'border-bad bg-bad-soft text-bad-ink';
    if (bank && focus === i) return 'border-brand bg-brand-soft text-brand-ink';
    return 'border-line-strong bg-elev text-ink';
  };

  const slot = (i: number, mono: boolean) =>
    bank ? (
      <button
        key={`slot-${i}`}
        type="button"
        disabled={locked}
        onClick={() => {
          if (values[i]) {
            const next = [...values];
            next[i] = '';
            update(next);
          }
          setFocus(i);
        }}
        className={cn(
          'mx-1 inline-flex min-h-9 min-w-[90px] items-center justify-center rounded-xl border-2 border-b-4 px-3 align-middle font-extrabold transition-colors',
          mono && 'font-mono text-[13px]',
          slotClass(i),
        )}
      >
        {values[i] || ' '}
      </button>
    ) : (
      <input
        key={`slot-${i}`}
        value={values[i]}
        disabled={locked}
        autoFocus={i === 0}
        spellCheck={false}
        size={Math.max(6, (blanks[i]?.[0]?.length ?? 6) + 2)}
        onChange={(e) => {
          const next = [...values];
          next[i] = e.target.value;
          update(next);
        }}
        className={cn(
          'no-drag mx-1 inline-block rounded-xl border-2 border-b-4 px-2.5 py-1 align-middle font-extrabold outline-none focus:border-brand',
          mono && 'font-mono text-[13px]',
          slotClass(i),
        )}
      />
    );

  const usedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  }, [values]);

  return (
    <div className="flex flex-col gap-5">
      <div className={cn('text-[19px] font-bold whitespace-pre-wrap', promptBlankCount > 0 ? 'leading-[2.3]' : 'leading-snug')}>
        {promptParts.map((part, i) => (
          <span key={i}>
            <InlineText text={part} />
            {i < promptBlankCount && slot(i, false)}
          </span>
        ))}
      </div>
      {codeParts && (
        <pre className="code-block px-4 py-3 leading-[2.2] whitespace-pre-wrap">
          {codeParts.map((part, i) => (
            <span key={i}>
              {part}
              {i < codeParts.length - 1 && slot(promptBlankCount + i, true)}
            </span>
          ))}
        </pre>
      )}
      {bank && (
        <div className="flex flex-wrap justify-center gap-2.5 border-t-2 border-dashed border-line pt-5">
          {bank.map((word, i) => {
            const used = (usedCount.get(word) ?? 0) > 0;
            return (
              <button
                key={`${word}-${i}`}
                type="button"
                data-chip={word}
                disabled={locked || used}
                onClick={() => place(word)}
                className={cn(
                  'tile press px-4 py-2 font-mono text-[14px] font-bold',
                  used && 'opacity-30 shadow-none! border-dashed!',
                )}
              >
                {word}
              </button>
            );
          })}
        </div>
      )}
      {locked && result && !result.correct && (
        <div className="rounded-2xl bg-ok-soft px-4 py-3 text-[14px] font-bold text-ok-ink">
          Correct: {blanks.map((b, i) => (
            <code key={i} className="mx-1 rounded-md bg-elev px-1.5 py-0.5 font-mono text-[13px]">
              {b[0]}
            </code>
          ))}
        </div>
      )}
      {locked && result?.typoAccepted && <div className="text-[13px] font-bold text-warn-ink">Accepted — watch the spelling next time.</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Short answer (graded by Claude)
// ---------------------------------------------------------------------------

export function ShortAnswerQuestion({ locked, onAnswer, onSubmit, initial }: QuestionProps) {
  const [text, setText] = useState(initial?.type === 'short_answer' ? initial.text : '');
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        autoFocus
        rows={7}
        value={text}
        disabled={locked}
        spellCheck
        placeholder="Answer like you would out loud in an interview — the key idea first, then the why and a quick example."
        className="text-[15px]"
        onChange={(e) => {
          setText(e.target.value);
          onAnswer(e.target.value.trim().length >= 3 ? { type: 'short_answer', text: e.target.value } : null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="flex items-center gap-3 text-xs font-bold text-faint">
        <span>{words} words</span>
        <span className="flex items-center gap-1">
          <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> to submit
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export function OrderingQuestion({ q, locked, result, onAnswer, initial }: QuestionProps) {
  const items = q.items ?? [];
  const placed = initial?.type === 'ordering' ? initial.sequence : [];
  const [pool, setPool] = useState<string[]>(() => shuffled(items).filter((i) => !placed.includes(i)));
  const [seq, setSeq] = useState<string[]>(placed);

  const add = (item: string) => {
    if (locked) return;
    const nextSeq = [...seq, item];
    const nextPool = pool.filter((p) => p !== item);
    setSeq(nextSeq);
    setPool(nextPool);
    sfx.tap();
    onAnswer(nextPool.length === 0 ? { type: 'ordering', sequence: nextSeq } : null);
  };
  const remove = (item: string) => {
    if (locked) return;
    setSeq(seq.filter((s) => s !== item));
    setPool([...pool, item]);
    onAnswer(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-2.5">
        {items.map((_, i) => {
          const item = seq[i];
          const state: TileState = locked ? (result?.parts?.[i] ? 'correct' : 'wrong') : item ? 'selected' : undefined;
          return (
            <li key={i} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-sm font-black text-muted">{i + 1}</span>
              {item ? (
                <OptionTile state={state} onClick={() => remove(item)} disabled={locked} className="py-3" indicator={!locked ? <X className="size-4 text-faint" /> : undefined}>
                  <InlineText text={item} />
                </OptionTile>
              ) : (
                <div className="h-[52px] flex-1 rounded-[18px] border-2 border-dashed border-line" />
              )}
            </li>
          );
        })}
      </ol>
      {pool.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2.5 border-t-2 border-dashed border-line pt-5">
          {pool.map((item) => (
            <button key={item} type="button" data-pool={item} disabled={locked} onClick={() => add(item)} className="tile press px-4 py-2.5 text-[14px] font-bold">
              <InlineText text={item} />
            </button>
          ))}
        </div>
      )}
      {locked && result && !result.correct && (
        <div className="rounded-2xl bg-ok-soft px-4 py-3 text-ok-ink">
          <div className="mb-1 text-[12px] font-black tracking-wider uppercase">Correct order</div>
          <ol className="list-decimal pl-5 text-sm font-bold">
            {items.map((item) => (
              <li key={item}>
                <InlineText text={item} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match pairs (validated instantly, Duolingo style)
// ---------------------------------------------------------------------------

export function MatchQuestion({ q, locked, onSubmit }: QuestionProps) {
  const pairs = q.pairs ?? [];
  const [lefts] = useState(() => shuffled(pairs.map((p) => p.left)));
  const [rights] = useState(() => shuffled(pairs.map((p) => p.right)));
  const [selL, setSelL] = useState<string | null>(null);
  const [selR, setSelR] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [wrong, setWrong] = useState<{ l: string; r: string } | null>(null);
  const mistakes = useRef(0);
  const matchedRights = new Set(pairs.filter((p) => matched.includes(p.left)).map((p) => p.right));

  const tryPair = (l: string, r: string) => {
    if (pairs.some((p) => p.left === l && p.right === r)) {
      sfx.match();
      const next = [...matched, l];
      setMatched(next);
      setSelL(null);
      setSelR(null);
      if (next.length === pairs.length) setTimeout(() => onSubmit({ type: 'match', mistakes: mistakes.current }), 380);
    } else {
      sfx.wrong();
      mistakes.current += 1;
      setWrong({ l, r });
      setTimeout(() => {
        setWrong(null);
        setSelL(null);
        setSelR(null);
      }, 600);
    }
  };

  const stateL = (l: string): TileState =>
    locked || matched.includes(l) ? 'correct' : wrong?.l === l ? 'wrong' : selL === l ? 'selected' : undefined;
  const stateR = (r: string): TileState =>
    locked || matchedRights.has(r) ? 'correct' : wrong?.r === r ? 'wrong' : selR === r ? 'selected' : undefined;

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
      <div className="flex flex-col gap-3">
        {lefts.map((l) => (
          <OptionTile
            key={l}
            data={{ 'data-left': l }}
            state={stateL(l)}
            disabled={locked || matched.includes(l) || !!wrong}
            onClick={() => {
              sfx.tap();
              if (selR) tryPair(l, selR);
              else setSelL(selL === l ? null : l);
            }}
            className={cn('min-h-[58px] justify-center text-center', wrong?.l === l && 'animate-shake', matched.includes(l) && 'opacity-60')}
            indicator={<span />}
          >
            <InlineText text={l} />
          </OptionTile>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {rights.map((r) => (
          <OptionTile
            key={r}
            data={{ 'data-right': r }}
            state={stateR(r)}
            disabled={locked || matchedRights.has(r) || !!wrong}
            onClick={() => {
              sfx.tap();
              if (selL) tryPair(selL, r);
              else setSelR(selR === r ? null : r);
            }}
            className={cn('min-h-[58px] justify-center text-center text-[14px]', wrong?.r === r && 'animate-shake', matchedRights.has(r) && 'opacity-60')}
            indicator={<span />}
          >
            <InlineText text={r} />
          </OptionTile>
        ))}
      </div>
    </div>
  );
}
