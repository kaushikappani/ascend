import { ArrowUp, Lightbulb, Mic, Sparkles, WandSparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mascot } from '../../components/Mascot';

/** Ask the coach about the lesson: `selection` is the highlighted passage (null for a free question). */
export type AskFn = (selection: string | null, question: string) => void;

const QUICK = [
  { label: 'Explain more', icon: Sparkles, question: 'Explain this in more depth: what it means, why it works this way, and a small concrete example.' },
  { label: 'Example', icon: Lightbulb, question: 'Show me a realistic example of this (with code if it helps) and walk me through it.' },
  { label: 'Simplify', icon: WandSparkles, question: 'Explain this more simply, as if I were new to it, with an analogy.' },
  { label: 'Interview angle', icon: Mic, question: 'How would an interviewer probe this, and how should I answer?' },
];

const WIDTH = 340;

interface Picked {
  text: string;
  top: number;
  bottom: number;
  center: number;
}

/** Floating "Ask Ace" card that appears when the learner highlights text inside `containerRef`. */
export function SelectionAsk({ containerRef, onAsk }: { containerRef: RefObject<HTMLElement | null>; onAsk: AskFn }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [question, setQuestion] = useState('');
  const popRef = useRef<HTMLDivElement>(null);
  const open = useRef(false);

  useEffect(() => {
    open.current = !!picked;
  }, [picked]);

  useEffect(() => {
    const inPopover = (target: EventTarget | null) => !!popRef.current?.contains(target as Node);
    const onDown = (e: MouseEvent) => {
      if (!inPopover(e.target)) setPicked(null);
    };
    const onUp = (e: MouseEvent) => {
      if (inPopover(e.target)) return;
      // Read the selection once the browser has finished updating it.
      window.setTimeout(() => {
        const sel = window.getSelection();
        const root = containerRef.current;
        if (!sel || sel.isCollapsed || !sel.rangeCount || !root) return;
        const range = sel.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) return;
        const text = sel.toString().trim();
        if (text.length < 2) return;
        const rect = range.getBoundingClientRect();
        setQuestion('');
        setPicked({ text, top: rect.top, bottom: rect.bottom, center: rect.left + rect.width / 2 });
      }, 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open.current) {
        e.stopPropagation();
        setPicked(null);
      }
    };
    const onScroll = (e: Event) => {
      if (!inPopover(e.target)) setPicked(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [containerRef]);

  if (!picked) return null;

  const ask = (q: string) => {
    if (!q.trim()) return;
    onAsk(picked.text, q.trim());
    window.getSelection()?.removeAllRanges();
    setPicked(null);
  };
  const below = picked.top < 220;
  const left = Math.min(window.innerWidth - WIDTH - 12, Math.max(12, picked.center - WIDTH / 2));
  const preview = picked.text.length > 90 ? `${picked.text.slice(0, 90)}…` : picked.text;

  return createPortal(
    <div
      ref={popRef}
      data-selection-ask
      className="fixed z-[70]"
      style={{ left, top: below ? picked.bottom + 10 : picked.top - 10, width: WIDTH, transform: below ? undefined : 'translateY(-100%)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: below ? -6 : 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        className="rounded-2xl border-2 border-line bg-elev p-3 shadow-float"
      >
        <div className="flex items-center gap-2">
          <Mascot size={26} bob={false} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-black">Ask Ace about this</div>
            <div className="truncate text-[11.5px] font-semibold text-faint">“{preview}”</div>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {QUICK.map(({ label, icon: Icon, question: q }) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => ask(q)}
              className="flex items-center gap-1.5 rounded-xl bg-sunken px-2.5 py-2 text-left text-[12.5px] font-extrabold text-ink hover:bg-brand-soft hover:text-brand-ink"
            >
              <Icon className="size-3.5 shrink-0 text-brand" /> {label}
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex items-center gap-1.5 rounded-xl border-2 border-line bg-bg py-1 pr-1 pl-3 focus-within:border-brand"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Or ask your own question…"
            className="no-drag min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={!question.trim()}
            aria-label="Ask"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand text-white disabled:bg-sunken disabled:text-faint"
          >
            <ArrowUp className="size-4" strokeWidth={3} />
          </button>
        </form>
      </motion.div>
    </div>,
    document.body,
  );
}
