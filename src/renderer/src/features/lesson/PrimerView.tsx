import { AlertTriangle, BookOpen, ExternalLink, RotateCcw } from 'lucide-react';
import type { JobInfo, Lesson } from '@shared/types';
import { ActivityFeed } from '../../components/AgentActivity';
import { Markdown } from '../../components/Markdown';
import { Mascot } from '../../components/Mascot';
import { Button, Spinner } from '../../components/ui';
import { api } from '../../lib/api';

export function PrimerView({
  lesson,
  text,
  jobs,
  onStart,
}: {
  lesson: Lesson;
  text: string;
  jobs: JobInfo[];
  onStart: () => void;
}) {
  const streaming = lesson.primerStatus === 'streaming' || lesson.primerStatus === 'pending';
  const questionsReady = lesson.questionsStatus === 'ready';
  const questionsFailed = lesson.questionsStatus === 'error';
  const answered = Object.keys(lesson.answers).length;
  const words = text.split(/\s+/).length;
  const primerJobs = jobs.filter((j) => j.kind === 'primer');
  const questionJobs = jobs.filter((j) => j.kind === 'questions' && j.status === 'running');
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-[780px] px-8 pt-8 pb-12">
          <div className="flex items-center gap-2 text-[12.5px] font-black tracking-wider text-brand uppercase">
            <BookOpen className="size-4" /> Quick read {lesson.subtitle ? `· ${lesson.subtitle}` : ''}
          </div>
          <h1 className="mt-1.5 text-[32px] leading-tight font-black">{lesson.title}</h1>
          {text && <div className="mt-1 text-[13px] font-bold text-faint">~{Math.max(1, Math.round(words / 200))} min read · written for you by Claude</div>}
          {!text && streaming && (
            <div className="mt-8 flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <Mascot mood="thinking" size={78} />
                <ActivityFeed jobs={primerJobs} max={4} />
              </div>
              {[92, 100, 84, 96, 70].map((w, i) => (
                <div key={i} className="shimmer h-4 rounded-full" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
          {lesson.primerStatus === 'error' && !text && (
            <div className="mt-8 flex items-center gap-3 rounded-2xl border-2 border-warn/40 bg-warn-soft p-4 text-sm font-semibold text-warn-ink">
              <AlertTriangle className="size-5 shrink-0" />
              <span className="flex-1">Couldn't write the primer ({lesson.error ?? 'unknown error'}). You can still practise.</span>
            </div>
          )}
          {text && <Markdown text={text} streaming={streaming} className="mt-6" />}
          {!streaming && !!lesson.sources?.length && (
            <div className="mt-8 rounded-2xl border-2 border-line p-4">
              <div className="mb-2 text-[12px] font-black tracking-wider text-faint uppercase">Sources</div>
              <ul className="flex flex-col gap-1.5">
                {lesson.sources.map((s) => (
                  <li key={s.url}>
                    <button onClick={() => void api.app.openExternal(s.url)} className="flex items-center gap-1.5 text-left text-sm font-bold text-brand hover:underline">
                      <ExternalLink className="size-3.5 shrink-0" /> {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      </div>
      <div className="border-t-2 border-line bg-elev">
        <div className="mx-auto flex max-w-[900px] items-center gap-4 px-8 py-4">
          <div className="min-w-0 flex-1 text-sm font-bold text-muted">
            {questionsReady && answered ? (
              <span className="text-ok-ink">
                ✓ {Math.min(answered, lesson.questions.length)} of {lesson.questions.length} answered — pick up where you left off
              </span>
            ) : questionsReady ? (
              <span className="text-ok-ink">✓ {lesson.questions.length} questions ready — adapted to your level</span>
            ) : questionsFailed ? (
              <span className="flex items-center gap-2 text-bad-ink">
                <AlertTriangle className="size-4" /> {lesson.error ?? "Couldn't create questions."}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Spinner className="size-4" />
                <span className="truncate">{questionJobs[0]?.activity.at(-1)?.text ?? 'Crafting your questions…'}</span>
              </span>
            )}
          </div>
          {questionsFailed ? (
            <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => void api.lessons.retry(lesson.id)}>
              Retry questions
            </Button>
          ) : (
            <Button caps size="lg" disabled={!questionsReady} onClick={onStart}>
              {!questionsReady ? 'Preparing…' : answered ? 'Continue practice' : 'Start practice'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
