// Mock interviews: a live Claude Code session role-plays the interviewer; the app controls pacing.
import type { StartInterviewInput } from '@shared/api';
import { trackStats } from '@shared/progress';
import type { AppData, ChatMessage, InterviewSession, InterviewStyle, Scorecard, Target } from '@shared/types';
import { conceptListText, learnerProfileText, weakConcepts } from '../agent/context';
import { interviewControl, interviewSystem, SCORECARD_DIMENSIONS, scorecardPrompt, SYSTEM } from '../agent/prompts';
import { LiveSession, mainModel, runAgent } from '../agent/runtime';
import { scorecardSchema } from '../agent/schemas';
import { addMinutes, awardXp, checkAchievements } from '../engine/gamification';
import { emit, toast } from '../events';
import { jobs } from '../jobs';
import { store } from '../store';
import { asString, asStringArray, clamp, errorMessage, nowIso, truncate, uid } from '../util';
import { announceAchievements, similarText } from './common';

const STYLE_LABEL: Record<InterviewStyle, string> = {
  technical: 'Technical',
  behavioral: 'Behavioral',
  system_design: 'System design',
  rapid_fire: 'Rapid fire',
  mixed: 'Mixed',
};

const VERDICT_LABEL: Record<Scorecard['verdict'], string> = {
  strong_hire: 'Strong hire',
  hire: 'Hire',
  lean_hire: 'Lean hire',
  lean_no_hire: 'Lean no hire',
  no_hire: 'No hire',
};

const live = new Map<string, LiveSession>();

function find(id: string): InterviewSession | undefined {
  return store.data.interviews.find((i) => i.id === id);
}

