// In-process MCP server that lets the coach agent read and update the learner model.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { addDays, dayKey, findTopic } from '@shared/progress';
import type { CoachAction, NoteKind } from '@shared/types';
import { store } from '../store';
import { nowIso, truncate, uid } from '../util';
import { profileDump, recentMistakes } from './context';

export interface CoachToolContext {
  source: 'chat' | 'interview';
  /** Attach a one-click practice card to the reply currently being written. */
  attachAction?: (action: CoachAction) => void;
}

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }],
});

export const COACH_TOOL_NAMES = [
  'mcp__coach__get_learner_profile',
  'mcp__coach__get_topic_mastery',
  'mcp__coach__get_recent_mistakes',
  'mcp__coach__record_coach_note',
  'mcp__coach__suggest_practice',
  'mcp__coach__schedule_review',
];

export function createCoachServer(ctx: CoachToolContext) {
  return createSdkMcpServer({
    name: 'coach',
    version: '1.0.0',
    instructions: 'Tools for reading and updating the learner model inside the Ascend interview-prep app.',
    tools: [
      tool(
        'get_learner_profile',
        'Full learner profile: goals, tracks with levels and per-topic mastery, weak and strong concepts, coach notes, company targets and recent mock interviews.',
        {},
        async () => text(profileDump(store.data)),
      ),
      tool(
        'get_topic_mastery',
        'Detailed mastery for topics whose title or concepts match a search term: concept strengths and the latest answers.',
        { query: z.string().describe('Topic or concept to look up, e.g. "transactions" or "RAG"') },
        async ({ query }) => {
          const d = store.data;
          const q = query.toLowerCase();
          const matches: unknown[] = [];
          for (const track of d.tracks) {
            for (const level of track.levels) {
              for (const topic of level.topics) {
                const hit =
                  topic.title.toLowerCase().includes(q) ||
                  topic.concepts.some((c) => c.toLowerCase().includes(q)) ||
                  topic.summary.toLowerCase().includes(q);
                if (!hit) continue;
                const p = d.topicProgress[topic.id];
                const answers = d.attempts
                  .filter((a) => a.topicId === topic.id)
                  .slice(-6)
                  .map((a) => ({ correct: a.correct, question: truncate(a.prompt, 120), answer: truncate(a.userAnswerText, 80) }));
                matches.push({
                  track: track.title,
                  level: level.number,
                  topicId: topic.id,
                  topic: topic.title,
                  mastery: p ? Math.round(p.mastery) : null,
                  completed: !!p?.completed,
                  nextReview: p?.srs.due ?? null,
                  concepts: p ? Object.fromEntries(Object.entries(p.concepts).map(([c, s]) => [c, Math.round(s.strength)])) : {},
                  recentAnswers: answers,
                });
                if (matches.length >= 6) return text(matches);
              }
            }
          }
          return text(matches.length ? matches : `No topics match "${query}".`);
        },
      ),
      tool(
        'get_recent_mistakes',
        'Questions the learner recently answered incorrectly, with their answer and the correct one.',
        { limit: z.number().int().min(1).max(20).optional().describe('How many (default 8)') },
        async ({ limit }) =>
          text(
            recentMistakes(store.data, {}, limit ?? 8).map((a) => ({
              topicId: a.topicId,
              concepts: a.concepts,
              question: truncate(a.prompt, 160),
              learnerAnswer: truncate(a.userAnswerText, 120),
              correctAnswer: truncate(a.correctAnswerText, 120),
              when: a.at,
            })),
          ),
      ),
      tool(
        'record_coach_note',
        'Save a durable observation about the learner so future lessons, reviews and interviews adapt to it.',
        {
          kind: z.enum(['strength', 'weakness', 'insight', 'plan']),
          text: z.string().min(3).max(300).describe('The observation, one or two sentences'),
        },
        async ({ kind, text: note }) => {
          store.mutate((d) => {
            d.notes.push({ id: uid('note_'), kind: kind as NoteKind, text: note, source: ctx.source, createdAt: nowIso() });
          });
          return text('Saved to the learner profile.');
        },
      ),
      tool(
        'suggest_practice',
        'Show the learner a one-click practice card in the chat. Starting it generates a short primer and adaptive questions on the given focus.',
        {
          title: z.string().max(60).describe('Short session title'),
          focus: z.string().max(400).describe('Exactly what to drill: concepts, scenarios, misconceptions'),
          trackTitle: z.string().optional().describe('Which track this belongs to (defaults to the active track)'),
        },
        async ({ title, focus, trackTitle }) => {
          const d = store.data;
          const track =
            d.tracks.find((t) => trackTitle && t.title.toLowerCase().includes(trackTitle.toLowerCase())) ??
            d.tracks.find((t) => t.id === d.profile.activeTrackId) ??
            d.tracks[0];
          if (!track) return text('The learner has no tracks yet, so a practice card cannot be created.');
          ctx.attachAction?.({ id: uid('act_'), kind: 'practice', title, focus, trackId: track.id });
          return text(`A practice card "${title}" is now shown under your reply. Mention it briefly.`);
        },
      ),
      tool(
        'schedule_review',
        'Schedule a spaced-repetition review for a topic after N days (0 = today).',
        {
          topicId: z.string().describe('Topic id from get_learner_profile or get_topic_mastery'),
          inDays: z.number().int().min(0).max(60),
        },
        async ({ topicId, inDays }) => {
          const d = store.data;
          const track = d.tracks.find((t) => findTopic(t, topicId));
          if (!track) return text(`Unknown topic id ${topicId}.`);
          store.mutate((data) => {
            const p = data.topicProgress[topicId];
            if (p) p.srs.due = addDays(dayKey(), inDays);
          });
          return text(d.topicProgress[topicId] ? `Review scheduled for ${addDays(dayKey(), inDays)}.` : 'That topic has not been studied yet, so there is nothing to review.');
        },
      ),
    ],
  });
}
