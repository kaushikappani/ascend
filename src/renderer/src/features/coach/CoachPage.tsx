import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { AppSnapshot } from '@shared/types';
import { PageFrame } from '../../components/Page';
import { Button, IconButton } from '../../components/ui';
import { api } from '../../lib/api';
import { activeTrack, weakRows } from '../../lib/derive';
import { cn, relTime } from '../../lib/format';
import { attempt, useApp } from '../../lib/store';
import { ChatView } from './ChatView';

function suggestionsFor(s: AppSnapshot): string[] {
  const track = activeTrack(s);
  const weak = weakRows(s, undefined, 2);
  const target = s.targets.find((t) => t.id === s.profile.activeTargetId);
  const out = [
    'What should I focus on this week?',
    weak[0] ? `Explain ${weak[0].concept} with an example` : track ? `Quiz me on something from ${track.title}` : 'How do I prepare for a backend interview?',
    'Give me a tricky interview question and grade my answer',
  ];
  if (target) out.push(`What will ${target.company} likely ask me?`);
  if (weak[1]) out.push(`I keep getting ${weak[1].concept} wrong — help`);
  out.push("What's new in agentic AI that interviewers ask about?");
  return out.slice(0, 5);
}

export function CoachPage({ id }: { id?: string }) {
  const snapshot = useApp((s) => s.snapshot) as AppSnapshot;
  const navigate = useApp((s) => s.navigate);
  const threads = snapshot.threads;
  const current = threads.find((t) => t.id === id) ?? threads[0];
  const suggestions = useMemo(() => suggestionsFor(snapshot), [snapshot]);

  const newChat = async () => {
    const tid = await attempt("Couldn't start a chat", () => api.chat.create({}));
    if (tid) navigate({ name: 'coach', id: tid });
  };

  const creating = useRef(false);
  useEffect(() => {
    if (threads.length || creating.current) return;
    creating.current = true;
    void newChat().finally(() => {
      creating.current = false;
    });
  }, [threads.length]);

  return (
    <PageFrame title="AI coach" scroll={false}>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col border-r-2 border-line bg-elev/50">
          <div className="p-4">
            <Button block icon={<MessageSquarePlus className="size-4" />} onClick={() => void newChat()}>
              New conversation
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {threads.map((t) => (
              <div
                key={t.id}
                onClick={() => navigate({ name: 'coach', id: t.id })}
                className={cn(
                  'group mb-1 flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 transition-colors',
                  current?.id === t.id ? 'bg-brand-soft' : 'hover:bg-hover',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-[13.5px] font-extrabold', current?.id === t.id && 'text-brand-ink')}>{t.title}</div>
                  <div className="truncate text-[11.5px] font-semibold text-faint">
                    {t.contextLabel ? `${t.contextLabel} · ` : ''}
                    {relTime(t.updatedAt)}
                  </div>
                </div>
                <IconButton
                  label="Delete conversation"
                  className="size-7 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    void attempt("Couldn't delete", () => api.chat.remove(t.id));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
        </aside>
        <section className="min-w-0 flex-1">{current && <ChatView key={current.id} threadId={current.id} suggestions={suggestions} />}</section>
      </div>
    </PageFrame>
  );
}
