import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { AnswerResult, Lesson, Question, UserAnswer } from '@shared/types';
import { Mascot } from '../../components/Mascot';
import { Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { attempt } from '../../lib/store';
import { ChatView } from '../coach/ChatView';
import { describeAnswer, describeCorrect } from './describe';

export function ExplainDrawer({
  lesson,
  q,
  result,
  answer,
  onClose,
}: {
  lesson: Lesson;
  q: Question;
  result: AnswerResult;
  answer: UserAnswer | null;
  onClose: () => void;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const context = [
      `Lesson: ${lesson.title}${lesson.subtitle ? ` (${lesson.subtitle})` : ''}`,
      `Question (${q.type}): ${q.prompt}`,
      q.code ? `Code:\n${q.code}` : '',
      q.options ? `Options: ${q.options.map((o, i) => `${i + 1}) ${o}`).join('  ')}` : '',
      `Correct answer: ${describeCorrect(q)}`,
      `Learner answered: ${describeAnswer(q, answer ?? undefined)} — graded ${result.verdict}`,
      `Explanation already shown: ${q.explanation}`,
    ]
      .filter(Boolean)
      .join('\n');
    void (async () => {
      const id = await attempt("Couldn't open the coach", () =>
        api.chat.create({ title: `Explain: ${q.prompt.slice(0, 40)}`, contextLabel: 'Lesson question', context }),
      );
      if (!id) return;
      setThreadId(id);
      await attempt("Couldn't ask the coach", () =>
        api.chat.send(
          id,
          result.verdict === 'correct'
            ? 'I got this one right, but go deeper: explain the concept with a small example and how I should talk about it in an interview.'
            : "I didn't get this one. Explain why the correct answer is right, where my thinking likely went wrong, and give me a simple example.",
        ),
      );
    })();
  }, [lesson, q, result, answer]);

  return (
    <>
      <motion.div className="absolute inset-0 z-20 bg-[#0b0b1a]/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.aside
        initial={{ x: 480 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 36 }}
        className="absolute inset-y-0 right-0 z-30 flex w-[500px] flex-col border-l-2 border-line bg-bg shadow-float"
      >
        <div className="flex items-center gap-3 border-b-2 border-line px-5 py-3">
          <Mascot size={36} bob={false} />
          <div className="flex-1">
            <div className="text-[15px] font-black">Ask Ace</div>
            <div className="text-xs font-semibold text-muted">Your coach knows this question and your answer</div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-faint hover:bg-hover hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {threadId ? (
            <ChatView threadId={threadId} compact />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}
