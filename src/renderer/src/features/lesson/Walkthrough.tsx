import { ArrowLeft, Check, Hand, Lightbulb, RotateCcw, SkipForward, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LEARN_CARD_META } from '@shared/constants';
import type { LearnCard, Lesson } from '@shared/types';
import { ActivityFeed, useJobs } from '../../components/AgentActivity';
import { CodeBlock, InlineText, Markdown } from '../../components/Markdown';
import { Mascot, SpeechBubble } from '../../components/Mascot';
import { Button, Kbd } from '../../components/ui';
import { api } from '../../lib/api';
import { cn } from '../../lib/format';
import { attempt } from '../../lib/store';
import { sfx } from '../../lib/sound';
import { OptionTile, useDigitKeys, type TileState } from './questions/shared';
import { SelectionAsk, type AskFn } from './SelectionAsk';

/** What the learner has done on a card; kept per card so going back shows it as they left it. */
interface CardState {
  /** flashcard: flipped (1); steps: how many steps are shown. */
  reveal: number;
  picked?: number;
  /** sort: item index → bucket index. */
  placed?: Record<number, number>;
  checked?: boolean;
}

const FRESH: CardState = { reveal: 0 };

type Action = { label: string; enabled: boolean; kind: 'reveal' | 'check' | 'next' };

function actionFor(card: LearnCard, st: CardState): Action {
  if (card.type === 'flashcard' && st.reveal < 1) return { label: 'Flip card', enabled: true, kind: 'reveal' };
  if (card.type === 'steps' && st.reveal < (card.steps?.length ?? 0)) return { label: st.reveal ? 'Next step' : 'Show first step', enabled: true, kind: 'reveal' };
  if (card.type === 'quick_check' && st.picked === undefined) return { label: 'Pick an answer', enabled: false, kind: 'next' };
  if (card.type === 'sort' && !st.checked) {
    return { label: 'Check', enabled: Object.keys(st.placed ?? {}).length === (card.items?.length ?? 0), kind: 'check' };
  }
  return { label: 'Next', enabled: true, kind: 'next' };
}

function Takeaway({ text, tone = 'brand' }: { text: string; tone?: 'brand' | 'ok' | 'bad' }) {
  const style = { brand: 'border-brand/30 bg-brand-soft text-brand-ink', ok: 'border-ok/40 bg-ok-soft text-ok-ink', bad: 'border-bad/40 bg-bad-soft text-bad-ink' }[tone];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex items-start gap-3 rounded-2xl border-2 px-4 py-3', style)}>
      <Lightbulb className="mt-1 size-5 shrink-0" />
      <Markdown text={text} className="min-w-0 flex-1 text-[15px] [&_p]:my-1" />
    </motion.div>
  );
}

