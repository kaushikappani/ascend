import { QUESTION_TYPE_META } from '@shared/constants';
import { CodeBlock, Markdown } from '../../components/Markdown';
import { Badge } from '../../components/ui';
import { cn } from '../../lib/format';
import { FillBlankQuestion, MatchQuestion, OrderingQuestion, ShortAnswerQuestion } from './questions/Build';
import { McqQuestion, MultiSelectQuestion, TrueFalseQuestion } from './questions/Choice';
import type { QuestionProps } from './questions/shared';

function DifficultyDots({ d }: { d: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Difficulty ${d}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn('h-1.5 w-3 rounded-full', i <= d ? 'bg-brand' : 'bg-line-strong')} />
      ))}
    </span>
  );
}

export function QuestionView(props: QuestionProps & { retry?: boolean }) {
  const { q, retry } = props;
  const meta = QUESTION_TYPE_META[q.type];
  return (
    <div className="flex flex-col gap-6" data-question-id={q.id} data-question-type={q.type}>
      <div>
        <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] font-black tracking-wider text-brand uppercase">
          {retry && <Badge tone="warn">Second chance</Badge>}
          <span>{meta.label}</span>
          <DifficultyDots d={q.difficulty} />
        </div>
        {q.type === 'fill_blank' ? (
          <div className="mt-2 text-[15px] font-bold text-muted">{meta.instruction}</div>
        ) : (
          <Markdown text={q.prompt} className="mt-2 text-[21px] leading-snug font-extrabold" />
        )}
        {q.type === 'match' && <div className="mt-1 text-sm font-bold text-muted">{meta.instruction}</div>}
      </div>
      {q.code && q.type !== 'fill_blank' && <CodeBlock code={q.code} language={q.codeLanguage} />}
      {q.type === 'mcq' && <McqQuestion {...props} />}
      {q.type === 'multi_select' && <MultiSelectQuestion {...props} />}
      {q.type === 'true_false' && <TrueFalseQuestion {...props} />}
      {q.type === 'fill_blank' && <FillBlankQuestion {...props} />}
      {q.type === 'short_answer' && <ShortAnswerQuestion {...props} />}
      {q.type === 'ordering' && <OrderingQuestion {...props} />}
      {q.type === 'match' && <MatchQuestion {...props} />}
    </div>
  );
}
