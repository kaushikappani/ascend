import { BookOpen, MessageCircle, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import type { Lesson } from '@shared/types';
import { Markdown } from '../../components/Markdown';
import { Mascot } from '../../components/Mascot';
import { Spinner } from '../../components/ui';
import { cn } from '../../lib/format';
import { ChatView, Composer } from '../coach/ChatView';
import { SelectionAsk, type AskFn } from './SelectionAsk';

export type DrawerMode = 'lesson' | 'ask';

function Tab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-extrabold transition-colors',
        active ? 'bg-brand-soft text-brand-ink' : 'text-muted hover:bg-hover hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Side panel over the lesson: re-read the primer at any point, and ask Ace about it. */
export function LessonDrawer({
  lesson,
  primer,
  mode,
  threadId,
  asking,
  onMode,
  onAsk,
  onClose,
}: {
  lesson: Lesson;
  primer: string;
  mode: DrawerMode;
  threadId: string | null;
  /** A thread is being created for the first question. */
  asking: boolean;
  onMode: (mode: DrawerMode) => void;
  onAsk: AskFn;
  onClose: () => void;
}) {
  const readRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <motion.div className="absolute inset-0 z-20 bg-[#0b0b1a]/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.aside
        data-lesson-drawer={mode}
        initial={{ x: 540 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 36 }}
        className="absolute inset-y-0 right-0 z-30 flex w-[540px] max-w-[92%] flex-col border-l-2 border-line bg-bg shadow-float"
      >
        <div className="flex items-center gap-2 border-b-2 border-line px-4 py-2.5">
          {primer && (
            <Tab active={mode === 'lesson'} onClick={() => onMode('lesson')} icon={<BookOpen className="size-4" />}>
              Lesson
            </Tab>
          )}
          <Tab active={mode === 'ask'} onClick={() => onMode('ask')} icon={<MessageCircle className="size-4" />}>
            Ask Ace
          </Tab>
          <span className="flex-1" />
          <button onClick={onClose} className="rounded-xl p-2 text-faint hover:bg-hover hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {mode === 'lesson' ? (
            <div className="h-full overflow-y-auto">
              <div ref={readRef} className="px-6 py-5">
                <div className="text-[12px] font-black tracking-wider text-brand uppercase">Quick read</div>
                <h2 className="mt-1 text-[22px] leading-tight font-black">{lesson.title}</h2>
                <div className="mt-1 mb-4 text-[12.5px] font-bold text-faint">Highlight anything to ask Ace about it.</div>
                <Markdown text={primer} className="text-[15px]" />
              </div>
              <SelectionAsk containerRef={readRef} onAsk={onAsk} />
            </div>
          ) : threadId ? (
            <ChatView threadId={threadId} compact />
          ) : asking ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
                <Mascot mood="wave" size={84} />
                <div className="text-lg font-black">Stuck on something?</div>
                <p className="max-w-sm text-sm font-semibold text-muted">
                  Ask me anything about “{lesson.title}”. Tip: highlight a sentence in the lesson and I'll explain exactly that part.
                </p>
              </div>
              <div className="border-t-2 border-line p-3">
                <Composer onSend={(text) => onAsk(null, text)} placeholder="Ask about this lesson…" autoFocus />
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}
