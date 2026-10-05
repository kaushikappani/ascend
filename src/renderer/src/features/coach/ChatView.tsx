import { ArrowUp, Dumbbell, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, CoachAction } from '@shared/types';
import { ActivityFeed, useRunning } from '../../components/AgentActivity';
import { Markdown } from '../../components/Markdown';
import { Mascot } from '../../components/Mascot';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { cn } from '../../lib/format';
import { attempt, startLesson, useApp } from '../../lib/store';

const TOOL_LABEL: Record<string, string> = {
  WebSearch: '🔎 Searched the web',
  WebFetch: '🌐 Read a web page',
  mcp__coach__get_learner_profile: '📊 Checked your profile',
  mcp__coach__get_topic_mastery: '📈 Checked topic mastery',
  mcp__coach__get_recent_mistakes: '🧾 Reviewed your mistakes',
  mcp__coach__record_coach_note: '📝 Saved a note to your profile',
  mcp__coach__suggest_practice: '🎯 Built a practice session',
  mcp__coach__schedule_review: '📅 Scheduled a review',
};

function TypingDots() {
  return (
    <div className="flex gap-1.5 py-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-2 rounded-full bg-brand"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}

function ActionCard({ action }: { action: CoachAction }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-2xl border-2 border-brand/30 bg-brand-soft p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
        <Dumbbell className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold text-brand-ink">{action.title}</div>
        <div className="line-clamp-2 text-xs font-semibold text-brand-ink/75">{action.focus}</div>
      </div>
      <Button size="sm" onClick={() => void startLesson({ trackId: action.trackId, kind: 'custom', focus: action.focus, title: action.title })}>
        Start
      </Button>
    </div>
  );
}

function Bubble({ m, threadId }: { m: ChatMessage; threadId: string }) {
  const stream = useApp((s) => s.streams[m.id]);
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="selectable max-w-[82%] rounded-3xl rounded-br-lg bg-brand px-4 py-3 text-[15px] font-semibold whitespace-pre-wrap text-white">{m.text}</div>
      </div>
    );
  }
  const text = m.pending ? (stream ?? '') : m.text;
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 shrink-0">
        <Mascot size={38} bob={false} mood={m.pending ? 'thinking' : m.error ? 'sad' : 'happy'} />
      </div>
      <div className="min-w-0 max-w-[88%] flex-1">
        {!!m.tools?.length && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {[...new Set(m.tools.map((t) => TOOL_LABEL[t] ?? `🛠️ ${t.replace(/^mcp__\w+__/, '')}`))].map((label) => (
              <span key={label} className="rounded-full bg-sunken px-2.5 py-0.5 text-[11.5px] font-bold text-muted">
                {label}
              </span>
            ))}
          </div>
        )}
        <div className={cn('rounded-3xl rounded-tl-lg border-2 bg-elev px-4 py-3', m.error ? 'border-bad/40' : 'border-line')}>
          {m.pending && !text ? <TypingDots /> : <Markdown text={text} streaming={m.pending} />}
        </div>
        {m.error && (
          <button onClick={() => void attempt('Retry failed', () => api.chat.retry(threadId))} className="mt-1.5 flex items-center gap-1 text-[13px] font-extrabold text-brand hover:underline">
            <RotateCcw className="size-3.5" /> Retry
          </button>
        )}
        {m.actions?.map((a) => <ActionCard key={a.id} action={a} />)}
      </div>
    </div>
  );
}

export function Composer({
  onSend,
  disabled,
  placeholder = 'Ask your coach anything…',
  autoFocus,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(220, el.scrollHeight)}px`;
  }, [text]);
  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
  };
  return (
    <div className="flex items-end gap-2 rounded-3xl border-2 border-line bg-elev p-2 pl-4 focus-within:border-brand">
      <textarea
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        className="no-drag max-h-[220px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] font-semibold outline-none placeholder:text-faint"
      />
      <button
        onClick={send}
        disabled={disabled || !text.trim()}
        className="press flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_3px_0_var(--brand-deep)] disabled:bg-sunken disabled:text-faint disabled:shadow-none"
        aria-label="Send"
      >
        <ArrowUp className="size-5" strokeWidth={3} />
      </button>
    </div>
  );
}

export function ChatView({ threadId, suggestions = [], compact }: { threadId: string; suggestions?: string[]; compact?: boolean }) {
  const thread = useApp((s) => s.snapshot?.threads.find((t) => t.id === threadId));
  const streams = useApp((s) => s.streams);
  const running = useRunning(threadId, ['chat']);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pending = !!thread?.messages.some((m) => m.pending);
  const lastLen = thread?.messages.at(-1) ? (streams[thread.messages.at(-1)?.id ?? ''] ?? thread.messages.at(-1)?.text ?? '').length : 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [thread?.messages.length, lastLen]);

  if (!thread) return null;
  const send = (text: string) => void attempt("Couldn't send your message", () => api.chat.send(threadId, text));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className={cn('min-h-0 flex-1 overflow-y-auto', compact ? 'px-5 py-4' : 'px-8 py-6')}>
        <div className="mx-auto flex max-w-[820px] flex-col gap-5">
          {thread.contextLabel && (
            <div className="self-center rounded-full bg-sunken px-3 py-1 text-xs font-bold text-muted">Context: {thread.contextLabel}</div>
          )}
          {thread.messages.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Mascot mood="wave" size={92} />
              <div>
                <div className="text-lg font-black">What should we work on?</div>
                <div className="text-sm font-semibold text-muted">I know your progress, weak spots and targets — and I can search the web.</div>
              </div>
              <div className="flex max-w-[640px] flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="tile press px-3.5 py-2 text-[13px] font-bold">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {thread.messages.map((m) => (
            <Bubble key={m.id} m={m} threadId={threadId} />
          ))}
          {pending && running.length > 0 && <ActivityFeed jobs={running} max={2} compact className="pl-12" />}
        </div>
      </div>
      <div className={cn('border-t-2 border-line bg-bg', compact ? 'p-3' : 'px-8 py-4')}>
        <div className="mx-auto max-w-[820px]">
          <Composer onSend={send} disabled={pending} autoFocus />
        </div>
      </div>
    </div>
  );
}
