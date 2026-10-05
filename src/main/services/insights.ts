// Weekly-style progress insight written by the coach from the learner's data.
import { addDays, dayKey, findTopic, trackStats } from '@shared/progress';
import type { AppData, Insight } from '@shared/types';
import { daysUntil, learnerProfileText, notesText } from '../agent/context';
import { insightPrompt, SYSTEM } from '../agent/prompts';
import { mainModel, runAgent } from '../agent/runtime';
import { insightSchema } from '../agent/schemas';
import { toast } from '../events';
import { jobs } from '../jobs';
import { store } from '../store';
import { asString, asStringArray, clamp, errorMessage, nowIso, uid } from '../util';

function insightData(d: AppData): string {
  const s = d.stats;
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(dayKey(), -13 + i);
    return `${day.slice(5)}:${s.xpByDay[day] ?? 0}`;
  }).join(' ');
  const topics = Object.values(d.topicProgress)
    .filter((p) => p.attempts > 0)
    .map((p) => {
      const track = d.tracks.find((t) => t.id === p.trackId);
      const title = track ? findTopic(track, p.topicId)?.topic.title : undefined;
      return { title: `${title ?? 'Topic'} (${track?.title ?? ''})`, mastery: Math.round(p.mastery), last: p.lastPracticedAt?.slice(0, 10) };
    })
    .sort((a, b) => b.mastery - a.mastery);
  const lessons = Object.values(d.lessons)
    .filter((l) => l.status === 'completed' && l.result)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 10)
    .map((l) => `- ${l.completedAt?.slice(0, 10)} ${l.title}: ${Math.round((l.result?.score ?? 0) * 100)}%`);
  const tracks = d.tracks
    .filter((t) => t.status === 'ready')
    .map((t) => {
      const st = trackStats(t, d.topicProgress, d.trackProgress);
      return `- ${t.title}: level ${st.currentLevel}/${t.levels.length}, ${st.completedTopics}/${st.totalTopics} topics, avg mastery ${st.avgMastery}`;
    });
  return [
    `Profile:\n${learnerProfileText(d)}`,
    `Streak: ${s.streak.current} days (longest ${s.streak.longest}). Total XP: ${s.xp}. Daily goal: ${d.settings.dailyGoalXp} XP.`,
    `XP last 14 days: ${last14}`,
    `Lessons completed: ${s.lessonsCompleted}. Questions answered: ${s.questionsAnswered}. Accuracy: ${s.questionsAnswered ? Math.round((s.correctAnswers / s.questionsAnswered) * 100) : 0}%.`,
    `Tracks:\n${tracks.join('\n') || '- none'}`,
    `Strongest topics: ${topics.slice(0, 5).map((t) => `${t.title} ${t.mastery}`).join('; ') || 'none'}`,
    `Weakest topics: ${topics.slice(-5).reverse().map((t) => `${t.title} ${t.mastery} (last practised ${t.last})`).join('; ') || 'none'}`,
    `Recent lessons:\n${lessons.join('\n') || '- none'}`,
    `Mock interviews:\n${d.interviews.filter((i) => i.scorecard).slice(0, 5).map((i) => `- ${i.title}: ${i.scorecard?.overall}/100`).join('\n') || '- none'}`,
    `Company targets:\n${d.targets.map((t) => `- ${t.role} at ${t.company}${t.interviewDate ? `, interview in ${daysUntil(t)} days` : ''}`).join('\n') || '- none'}`,
    `Coach notes:\n${notesText(d, { limit: 12 })}`,
  ].join('\n\n');
}

export async function generateInsight(): Promise<void> {
  if (jobs.isRunning('insight', 'insight')) return;
  const model = mainModel();
  const job = jobs.start('insight', 'Analysing your progress', { refId: 'insight', model });
  try {
    const out = await runAgent<Omit<Insight, 'id' | 'createdAt'>>({
      job,
      system: SYSTEM.insight,
      prompt: insightPrompt(insightData(store.data)),
      model,
      effort: 'medium',
      schema: insightSchema,
      maxTurns: 3,
    });
    const r = out.data;
    const insight: Insight = {
      id: uid('ins_'),
      createdAt: nowIso(),
      headline: asString(r?.headline) || 'Your progress',
      summary: asString(r?.summary),
      wins: asStringArray(r?.wins, 5),
      risks: asStringArray(r?.risks, 5),
      plan: (Array.isArray(r?.plan) ? r.plan : [])
        .map((p) => ({ when: asString(p?.when), focus: asString(p?.focus) }))
        .filter((p) => p.focus)
        .slice(0, 8),
      readiness: (Array.isArray(r?.readiness) ? r.readiness : [])
        .map((x) => ({ area: asString(x?.area), score: clamp(Math.round(Number(x?.score) || 0), 0, 100), comment: asString(x?.comment) }))
        .filter((x) => x.area)
        .slice(0, 8),
    };
    store.mutate((d) => {
      d.insights.unshift(insight);
      d.insights = d.insights.slice(0, 10);
    });
    job.done();
    toast({ kind: 'success', title: 'Your progress report is ready', body: insight.headline });
  } catch (error) {
    job.fail(error);
    toast({ kind: 'error', title: "Couldn't write your progress report", body: errorMessage(error) });
  }
}
