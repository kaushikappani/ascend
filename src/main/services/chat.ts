// Coach chat: a live Claude Code session with web tools and learner-model tools.
import type { NewChatInput } from '@shared/api';
import type { AppData, ChatMessage, ChatThread } from '@shared/types';
import { COACH_TOOL_NAMES, createCoachServer } from '../agent/coachTools';
import {
  activeTarget,
  conceptListText,
  learnerProfileText,
  notesText,
  strongConcepts,
  targetSummaryText,
  tracksOverviewText,
  weakConcepts,
} from '../agent/context';
import { coachChatSystem } from '../agent/prompts';
import { LiveSession, mainModel } from '../agent/runtime';
import { emit } from '../events';
import { jobs } from '../jobs';
import { store } from '../store';
import { errorMessage, nowIso, truncate, uid } from '../util';

interface LiveChat {
  session: LiveSession;
  current?: ChatMessage;
}

const live = new Map<string, LiveChat>();

function find(threadId: string): ChatThread | undefined {
  return store.data.threads.find((t) => t.id === threadId);
}

function snapshotText(d: AppData): string {
  const target = activeTarget(d);
  return [
    learnerProfileText(d),
    `Tracks:\n${tracksOverviewText(d)}`,
    `Weak concepts: ${conceptListText(weakConcepts(d, {}, 8))}`,
    `Strong concepts: ${conceptListText(strongConcepts(d, {}, 6))}`,
    target ? `Active interview target:\n${targetSummaryText(target)}` : '',
    `Coach notes:\n${notesText(d, { limit: 8 })}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function getLive(thread: ChatThread): LiveChat {
  let entry = live.get(thread.id);
  if (!entry) {
    const d = store.data;
    const web = d.settings.research !== 'off';
    const holder: LiveChat = { session: null as unknown as LiveSession };
    const server = createCoachServer({
      source: 'chat',
      attachAction: (action) => {
        const msg = holder.current;
        if (!msg) return;
        store.mutate(() => {
          msg.actions = [...(msg.actions ?? []), action];
        });
      },
    });
    holder.session = new LiveSession({
      system: coachChatSystem({ snapshot: snapshotText(d), web, context: thread.context }),
      model: mainModel(),
      effort: 'medium',
      web,
      mcp: { server, tools: COACH_TOOL_NAMES },
      resume: thread.claudeSessionId,
      maxTurns: 14,
    });
    entry = holder;
    live.set(thread.id, entry);
  }
  return entry;
}

export function createThread(input?: NewChatInput): string {
  const now = nowIso();
  const thread: ChatThread = {
    id: uid('chat_'),
    title: input?.title?.trim() || 'New conversation',
    messages: [],
    contextLabel: input?.contextLabel,
    context: input?.context,
    createdAt: now,
    updatedAt: now,
  };
  store.mutate((d) => {
    d.threads.unshift(thread);
    if (d.threads.length > 80) d.threads.length = 80;
  });
  return thread.id;
}

async function runReply(threadId: string, reply: ChatMessage, text: string): Promise<void> {
  const thread = find(threadId);
  if (!thread) return;
  const entry = getLive(thread);
  entry.current = reply;
  const job = jobs.start('chat', 'Coach is replying', { refId: threadId, model: mainModel(), background: true });
  let streamed = '';
  try {
    const out = await entry.session.send(text, job, {
      onText: (delta) => {
        streamed += delta;
        emit('chatDelta', { scope: 'thread', id: threadId, messageId: reply.id, delta });
      },
      onToolUse: (name) => {
        if (streamed && !streamed.endsWith('\n\n')) {
          streamed += '\n\n';
          emit('chatDelta', { scope: 'thread', id: threadId, messageId: reply.id, delta: '\n\n' });
        }
        store.mutate(() => {
          reply.tools = [...new Set([...(reply.tools ?? []), name])];
        });
      },
    });
    store.mutate(() => {
      reply.text = (streamed.trim() || out.text).trim() || '…';
      reply.pending = false;
      thread.claudeSessionId = entry.session.sessionId ?? thread.claudeSessionId;
      thread.updatedAt = nowIso();
    });
    job.done();
  } catch (error) {
    store.mutate(() => {
      reply.pending = false;
      reply.error = true;
      reply.text = streamed.trim() ? `${streamed.trim()}\n\n_(${errorMessage(error)})_` : errorMessage(error);
    });
    job.fail(error);
  } finally {
    entry.current = undefined;
  }
}

export function sendChat(threadId: string, text: string): void {
  const thread = find(threadId);
  if (!thread) throw new Error('Conversation not found.');
  if (thread.messages.some((m) => m.pending)) throw new Error('The coach is still replying.');
  const clean = text.trim();
  if (!clean) return;
  const now = nowIso();
  const user: ChatMessage = { id: uid('msg_'), role: 'user', text: clean, at: now };
  const reply: ChatMessage = { id: uid('msg_'), role: 'assistant', text: '', at: now, pending: true };
  store.mutate(() => {
    thread.messages.push(user, reply);
    thread.updatedAt = now;
    if (thread.title === 'New conversation') thread.title = truncate(clean, 48);
  });
  void runReply(threadId, reply, clean);
}

export function retryChat(threadId: string): void {
  const thread = find(threadId);
  const last = thread?.messages.at(-1);
  if (!thread || !last?.error) return;
  const lastUser = [...thread.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return;
  const reply: ChatMessage = { id: uid('msg_'), role: 'assistant', text: '', at: nowIso(), pending: true };
  store.mutate(() => {
    thread.messages.pop();
    thread.messages.push(reply);
  });
  void runReply(threadId, reply, lastUser.text);
}

export function removeThread(threadId: string): void {
  live.get(threadId)?.session.stop();
  live.delete(threadId);
  jobs.cancelFor(threadId);
  store.mutate((d) => {
    d.threads = d.threads.filter((t) => t.id !== threadId);
  });
}

export function shutdownChats(): void {
  for (const entry of live.values()) entry.session.stop();
  live.clear();
}