function FlashcardView({ card, flipped, onFlip }: { card: LearnCard; flipped: boolean; onFlip: () => void }) {
  return (
    <div className="flex flex-col gap-4 [perspective:1200px]">
      <AnimatePresence mode="wait" initial={false}>
        {flipped ? (
          <motion.div
            key="back"
            initial={{ rotateX: -80, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            transition={{ duration: 0.22 }}
            className="rounded-3xl border-2 border-ok/40 bg-ok-soft px-5 py-4 text-ink"
          >
            <div className="mb-1 text-[12px] font-black tracking-wider text-ok-ink uppercase">Answer</div>
            <Markdown text={card.answer ?? ''} className="text-[15.5px]" />
          </motion.div>
        ) : (
          <motion.button
            key="front"
            type="button"
            onClick={onFlip}
            exit={{ rotateX: 80, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="tile press flex flex-col items-center gap-2 border-dashed! px-6 py-9 text-center"
          >
            <span className="text-3xl">🤔</span>
            <span className="text-[15px] font-extrabold">Answer it in your head first…</span>
            <span className="text-[13px] font-bold text-faint">then flip the card to check yourself</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function StepsView({ card, shown, onShowNext }: { card: LearnCard; shown: number; onShowNext: () => void }) {
  const steps = card.steps ?? [];
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2.5">
        {steps.slice(0, shown).map((s, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-3 rounded-2xl border-2 border-line bg-elev px-4 py-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-black text-white">{i + 1}</span>
            <Markdown text={s} className="min-w-0 flex-1 text-[15px] [&_p]:my-0.5" />
          </motion.li>
        ))}
      </ol>
      {shown < steps.length ? (
        <button
          type="button"
          onClick={onShowNext}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong px-4 py-3 text-[14px] font-extrabold text-muted hover:border-brand hover:text-brand"
        >
          <Hand className="size-4" /> {shown ? 'Show the next step' : 'Walk me through it'} · {steps.length - shown} to go
        </button>
      ) : (
        card.explanation && <Takeaway text={card.explanation} />
      )}
    </div>
  );
}

function QuickCheckView({ card, picked, onPick, paused }: { card: LearnCard; picked?: number; onPick: (i: number) => void; paused: boolean }) {
  const options = card.options ?? [];
  const locked = picked !== undefined;
  const pick = useCallback(
    (i: number) => {
      if (locked) return;
      if (i === card.correctIndex) sfx.correct();
      else sfx.wrong();
      onPick(i);
    },
    [locked, card.correctIndex, onPick],
  );
  useDigitKeys(options.length, pick, !locked && !paused);
  const stateOf = (i: number): TileState => {
    if (!locked) return undefined;
    if (i === card.correctIndex) return 'correct';
    return picked === i ? 'wrong' : 'dim';
  };
  return (
    <div className="flex flex-col gap-3">
      {options.map((opt, i) => (
        <OptionTile key={i} index={i} state={stateOf(i)} onClick={() => pick(i)} disabled={locked}>
          <InlineText text={opt} />
        </OptionTile>
      ))}
      {locked && (
        <Takeaway
          tone={picked === card.correctIndex ? 'ok' : 'bad'}
          text={`**${picked === card.correctIndex ? 'Nice — exactly right.' : 'Not quite.'}** ${card.explanation ?? ''}`}
        />
      )}
    </div>
  );
}

function SortView({
  card,
  placed,
  checked,
  onPlace,
  paused,
}: {
  card: LearnCard;
  placed: Record<number, number>;
  checked: boolean;
  onPlace: (item: number, bucket: number | null) => void;
  paused: boolean;
}) {
  const items = card.items ?? [];
  const buckets = card.buckets ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const pool = items.map((_, i) => i).filter((i) => placed[i] === undefined);
  const place = useCallback(
    (bucket: number) => {
      if (selected === null || checked) return;
      sfx.tap();
      onPlace(selected, bucket);
      setSelected(null);
    },
    [selected, checked, onPlace],
  );
  useDigitKeys(2, place, selected !== null && !checked && !paused);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        {buckets.map((b, bi) => (
          <div
            key={bi}
            data-bucket={bi}
            onClick={() => place(bi)}
            className={cn(
              'flex min-h-[150px] flex-col gap-2 rounded-3xl border-2 border-dashed p-3 transition-colors',
              selected !== null && !checked ? 'cursor-pointer border-brand bg-brand-soft/50' : 'border-line-strong',
            )}
          >
            <div className="flex items-center justify-between px-1 text-[12.5px] font-black tracking-wider text-muted uppercase">
              <InlineText text={b} />
              {selected !== null && !checked && <Kbd>{bi + 1}</Kbd>}
            </div>
            {items.map((item, i) =>
              placed[i] === bi ? (
                <OptionTile
                  key={i}
                  state={checked ? (item.bucket === bi ? 'correct' : 'wrong') : undefined}
                  disabled={checked}
                  onClick={() => selected === null && onPlace(i, null)}
                  className="py-2.5 text-[14px]"
                  indicator={checked ? item.bucket === bi ? <Check className="size-4 text-ok" /> : <X className="size-4 text-bad" /> : <span />}
                >
                  <InlineText text={item.text} />
                </OptionTile>
              ) : null,
            )}
          </div>
        ))}
      </div>
      {pool.length > 0 && (
        <>
          <div className="flex flex-wrap justify-center gap-2.5 border-t-2 border-dashed border-line pt-4">
            {pool.map((i) => (
              <button
                key={i}
                type="button"
                data-sort-item={i}
                data-state={selected === i ? 'selected' : undefined}
                onClick={() => setSelected(selected === i ? null : i)}
                className="tile press px-4 py-2.5 text-[14px] font-bold"
              >
                <InlineText text={items[i].text} />
              </button>
            ))}
          </div>
          <p className="text-center text-[12.5px] font-bold text-faint">Tap an item, then the bucket it belongs in (or press 1 / 2).</p>
        </>
      )}
      {checked && card.explanation && <Takeaway text={card.explanation} />}
    </div>
  );
}

/** Hands-on cards between the primer and the graded questions. Ungraded: it's practice for the practice. */
export function Walkthrough({ lesson, paused, onAsk, onFinish }: { lesson: Lesson; paused: boolean; onAsk: AskFn; onFinish: () => void }) {
  const jobs = useJobs(lesson.id, ['walkthrough']);
  const cards = lesson.walkthrough ?? [];
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<Record<string, CardState>>({});
  const cardRef = useRef<HTMLDivElement>(null);
  const card = cards[Math.min(index, cards.length - 1)] as LearnCard | undefined;
  const st = (card && states[card.id]) || FRESH;
  const questionsReady = lesson.questionsStatus === 'ready';
  const questionsFailed = lesson.questionsStatus === 'error';
  const last = index >= cards.length - 1;

  const patch = useCallback(
    (p: Partial<CardState>) => {
      if (!card) return;
      setStates((s) => ({ ...s, [card.id]: { ...(s[card.id] ?? FRESH), ...p } }));
    },
    [card],
  );

  const action = card ? actionFor(card, st) : null;
  const finishLabel = questionsFailed ? 'Retry questions' : questionsReady ? 'Start practice' : 'Preparing questions…';

  const primary = useCallback(() => {
    if (!card || !action?.enabled) return;
    if (action.kind === 'reveal') {
      sfx.tap();
      patch({ reveal: st.reveal + 1 });
    } else if (action.kind === 'check') {
      const items = card.items ?? [];
      const allRight = items.every((item, i) => st.placed?.[i] === item.bucket);
      if (allRight) sfx.correct();
      else sfx.partial();
      patch({ checked: true });
    } else if (!last) {
      setIndex((i) => i + 1);
    } else if (questionsReady) {
      onFinish();
    } else if (questionsFailed) {
      void attempt('Retry failed', () => api.lessons.retry(lesson.id));
    }
  }, [card, action, st, patch, last, questionsReady, questionsFailed, onFinish, lesson.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || paused) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      primary();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [primary, paused]);

  const status = lesson.walkthroughStatus;
  if (status === 'pending' || status === 'streaming') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-8">
        <div className="flex items-center gap-5">
          <Mascot mood="thinking" size={110} />
          <SpeechBubble className="max-w-sm">Setting up a hands-on warm-up so the ideas stick before the real questions…</SpeechBubble>
        </div>
        <ActivityFeed jobs={jobs} className="w-full max-w-md" />
        <Button variant="ghost" icon={<SkipForward className="size-4" />} disabled={!questionsReady} onClick={onFinish}>
          {questionsReady ? 'Skip to questions' : 'Preparing questions…'}
        </Button>
      </div>
    );
  }
  if (!card) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
        <Mascot mood="happy" size={110} />
        <div>
          <div className="text-xl font-black">Straight to practice this time</div>
          <p className="mt-1 max-w-md text-sm font-semibold text-muted">The hands-on warm-up isn't available for this lesson, but your questions are built around what you just read.</p>
        </div>
        <Button
          caps
          size="lg"
          icon={questionsFailed ? <RotateCcw className="size-4" /> : undefined}
          disabled={!questionsReady && !questionsFailed}
          onClick={() => (questionsFailed ? void attempt('Retry failed', () => api.lessons.retry(lesson.id)) : onFinish())}
        >
          {finishLabel}
        </Button>
      </div>
    );
  }

  const meta = LEARN_CARD_META[card.type];
  const label = action?.kind === 'next' && last && action.enabled ? finishLabel : (action?.label ?? 'Next');
  const enabled = !!action?.enabled && !(action.kind === 'next' && last && !questionsReady && !questionsFailed);

  return (
    <div className="flex h-full min-h-0 flex-col" data-walkthrough>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[780px] px-8 pt-7 pb-12">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[12.5px] font-black tracking-wider text-brand uppercase">
              <Hand className="size-4" /> Hands-on warm-up · {index + 1} of {cards.length}
            </div>
            <button
              onClick={onFinish}
              disabled={!questionsReady}
              className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[13px] font-extrabold text-muted hover:bg-hover hover:text-ink disabled:opacity-40"
            >
              Skip to questions <SkipForward className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-1.5">
            {cards.map((c, i) => (
              <button
                key={c.id}
                aria-label={`Card ${i + 1}`}
                onClick={() => i <= index && setIndex(i)}
                className={cn('h-2 flex-1 rounded-full transition-colors', i < index ? 'bg-ok' : i === index ? 'bg-brand' : 'bg-sunken')}
              />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={card.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.22 }}
              className="mt-7 flex flex-col gap-5"
              data-card-type={card.type}
            >
              <div ref={cardRef} className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-[12.5px] font-black tracking-wider text-muted uppercase">
                  <span className="text-base">{meta.emoji}</span> {meta.label}
                </div>
                <h2 className="text-[26px] leading-tight font-black">{card.title}</h2>
                <Markdown text={card.prompt} className="text-[17px]" />
                {card.code && <CodeBlock code={card.code} language={card.codeLanguage} />}
                {card.type === 'flashcard' && <FlashcardView card={card} flipped={st.reveal >= 1} onFlip={() => patch({ reveal: 1 })} />}
                {card.type === 'steps' && <StepsView card={card} shown={st.reveal} onShowNext={() => patch({ reveal: st.reveal + 1 })} />}
                {card.type === 'quick_check' && <QuickCheckView card={card} picked={st.picked} onPick={(i) => patch({ picked: i })} paused={paused} />}
                {card.type === 'sort' && (
                  <SortView
                    card={card}
                    placed={st.placed ?? {}}
                    checked={!!st.checked}
                    paused={paused}
                    onPlace={(item, bucket) => {
                      const next = { ...(st.placed ?? {}) };
                      if (bucket === null) delete next[item];
                      else next[item] = bucket;
                      patch({ placed: next });
                    }}
                  />
                )}
              </div>
              <SelectionAsk containerRef={cardRef} onAsk={onAsk} />
              <p className="text-[12.5px] font-bold text-faint">Tip: highlight any text to ask Ace about it.</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="border-t-2 border-line bg-elev">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4 px-8 py-5">
          <Button variant="secondary" size="lg" caps icon={<ArrowLeft className="size-5" />} disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            Back
          </Button>
          <div className="hidden items-center gap-1.5 text-xs font-bold text-faint md:flex">
            <Kbd>Enter</Kbd> to continue
          </div>
          <Button size="lg" caps disabled={!enabled} onClick={primary} className="min-w-[170px]">
            {label}
          </Button>
        </div>
      </div>
    </div>
  );
}