function companyContext(target: Target): string {
  const b = target.brief;
  if (!b) return `${target.role} at ${target.company}.`;
  return [
    `${target.role} at ${target.company}${target.seniority ? ` (${target.seniority})` : ''}.`,
    truncate(b.overview, 700),
    b.values.length ? `Values: ${b.values.map((v) => v.name).join(', ')}.` : '',
    b.techStack.length ? `Tech stack: ${b.techStack.slice(0, 15).join(', ')}.` : '',
    b.interviewProcess.length ? `Interview rounds: ${b.interviewProcess.map((s) => s.stage).join(' → ')}.` : '',
    b.mustHave.length ? `Must-have skills: ${b.mustHave.join(', ')}.` : '',
    b.likelyQuestions.length ? `Questions they are likely to ask:\n${b.likelyQuestions.slice(0, 10).map((q) => `- (${q.category}) ${q.question}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function systemFor(d: AppData, s: InterviewSession): string {
  const track = d.tracks.find((t) => t.id === s.trackId);
  const target = d.targets.find((t) => t.id === s.targetId);
  const subject = target ? `${target.role} at ${target.company}` : track ? `${track.title} (${track.subject})` : 'software engineering';
  const progress = track ? (() => {
    const st = trackStats(track, d.topicProgress, d.trackProgress);
    return `Progress in ${track.title}: level ${st.currentLevel}/${track.levels.length}, average mastery ${st.avgMastery}/100.`;
  })() : '';
  return interviewSystem({
    persona: s.persona,
    style: s.style,
    difficulty: s.difficulty,
    subject,
    candidate: [learnerProfileText(d), progress].filter(Boolean).join('\n'),
    weak: conceptListText(weakConcepts(d, s.trackId ? { trackId: s.trackId } : {}, 6), false),
    company: target ? companyContext(target) : undefined,
    focus: s.focus,
    total: s.questionCount,
  });
}

function getLive(s: InterviewSession): LiveSession {
  let session = live.get(s.id);
  if (!session) {
    session = new LiveSession({
      system: systemFor(store.data, s),
      model: s.model,
      effort: 'medium',
      resume: s.claudeSessionId,
      maxTurns: 4,
    });
    live.set(s.id, session);
  }
  return session;
}

export function stripMarkers(text: string): string {
  return text.replace(/\[\[(Q|FOLLOWUP|END)[^\]]*\]\]/g, '').replace(/^\s+/, '').trim();
}

async function runTurn(id: string, content: string): Promise<void> {
  const s = find(id);
  if (!s) return;
  const msg: ChatMessage = { id: uid('msg_'), role: 'assistant', text: '', at: nowIso(), pending: true };
  store.mutate(() => {
    s.messages.push(msg);
  });
  const job = jobs.start('interview', 'The interviewer is responding', { refId: id, model: s.model, background: true });
  let streamed = '';
  const session = getLive(s);
  try {
    const out = await session.send(content, job, {
      onText: (delta) => {
        streamed += delta;
        emit('chatDelta', { scope: 'interview', id, messageId: msg.id, delta });
      },
    });
    const raw = out.text || streamed;
    const head = raw.slice(0, 40);
    const isQuestion = head.includes('[[Q');
    const isFollowUp = head.includes('[[FOLLOWUP');
    const ended = raw.includes('[[END]]');
    store.mutate(() => {
      msg.text = stripMarkers(raw) || '…';
      msg.pending = false;
      if (isQuestion) {
        s.asked += 1;
        msg.questionNumber = s.asked;
      } else if (isFollowUp) {
        msg.followUp = true;
      }
      s.claudeSessionId = session.sessionId ?? s.claudeSessionId;
    });
    job.done();
    if (ended) void finishInterview(id);
  } catch (error) {
    store.mutate(() => {
      msg.pending = false;
      msg.error = true;
      msg.text = streamed ? stripMarkers(streamed) : errorMessage(error);
    });
    job.fail(error);
  }
}

export function startInterview(input: StartInterviewInput): string {
  const d = store.data;
  const target = input.targetId ? d.targets.find((t) => t.id === input.targetId) : undefined;
  const track = d.tracks.find((t) => t.id === (input.trackId ?? target?.trackId));
  if (!track && !target) throw new Error('Pick a track or a company target for the interview.');
  const total = clamp(Math.round(input.questionCount || 6), 3, 15);
  const session: InterviewSession = {
    id: uid('int_'),
    title: `${target ? target.company : track?.title} · ${STYLE_LABEL[input.style]}`,
    trackId: track?.id,
    targetId: target?.id,
    style: input.style,
    difficulty: input.difficulty,
    persona: input.persona,
    questionCount: total,
    asked: 0,
    focus: input.focus?.trim() || undefined,
    messages: [],
    status: 'active',
    model: mainModel(),
    startedAt: nowIso(),
  };
  store.mutate((data) => {
    data.interviews.unshift(session);
    if (data.interviews.length > 60) data.interviews.length = 60;
  });
  void runTurn(session.id, interviewControl({ asked: 0, total, lastWasFollowUp: false, start: true }));
  return session.id;
}

export function sendAnswer(id: string, text: string): void {
  const s = find(id);
  if (!s || s.status !== 'active') throw new Error('This interview has ended.');
  if (s.messages.some((m) => m.pending)) throw new Error('Wait for the interviewer to finish speaking.');
  const clean = text.trim();
  if (!clean) return;
  store.mutate(() => {
    s.messages.push({ id: uid('msg_'), role: 'user', text: clean, at: nowIso() });
  });
  const lastAssistant = [...s.messages].reverse().find((m) => m.role === 'assistant' && !m.error);
  const answers = s.messages.filter((m) => m.role === 'user').length;
  // Safety net if the interviewer forgets its markers: never let it run far past the plan.
  const control =
    answers >= s.questionCount * 2 + 1
      ? '<interview_control>Wrap up the interview now and end with [[END]].</interview_control>'
      : interviewControl({ asked: s.asked, total: s.questionCount, lastWasFollowUp: !!lastAssistant?.followUp });
  void runTurn(id, `${clean}\n\n${control}`);
}

/** Retry the last failed interviewer turn. */
export function retryTurn(id: string): void {
  const s = find(id);
  if (!s || s.status !== 'active') return;
  const last = s.messages.at(-1);
  if (!last?.error) return;
  store.mutate(() => {
    s.messages.pop();
  });
  const lastUser = [...s.messages].reverse().find((m) => m.role === 'user');
  const lastAssistant = [...s.messages].reverse().find((m) => m.role === 'assistant' && !m.error);
  const content = lastUser
    ? `${lastUser.text}\n\n${interviewControl({ asked: s.asked, total: s.questionCount, lastWasFollowUp: !!lastAssistant?.followUp })}`
    : interviewControl({ asked: 0, total: s.questionCount, lastWasFollowUp: false, start: true });
  void runTurn(id, content);
}

function normalizeScorecard(raw: Partial<Scorecard> | undefined): Scorecard {
  const r = raw ?? {};
  const verdicts: Scorecard['verdict'][] = ['strong_hire', 'hire', 'lean_hire', 'lean_no_hire', 'no_hire'];
  return {
    overall: clamp(Math.round(Number(r.overall) || 0), 0, 100),
    verdict: verdicts.includes(r.verdict as Scorecard['verdict']) ? (r.verdict as Scorecard['verdict']) : 'lean_no_hire',
    summary: asString(r.summary),
    dimensions: (Array.isArray(r.dimensions) ? r.dimensions : [])
      .map((x) => ({ name: asString(x?.name), score: clamp(Math.round(Number(x?.score) || 1), 1, 5), comment: asString(x?.comment) }))
      .filter((x) => x.name),
    questions: (Array.isArray(r.questions) ? r.questions : [])
      .map((x) => ({
        question: asString(x?.question),
        score: clamp(Math.round(Number(x?.score) || 1), 1, 5),
        feedback: asString(x?.feedback),
        idealAnswer: asString(x?.idealAnswer),
      }))
      .filter((x) => x.question),
    strengths: asStringArray(r.strengths, 6),
    improvements: asStringArray(r.improvements, 6),
    focusTopics: asStringArray(r.focusTopics, 6),
  };
}

export async function finishInterview(id: string): Promise<void> {
  const s = find(id);
  if (!s || s.status === 'scoring' || s.status === 'completed') return;
  live.get(id)?.stop();
  live.delete(id);
  jobs.cancelFor(id);
  const answered = s.messages.filter((m) => m.role === 'user').length;
  if (answered === 0) {
    store.mutate((d) => {
      d.interviews = d.interviews.filter((i) => i.id !== id);
    });
    return;
  }
  store.mutate(() => {
    s.status = 'scoring';
    s.endedAt = nowIso();
    for (const m of s.messages) if (m.pending) m.pending = false;
  });
  const d = store.data;
  const model = mainModel();
  const job = jobs.start('scorecard', 'Scoring your interview', { refId: id, model, background: true });
  try {
    const track = d.tracks.find((t) => t.id === s.trackId);
    const target = d.targets.find((t) => t.id === s.targetId);
    const transcript = s.messages
      .filter((m) => !m.error && m.text)
      .map((m) => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.text}`)
      .join('\n\n');
    const setup = [
      `Style: ${STYLE_LABEL[s.style]}; difficulty: ${s.difficulty}; interviewer persona: ${s.persona}.`,
      target ? `Role: ${target.role} at ${target.company}${target.seniority ? ` (${target.seniority})` : ''}.` : '',
      track ? `Subject: ${track.title}.` : '',
      `Candidate: ${d.profile.experienceYears} years of experience; target role ${d.profile.targetRole || 'not specified'}.`,
      `Planned main questions: ${s.questionCount}; asked: ${s.asked}.`,
    ]
      .filter(Boolean)
      .join('\n');
    const out = await runAgent<Scorecard>({
      job,
      system: SYSTEM.scorecard,
      prompt: scorecardPrompt({ setup, transcript, dimensions: SCORECARD_DIMENSIONS[s.style] }),
      model,
      effort: 'high',
      schema: scorecardSchema,
      maxTurns: 3,
    });
    const card = normalizeScorecard(out.data);
    let unlocked: string[] = [];
    store.mutate((data) => {
      s.scorecard = card;
      s.status = 'completed';
      s.error = undefined;
      s.xp = 30 + Math.round(card.overall / 4);
      awardXp(data, s.xp);
      data.stats.interviewsCompleted += 1;
      addMinutes(data, Math.min(90 * 60_000, Date.parse(s.endedAt ?? nowIso()) - Date.parse(s.startedAt)));
      const add = (kind: 'strength' | 'weakness', text: string) => {
        if (!text || data.notes.some((n) => similarText(n.text, text))) return;
        data.notes.push({ id: uid('note_'), kind, text: truncate(`Mock interview: ${text}`, 300), trackId: s.trackId, source: 'interview', createdAt: nowIso() });
      };
      card.improvements.slice(0, 2).forEach((t) => add('weakness', t));
      if (card.strengths[0]) add('strength', card.strengths[0]);
      unlocked = checkAchievements(data);
    });
    job.done();
    announceAchievements(unlocked);
    toast({ kind: 'success', title: 'Interview scored', body: `Overall ${card.overall}/100 · ${VERDICT_LABEL[card.verdict]}` });
  } catch (error) {
    store.mutate(() => {
      s.status = 'error';
      s.error = errorMessage(error);
    });
    job.fail(error);
    toast({ kind: 'error', title: "Couldn't score the interview", body: errorMessage(error) });
  }
}

export function removeInterview(id: string): void {
  live.get(id)?.stop();
  live.delete(id);
  jobs.cancelFor(id);
  store.mutate((d) => {
    d.interviews = d.interviews.filter((i) => i.id !== id);
  });
}

export function shutdownInterviews(): void {
  for (const session of live.values()) session.stop();
  live.clear();
}
