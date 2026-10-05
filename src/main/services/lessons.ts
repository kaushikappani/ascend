// Lessons: just-in-time generation (primer + adaptive questions), grading, completion and debriefs.
import type { AnswerInput, StartLessonInput } from '@shared/api';
import { CHECKPOINT_PASS_SCORE, PASS_SCORE } from '@shared/constants';
import { currentLevelNumber, dayKey, findTopic, nextTopic } from '@shared/progress';
import type {
  AnswerResult,
  AppData,
  Attempt,
  Lesson,
  LessonKind,
  LessonResult,
  Level,
  PrimerDepth,
  Question,
  QuestionType,
  Source,
  Topic,
  Track,
} from '@shared/types';
import {
  activeTarget,
  askedBefore,
  conceptListText,
  learnerProfileText,
  levelLabel,
  mistakesText,
  notesText,
  recentMistakes,
  strongConcepts,
  targetSummaryText,
  topicLearnerText,
  weakConcepts,
} from '../agent/context';
import { debriefPrompt, gradePrompt, primerPrompt, questionsPrompt, SYSTEM } from '../agent/prompts';
import { AgentError, fastModel, mainModel, runAgent, warmStart, type WarmHandle } from '../agent/runtime';
import {
  debriefSchema,
  gradeSchema,
  questionsSchema,
  type DebriefOutput,
  type GradeOutput,
  type RawQuestion,
} from '../agent/schemas';
import { checkAchievements, addMinutes, awardXp, xpForAnswer } from '../engine/gamification';
import { answerText, correctAnswerText, gradeObjective, heuristicShortAnswer } from '../engine/grading';
import { applyAnswer, applyLessonOutcome, ensureTopicProgress, scheduleSrs } from '../engine/mastery';
import { centerDifficulty, questionPlan } from '../engine/planner';
import { emit, toast } from '../events';
import { jobs } from '../jobs';
import { store } from '../store';
import { asString, asStringArray, avg, clamp, errorMessage, nowIso, shuffle, truncate, uid } from '../util';
import { announceAchievements, similarText } from './common';

const KIND_LABEL: Record<LessonKind, string> = {
  lesson: 'Lesson',
  review: 'Smart review',
  checkpoint: 'Level checkpoint',
  weakspots: 'Weak spots drill',
  mistakes: 'Fix my mistakes',
  custom: 'Custom practice',
  rapid: 'Rapid fire',
};

const PREFETCH_TTL_MS = 14 * 86_400_000;

interface ScopedTopic {
  level: Level;
  topic: Topic;
}

interface LessonScope {
  track: Track;
  topics: ScopedTopic[];
  primary?: ScopedTopic;
  reviewTopics: ScopedTopic[];
  concepts: string[];
  mistakes: Attempt[];
}

function getTrack(d: AppData, trackId: string): Track {
  const track = d.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error('That track no longer exists.');
  return track;
}

function allTopics(track: Track): ScopedTopic[] {
  return track.levels.flatMap((level) => level.topics.map((topic) => ({ level, topic })));
}

function dueTopics(d: AppData, track: Track, limit: number): ScopedTopic[] {
  const today = dayKey();
  const items = allTopics(track)
    .map((st) => ({ st, p: d.topicProgress[st.topic.id] }))
    .filter(({ p }) => p?.completed);
  const due = items.filter(({ p }) => p?.srs.due && p.srs.due <= today).sort((a, b) => (a.p?.srs.due ?? '').localeCompare(b.p?.srs.due ?? ''));
  const pool = due.length ? due : items.sort((a, b) => (a.p?.mastery ?? 0) - (b.p?.mastery ?? 0));
  return pool.slice(0, limit).map(({ st }) => st);
}

function resolveScope(d: AppData, lesson: Lesson): LessonScope {
  const track = getTrack(d, lesson.trackId);
  const topics = allTopics(track);
  const byId = (id: string) => topics.find((t) => t.topic.id === id);
  const scope: LessonScope = { track, topics: [], reviewTopics: [], concepts: [], mistakes: [] };
  switch (lesson.kind) {
    case 'lesson': {
      const primary = lesson.topicId ? byId(lesson.topicId) : undefined;
      if (!primary) throw new Error('That topic no longer exists.');
      scope.primary = primary;
      scope.topics = [primary];
      scope.concepts = primary.topic.concepts;
      // Interleave earlier topics the learner is shaky on.
      scope.reviewTopics = topics
        .filter((t) => t.topic.id !== primary.topic.id)
        .map((t) => ({ t, p: d.topicProgress[t.topic.id] }))
        .filter(({ p }) => p && p.attempts > 0 && p.mastery < 60)
        .sort((a, b) => (a.p?.mastery ?? 0) - (b.p?.mastery ?? 0))
        .slice(0, 2)
        .map(({ t }) => t);
      scope.mistakes = recentMistakes(d, { topicIds: [primary.topic.id] }, 5);
      break;
    }
    case 'checkpoint': {
      const level = track.levels.find((l) => l.number === lesson.level);
      if (!level) throw new Error('That level no longer exists.');
      scope.topics = level.topics.map((topic) => ({ level, topic }));
      scope.concepts = level.topics.flatMap((t) => t.concepts);
      break;
    }
    case 'review': {
      scope.topics = dueTopics(d, track, 4);
      scope.concepts = scope.topics.flatMap((t) => t.topic.concepts);
      scope.mistakes = recentMistakes(d, { topicIds: scope.topics.map((t) => t.topic.id) }, 5);
      break;
    }
    case 'weakspots': {
      const weak = weakConcepts(d, { trackId: track.id }, 5);
      const ids = [...new Set(weak.map((w) => w.topicId))];
      scope.topics = ids.map(byId).filter((t): t is ScopedTopic => !!t);
      scope.concepts = weak.map((w) => w.concept);
      scope.mistakes = recentMistakes(d, { topicIds: ids }, 6);
      break;
    }
    case 'mistakes': {
      const src = (lesson.sourceAttemptIds ?? [])
        .map((id) => d.attempts.find((a) => a.id === id))
        .filter((a): a is Attempt => !!a);
      scope.mistakes = src;
      const ids = [...new Set(src.map((a) => a.topicId).filter((id): id is string => !!id))];
      scope.topics = ids.map(byId).filter((t): t is ScopedTopic => !!t);
      scope.concepts = [...new Set(src.flatMap((a) => a.concepts))];
      break;
    }
    case 'custom': {
      scope.topics = topics;
      scope.concepts = [];
      break;
    }
    case 'rapid': {
      const done = topics.filter((t) => d.topicProgress[t.topic.id]?.completed);
      scope.topics = shuffle(done.length >= 2 ? done : topics.filter((t) => t.level.number <= Math.max(1, track.startLevel))).slice(0, 8);
      scope.concepts = scope.topics.flatMap((t) => t.topic.concepts);
      break;
    }
  }
  if (!scope.topics.length) throw new Error('There is nothing to practise here yet — complete a lesson first.');
  return scope;
}

function questionCount(d: AppData, kind: LessonKind): number {
  if (kind === 'checkpoint') return Math.max(10, d.settings.lessonLength);
  if (kind === 'rapid') return 10;
  return clamp(d.settings.lessonLength, 4, 15);
}

function primerDepthFor(d: AppData, kind: LessonKind): PrimerDepth {
  const setting = d.settings.primer;
  if (setting === 'off') return 'off';
  if (kind === 'lesson' || kind === 'custom') return setting;
  if (kind === 'weakspots' || kind === 'mistakes') return 'brief';
  return 'off';
}

function lessonTitle(d: AppData, input: StartLessonInput, track: Track): { title: string; subtitle: string } {
  const noun = track.kind === 'target' ? 'Stage' : 'Level';
  if (input.kind === 'lesson' && input.topicId) {
    const found = findTopic(track, input.topicId);
    return { title: found?.topic.title ?? 'Lesson', subtitle: `${noun} ${found?.level.number ?? ''} · ${track.title}` };
  }
  if (input.kind === 'checkpoint') {
    const level = track.levels.find((l) => l.number === input.level);
    return { title: `${noun} ${input.level} checkpoint`, subtitle: level ? `${level.title} · ${track.title}` : track.title };
  }
  if (input.kind === 'custom') return { title: input.title || truncate(input.focus ?? 'Custom practice', 60), subtitle: `Custom practice · ${track.title}` };
  if (input.kind === 'weakspots') {
    const weak = weakConcepts(d, { trackId: track.id }, 3).map((w) => w.concept);
    return { title: 'Weak spots drill', subtitle: weak.length ? weak.join(' · ') : track.title };
  }
  return { title: KIND_LABEL[input.kind], subtitle: track.title };
}

function createLessonShell(d: AppData, input: StartLessonInput, track: Track): Lesson {
  const { title, subtitle } = lessonTitle(d, input, track);
  const depth = primerDepthFor(d, input.kind);
  const lesson: Lesson = {
    id: uid('les_'),
    kind: input.kind,
    trackId: track.id,
    topicId: input.kind === 'lesson' ? input.topicId : undefined,
    level: input.kind === 'lesson' && input.topicId ? findTopic(track, input.topicId)?.level.number : input.level,
    title,
    subtitle,
    focus: input.focus,
    primerStatus: depth === 'off' ? 'none' : 'pending',
    questions: [],
    questionsStatus: 'pending',
    status: 'generating',
    model: mainModel(),
    createdAt: nowIso(),
    answers: {},
  };
  if (input.kind === 'mistakes') {
    const src = recentMistakes(d, { trackId: track.id }, 8).filter((a) => a.question);
    if (!src.length) throw new Error('No mistakes to fix in this track — nice work!');
    lesson.sourceAttemptIds = src.map((a) => a.id);
    lesson.focus = `Misconceptions to fix: ${[...new Set(src.flatMap((a) => a.concepts))].slice(0, 8).join(', ')}`;
  }
  if (input.kind === 'weakspots') {
    const weak = weakConcepts(d, { trackId: track.id }, 5);
    if (!weak.length) throw new Error('No weak spots detected yet. Complete a few lessons first.');
    lesson.focus = `Weakest concepts: ${weak.map((w) => w.concept).join(', ')}`;
  }
  return lesson;
}

function emitLesson(lesson: Lesson): void {
  emit('lesson', lesson);
}

function updateLesson(lessonId: string, fn: (lesson: Lesson) => void): Lesson | undefined {
  const lesson = store.data.lessons[lessonId];
  if (!lesson) return undefined;
  store.mutate(() => fn(lesson));
  emitLesson(lesson);
  return lesson;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function extractSources(markdown: string): Source[] {
  const idx = markdown.search(/^##\s+Sources/im);
  if (idx < 0) return [];
  const out: Source[] = [];
  for (const m of markdown.slice(idx).matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) out.push({ title: m[1], url: m[2] });
  return out.slice(0, 8);
}

function cleanPrimer(text: string): string {
  return text
    .trim()
    .replace(/^#\s+[^\n]*\n+/, '')
    .trim();
}

async function generatePrimer(lessonId: string, scope: LessonScope): Promise<void> {
  const d = store.data;
  const lesson = d.lessons[lessonId];
  if (!lesson) return;
  const depth = primerDepthFor(d, lesson.kind);
  if (depth === 'off') return;
  const model = mainModel();
  const job = jobs.start('primer', `Writing your primer: ${lesson.title}`, { refId: lessonId, model, background: !!lesson.prefetched });
  updateLesson(lessonId, (l) => {
    l.primerStatus = 'streaming';
    l.primer = '';
  });
  let buffer = '';
  const topicIds = scope.topics.map((t) => t.topic.id);
  const focusConcepts = lesson.kind === 'weakspots' || lesson.kind === 'mistakes' ? scope.concepts.slice(0, 8) : scope.concepts;
  try {
    const out = await runAgent({
      job,
      system: SYSTEM.primer,
      prompt: primerPrompt({
        track: scope.track,
        level: scope.primary?.level,
        topic: scope.primary?.topic,
        focus: lesson.focus,
        concepts: focusConcepts.length ? focusConcepts : [lesson.focus ?? lesson.title],
        learner: learnerProfileText(d),
        topicLearner: scope.primary ? topicLearnerText(d, scope.primary.topic.id, scope.primary.topic.title) : '',
        weak: conceptListText(weakConcepts(d, { topicIds }, 6)),
        mistakes: scope.mistakes.length ? mistakesText(scope.mistakes) : undefined,
        depth,
        research: d.settings.research,
      }),
      model,
      effort: 'medium',
      web: d.settings.research !== 'off',
      maxTurns: 8,
      onText: (delta) => {
        buffer += delta;
        // Keep the partial text on the in-memory lesson (not persisted) so a
        // player opened mid-stream can catch up, then follow the deltas.
        const live = store.data.lessons[lessonId];
        if (live) live.primer = buffer;
        emit('primerDelta', { lessonId, delta });
      },
      onToolUse: () => {
        // Anything written before a tool call is preamble, not the primer.
        buffer = '';
        const live = store.data.lessons[lessonId];
        if (live) live.primer = '';
        emit('primerDelta', { lessonId, delta: '', reset: true });
      },
    });
    const finalText = cleanPrimer(out.text.length >= buffer.length * 0.8 ? out.text : buffer);
    updateLesson(lessonId, (l) => {
      l.primer = finalText;
      l.primerStatus = 'ready';
      l.sources = extractSources(finalText);
    });
    job.done();
  } catch (error) {
    updateLesson(lessonId, (l) => {
      l.primer = buffer ? cleanPrimer(buffer) : undefined;
      l.primerStatus = buffer.length > 400 ? 'ready' : 'error';
      if (l.primerStatus === 'error') l.error = errorMessage(error);
    });
    job.fail(error);
  }
}

function hasCatchAllOption(options: string[]): boolean {
  return options.some((o) => /\b(all|none|both) of the above\b|^both\b|^neither\b/i.test(o));
}

function shuffleOptions(options: string[], correct: number[], feedback?: string[]) {
  const aligned = feedback && feedback.length === options.length ? feedback : undefined;
  if (hasCatchAllOption(options)) return { options, correct, feedback: aligned };
  const order = shuffle(options.map((_, i) => i));
  return {
    options: order.map((i) => options[i]),
    correct: correct.map((c) => order.indexOf(c)),
    feedback: aligned ? order.map((i) => aligned[i]) : undefined,
  };
}

const BLANK_RE = /_{3,}/g;

/** Validate and repair model output; drop anything that can't be graded reliably. */
function normalizeQuestions(raw: RawQuestion[], allowedIds: string[], fallbackTopic: string): Question[] {
  const out: Question[] = [];
  for (const r of raw ?? []) {
    const type = r.type as QuestionType;
    const prompt = asString(r.prompt);
    if (!prompt) continue;
    const base: Question = {
      id: uid('q_'),
      type,
      prompt,
      code: asString(r.code) || undefined,
      codeLanguage: asString(r.codeLanguage) || undefined,
      explanation: asString(r.explanation) || 'Review the primer for this concept.',
      hint: asString(r.hint) || undefined,
      interviewTip: asString(r.interviewTip) || undefined,
      difficulty: clamp(Math.round(Number(r.difficulty) || 2), 1, 5) as Question['difficulty'],
      concepts: asStringArray(r.concepts, 4),
      topicId: r.topicId && allowedIds.includes(r.topicId) ? r.topicId : fallbackTopic,
    };
    if (!base.concepts.length) base.concepts = ['General'];
    switch (type) {
      case 'mcq': {
        const options = asStringArray(r.options, 6);
        const ci = Number(r.correctIndex);
        if (options.length < 2 || !Number.isInteger(ci) || ci < 0 || ci >= options.length) continue;
        const s = shuffleOptions(options, [ci], asStringArray(r.optionFeedback, 6));
        out.push({ ...base, options: s.options, correctIndex: s.correct[0], optionFeedback: s.feedback });
        break;
      }
      case 'multi_select': {
        const options = asStringArray(r.options, 6);
        const indices = [...new Set((r.correctIndices ?? []).map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < options.length);
        if (options.length < 3 || !indices.length) continue;
        const s = shuffleOptions(options, indices, asStringArray(r.optionFeedback, 6));
        out.push({ ...base, options: s.options, correctIndices: s.correct.sort(), optionFeedback: s.feedback });
        break;
      }
      case 'true_false': {
        if (typeof r.answer !== 'boolean') continue;
        out.push({ ...base, answer: r.answer });
        break;
      }
      case 'fill_blank': {
        const promptText = prompt.replace(BLANK_RE, '___');
        const code = base.code?.replace(BLANK_RE, '___');
        const count = (promptText.match(/___/g)?.length ?? 0) + (code?.match(/___/g)?.length ?? 0);
        const blanks = (r.blanks ?? []).map((b) => asStringArray(b, 8)).filter((b) => b.length > 0);
        if (!count || blanks.length < count) continue;
        const trimmed = blanks.slice(0, count);
        let wordBank = asStringArray(r.wordBank, 10);
        for (const b of trimmed) if (!wordBank.some((w) => w.toLowerCase() === b[0].toLowerCase())) wordBank.push(b[0]);
        wordBank = [...new Map(wordBank.map((w) => [w.toLowerCase(), w])).values()];
        out.push({ ...base, prompt: promptText, code, blanks: trimmed, wordBank: wordBank.length > trimmed.length ? shuffle(wordBank) : undefined });
        break;
      }
      case 'short_answer': {
        const keyPoints = asStringArray(r.keyPoints, 6);
        const sampleAnswer = asString(r.sampleAnswer) || undefined;
        if (!keyPoints.length && !sampleAnswer) continue;
        out.push({ ...base, keyPoints, sampleAnswer });
        break;
      }
      case 'ordering': {
        const items = [...new Set(asStringArray(r.items, 8))];
        if (items.length < 3) continue;
        out.push({ ...base, items });
        break;
      }
      case 'match': {
        const pairs = (r.pairs ?? [])
          .map((p) => ({ left: asString(p?.left), right: asString(p?.right) }))
          .filter((p) => p.left && p.right);
        const unique = pairs.filter(
          (p, i) => pairs.findIndex((q) => q.left === p.left) === i && pairs.findIndex((q) => q.right === p.right) === i,
        );
        if (unique.length < 2) continue;
        out.push({ ...base, pairs: unique.slice(0, 6) });
        break;
      }
      default:
        continue;
    }
  }
  return out;
}

const KIND_NOTES: Partial<Record<LessonKind, (scope: LessonScope, lesson: Lesson) => string>> = {
  checkpoint: () =>
    'This is a level checkpoint: cover every topic in the level evenly and make it a fair test of the whole level. Leave out hints.',
  review: () =>
    'This is a spaced-repetition review of topics the learner already studied: focus on retrieving the most important ideas and on concepts they were weak on.',
  weakspots: (s) =>
    `This session drills the learner's weakest concepts: ${s.concepts.join(', ')}. Every question must target one of them, approaching it from a different angle each time.`,
  mistakes: () =>
    'This session revisits concepts the learner recently got wrong (see Recent mistakes). Write fresh questions on the same misconceptions — new scenarios, not rewordings.',
  rapid: () => 'Rapid-fire round: short prompts (under 25 words) that are quick to answer, with one-sentence explanations.',
  custom: (_s, l) =>
    `Custom practice requested by the learner: "${l.focus}". Every question must serve that focus. For topicId, choose the closest topic from the list.`,
  lesson: (s) =>
    s.reviewTopics.length
      ? 'Questions assigned to other topic ids are interleaved review questions on the learner\'s weak concepts from those earlier topics.'
      : '',
};

async function generateQuestions(lessonId: string, scope: LessonScope, usePrimer: boolean): Promise<void> {
  const d = store.data;
  const lesson = d.lessons[lessonId];
  if (!lesson) return;
  const model = mainModel();
  const job = jobs.start('questions', `Crafting questions: ${lesson.title}`, { refId: lessonId, model, background: !!lesson.prefetched });
  updateLesson(lessonId, (l) => {
    l.questionsStatus = 'pending';
    l.error = undefined;
  });
  try {
    const count = questionCount(d, lesson.kind);
    const inScope = [...scope.topics, ...scope.reviewTopics];
    const allowedIds = [...new Set(inScope.map((t) => t.topic.id))];
    const primaryProgress = scope.primary ? d.topicProgress[scope.primary.topic.id] : undefined;
    const levelNumber =
      scope.primary?.level.number ?? lesson.level ?? Math.round(avg(scope.topics.map((t) => t.level.number)) || 1);
    const scopeMastery = avg(scope.topics.map((t) => d.topicProgress[t.topic.id]?.mastery ?? 0));
    const scopeAttempts = scope.topics.reduce((s, t) => s + (d.topicProgress[t.topic.id]?.attempts ?? 0), 0);
    const center = centerDifficulty(
      levelNumber,
      scope.track.levels.length,
      primaryProgress?.mastery ?? scopeMastery,
      primaryProgress?.attempts ?? scopeAttempts,
    );
    const plan = questionPlan({
      kind: lesson.kind,
      count,
      enabled: d.settings.questionTypes,
      center,
      topicIds: lesson.kind === 'custom' ? [] : scope.topics.map((t) => t.topic.id),
      primaryTopicId: scope.primary?.topic.id,
      reviewTopicIds: scope.reviewTopics.map((t) => t.topic.id),
    });
    const topicsBlock =
      lesson.kind === 'custom'
        ? `Topics in this track (id: title):\n${scope.topics.map((t) => `- ${t.topic.id}: ${t.topic.title}`).join('\n')}`
        : inScope
            .map(
              (t) =>
                `Topic ${t.topic.id} (${scope.track.kind === 'target' ? 'stage' : 'level'} ${t.level.number}): ${t.topic.title} — ${t.topic.summary} Key concepts: ${t.topic.concepts.join('; ')}.`,
            )
            .join('\n');
    const target = activeTarget(d);
    const learnerBlock = [
      learnerProfileText(d),
      scope.primary ? topicLearnerText(d, scope.primary.topic.id, scope.primary.topic.title) : '',
      `Weak concepts: ${conceptListText(weakConcepts(d, { topicIds: allowedIds }, 8))}`,
      `Strong concepts: ${conceptListText(strongConcepts(d, { topicIds: allowedIds }, 6))}`,
      target ? `Active interview target (use it for realistic scenarios when natural): ${targetSummaryText(target).split('\n')[0]}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const out = await runAgent<{ questions: RawQuestion[] }>({
      job,
      system: SYSTEM.questions,
      prompt: questionsPrompt({
        track: scope.track,
        levelLine: scope.primary ? levelLabel(scope.track, scope.primary.level.number) : lesson.level ? levelLabel(scope.track, lesson.level) : `Session: ${lesson.title}`,
        topicsBlock,
        focus: lesson.focus,
        learnerBlock,
        mistakes: mistakesText(scope.mistakes),
        primer: usePrimer ? store.data.lessons[lessonId]?.primer : undefined,
        asked: askedBefore(d, allowedIds, 30),
        plan,
        kindNote: KIND_NOTES[lesson.kind]?.(scope, lesson),
      }),
      model,
      effort: 'high',
      schema: questionsSchema(allowedIds, count),
      web: d.settings.research === 'always',
      maxTurns: 8,
    });
    const fallbackTopic = scope.primary?.topic.id ?? allowedIds[0];
    const questions = normalizeQuestions(out.data?.questions ?? [], allowedIds, fallbackTopic);
    if (questions.length < Math.min(3, count)) throw new AgentError('Claude produced too few usable questions. Please retry.', 'format');
    updateLesson(lessonId, (l) => {
      l.questions = questions;
      l.questionsStatus = 'ready';
      if (l.status === 'generating') l.status = 'ready';
    });
    job.done();
  } catch (error) {
    updateLesson(lessonId, (l) => {
      l.questionsStatus = 'error';
      l.error = errorMessage(error);
    });
    job.fail(error);
  }
}

async function generateLesson(lessonId: string, mode: 'parallel' | 'sequential'): Promise<void> {
  const d = store.data;
  const lesson = d.lessons[lessonId];
  if (!lesson) return;
  let scope: LessonScope;
  try {
    scope = resolveScope(d, lesson);
  } catch (error) {
    updateLesson(lessonId, (l) => {
      l.questionsStatus = 'error';
      if (l.primerStatus !== 'none') l.primerStatus = 'error';
      l.error = errorMessage(error);
    });
    return;
  }
  const needPrimer = lesson.primerStatus !== 'none' && lesson.primerStatus !== 'ready';
  const needQuestions = lesson.questionsStatus !== 'ready';
  if (mode === 'sequential') {
    if (needPrimer) await generatePrimer(lessonId, scope);
    if (needQuestions) await generateQuestions(lessonId, scope, store.data.lessons[lessonId]?.primerStatus === 'ready');
  } else {
    const primerReady = lesson.primerStatus === 'ready';
    await Promise.all([needPrimer ? generatePrimer(lessonId, scope) : undefined, needQuestions ? generateQuestions(lessonId, scope, primerReady) : undefined]);
  }
}

/** The unfinished lesson on a topic to reopen instead of generating a new one: answered work first, then prepared content. */
function resumableLesson(d: AppData, trackId: string, topicId: string): Lesson | undefined {
  const rank = (l: Lesson) => (Object.keys(l.answers).length ? 0 : l.questionsStatus === 'ready' ? 1 : l.questionsStatus === 'error' ? 3 : 2);
  const recency = (l: Lesson) => l.startedAt ?? l.createdAt;
  return Object.values(d.lessons)
    .filter((l) => l.kind === 'lesson' && l.trackId === trackId && l.topicId === topicId && l.status !== 'completed' && l.status !== 'abandoned')
    .sort((a, b) => rank(a) - rank(b) || recency(b).localeCompare(recency(a)))[0];
}

/** Keep one unfinished lesson per topic: drop unused duplicates of `keep`. */
function dropDuplicates(d: AppData, keep: Lesson): void {
  for (const [id, l] of Object.entries(d.lessons)) {
    if (id === keep.id || l.kind !== 'lesson' || l.topicId !== keep.topicId || l.status === 'completed' || Object.keys(l.answers).length) continue;
    jobs.cancelFor(id);
    delete d.lessons[id];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getLesson(lessonId: string): Lesson | null {
  return store.data.lessons[lessonId] ?? null;
}

export function startLesson(input: StartLessonInput): string {
  const d = store.data;
  const track = getTrack(d, input.trackId);
  if (track.status !== 'ready') throw new Error('This track is still being designed.');
  if (input.kind === 'lesson' && input.topicId) {
    // Reopen the lesson already prepared (or part-done) for this topic rather than generating it again.
    const existing = resumableLesson(d, track.id, input.topicId);
    if (existing) {
      store.mutate((data) => {
        existing.prefetched = false;
        dropDuplicates(data, existing);
        if (track.kind !== 'target') data.profile.activeTrackId = track.id;
      });
      if (existing.primerStatus === 'error' || existing.questionsStatus === 'error') retryLesson(existing.id);
      else emitLesson(existing);
      return existing.id;
    }
  }
  const lesson = createLessonShell(d, input, track);
  store.mutate((data) => {
    data.lessons[lesson.id] = lesson;
    if (track.kind !== 'target') data.profile.activeTrackId = track.id;
  });
  void generateLesson(lesson.id, 'parallel');
  return lesson.id;
}

/** Generate the next lesson on a track in the background so it opens instantly. */
export function prefetchNext(trackId: string): void {
  const d = store.data;
  if (!d.settings.prefetch) return;
  const track = d.tracks.find((t) => t.id === trackId);
  if (!track || track.status !== 'ready') return;
  const next = nextTopic(track, d.topicProgress, d.trackProgress);
  if (!next) return;
  const lessons = Object.values(d.lessons);
  if (lessons.some((l) => l.prefetched && l.trackId === trackId && l.status === 'generating')) return;
  // Any unfinished lesson on this topic (prefetched or already open) makes a prefetch redundant.
  if (lessons.some((l) => l.kind === 'lesson' && l.topicId === next.topic.id && l.status !== 'completed' && l.status !== 'abandoned')) return;
  let lesson: Lesson;
  try {
    lesson = createLessonShell(d, { trackId, kind: 'lesson', topicId: next.topic.id }, track);
  } catch {
    return;
  }
  lesson.prefetched = true;
  store.mutate((data) => {
    data.lessons[lesson.id] = lesson;
  });
  void generateLesson(lesson.id, 'sequential');
}

/** Drop stale unused prefetches (e.g. the learner moved on). */
export function cleanupPrefetched(): void {
  const cutoff = Date.now() - PREFETCH_TTL_MS;
  store.mutate((d) => {
    for (const [id, l] of Object.entries(d.lessons)) {
      if (l.prefetched && !Object.keys(l.answers).length && Date.parse(l.createdAt) < cutoff) delete d.lessons[id];
    }
  });
}

export function beginLesson(lessonId: string): void {
  updateLesson(lessonId, (l) => {
    if (l.status === 'ready') l.status = 'in_progress';
    l.startedAt ??= nowIso();
    l.prefetched = false;
    if (l.kind === 'lesson' && l.topicId) ensureTopicProgress(store.data, l.trackId, l.topicId).lessonStarted = true;
    if (l.masteryAtStart === undefined) {
      const d = store.data;
      const ids = l.topicId ? [l.topicId] : [...new Set(l.questions.map((q) => q.topicId).filter((x): x is string => !!x))];
      l.masteryAtStart = avg(ids.map((id) => d.topicProgress[id]?.mastery ?? 0));
    }
  });
}

export function retryLesson(lessonId: string, mode: 'parallel' | 'sequential' = 'parallel'): void {
  const lesson = store.data.lessons[lessonId];
  if (!lesson) return;
  updateLesson(lessonId, (l) => {
    if (l.primerStatus === 'error') l.primerStatus = 'pending';
    if (l.questionsStatus === 'error') l.questionsStatus = 'pending';
    l.error = undefined;
    l.interrupted = undefined;
    if (l.status !== 'in_progress' && l.questionsStatus !== 'ready') l.status = 'generating';
  });
  void generateLesson(lessonId, mode);
}

/** On launch, finish topic lessons the app closed on (or whose prefetch failed), keeping one unfinished lesson per topic. */
export function resumeInterruptedLessons(): void {
  const d = store.data;
  const needsWork = (l: Lesson) => !!l.interrupted || (!!l.prefetched && (l.primerStatus === 'error' || l.questionsStatus === 'error'));
  for (const lesson of Object.values(d.lessons)) {
    if (!d.lessons[lesson.id] || lesson.kind !== 'lesson' || !lesson.topicId || !needsWork(lesson)) continue;
    const keep = resumableLesson(d, lesson.trackId, lesson.topicId);
    if (!keep) continue;
    store.mutate((data) => dropDuplicates(data, keep));
    if (needsWork(keep)) retryLesson(keep.id, 'sequential');
  }
}

export function abandonLesson(lessonId: string): void {
  const lesson = store.data.lessons[lessonId];
  if (!lesson || lesson.status === 'completed') return;
  const answered = Object.keys(lesson.answers).length > 0;
  if (!answered) {
    // Keep generated content for later instead of throwing it away.
    store.mutate(() => {
      lesson.status = lesson.questionsStatus === 'ready' ? 'ready' : lesson.status;
      if (lesson.kind === 'lesson') lesson.prefetched = true;
    });
    return;
  }
  // Topic lessons stay in progress so reopening the topic picks up at the next unanswered question.
  if (lesson.kind === 'lesson') return;
  store.mutate(() => {
    lesson.status = 'abandoned';
  });
}

// ---------------------------------------------------------------------------
// Answering & grading
// ---------------------------------------------------------------------------

const warmGraders = new Map<string, { handle: WarmHandle; model: string; timer: NodeJS.Timeout }>();

export async function warmGrader(lessonId: string): Promise<void> {
  if (warmGraders.has(lessonId)) return;
  const model = fastModel();
  const handle = await warmStart({ system: SYSTEM.grader, model, effort: 'low', schema: gradeSchema });
  if (!handle) return;
  if (warmGraders.has(lessonId)) {
    handle.warm.close();
    return;
  }
  const timer = setTimeout(() => {
    handle.warm.close();
    warmGraders.delete(lessonId);
  }, 5 * 60_000);
  warmGraders.set(lessonId, { handle, model, timer });
}

function takeWarmGrader(lessonId: string, model: string): WarmHandle | null {
  const w = warmGraders.get(lessonId);
  if (!w) return null;
  warmGraders.delete(lessonId);
  clearTimeout(w.timer);
  if (w.model !== model) {
    w.handle.warm.close();
    return null;
  }
  return w.handle;
}

async function gradeShortAnswer(lesson: Lesson, q: Question, text: string): Promise<AnswerResult> {
  if (!text.trim()) {
    return { verdict: 'incorrect', correct: false, score: 0, feedback: 'No answer was given.', missing: q.keyPoints, modelAnswer: q.sampleAnswer };
  }
  const d = store.data;
  const track = d.tracks.find((t) => t.id === lesson.trackId);
  const model = fastModel();
  const job = jobs.start('grade', 'Reviewing your answer', { refId: lesson.id, model, background: true });
  try {
    const out = await runAgent<GradeOutput>({
      job,
      system: SYSTEM.grader,
      prompt: gradePrompt({
        prompt: q.prompt,
        code: q.code,
        keyPoints: q.keyPoints ?? [],
        sampleAnswer: q.sampleAnswer,
        context: `${track ? levelLabel(track, lesson.level) || track.title : 'Interview prep'}. Difficulty ${q.difficulty}/5. The learner has ${d.profile.experienceYears} years of experience.`,
        answer: text.slice(0, 6000),
      }),
      model,
      effort: 'low',
      schema: gradeSchema,
      maxTurns: 3,
      warm: takeWarmGrader(lesson.id, model),
    });
    const g = out.data as GradeOutput;
    const score = clamp(Math.round(Number(g.score) || 0), 0, 100) / 100;
    const verdict = score >= 0.8 ? 'correct' : score >= 0.5 ? 'partial' : 'incorrect';
    job.done();
    return {
      verdict,
      correct: verdict === 'correct',
      score,
      feedback: asString(g.feedback),
      missing: asStringArray(g.missing, 6),
      modelAnswer: asString(g.improvedAnswer) || q.sampleAnswer,
    };
  } catch (error) {
    job.fail(error);
    if (error instanceof AgentError && error.code === 'cancelled') throw error;
    return heuristicShortAnswer(q, text);
  }
}

export async function answerQuestion(input: AnswerInput): Promise<AnswerResult> {
  const d = store.data;
  const lesson = d.lessons[input.lessonId];
  if (!lesson) throw new Error('Lesson not found.');
  const q = lesson.questions.find((x) => x.id === input.questionId);
  if (!q) throw new Error('Question not found.');
  const existing = lesson.answers[q.id];
  if (existing && !input.retry) return existing.result;

  const result =
    q.type === 'short_answer' && input.answer.type === 'short_answer'
      ? await gradeShortAnswer(lesson, q, input.answer.text)
      : gradeObjective(q, input.answer);
  if (input.retry || lesson.answers[q.id]) return result;

  const at = nowIso();
  store.mutate((data) => {
    lesson.answers[q.id] = { answer: input.answer, result, timeMs: input.timeMs, at };
    if (lesson.status === 'ready') lesson.status = 'in_progress';
    const topicId = q.topicId ?? lesson.topicId;
    if (topicId) applyAnswer(ensureTopicProgress(data, lesson.trackId, topicId), q, result, at);
    data.stats.questionsAnswered += 1;
    if (result.correct) data.stats.correctAnswers += 1;
    awardXp(data, xpForAnswer(q, result));
    data.attempts.push({
      id: uid('att_'),
      lessonId: lesson.id,
      lessonKind: lesson.kind,
      trackId: lesson.trackId,
      topicId,
      questionId: q.id,
      type: q.type,
      difficulty: q.difficulty,
      concepts: q.concepts,
      prompt: q.prompt,
      correct: result.correct,
      score: result.score,
      userAnswerText: answerText(q, input.answer),
      correctAnswerText: correctAnswerText(q),
      explanation: q.explanation,
      at,
      question: result.correct ? undefined : q,
    });
  });
  emitLesson(lesson);
  return result;
}

// ---------------------------------------------------------------------------
// Completion & debrief
// ---------------------------------------------------------------------------

export function completeLesson(lessonId: string, durationMs: number): LessonResult {
  const d = store.data;
  const lesson = d.lessons[lessonId];
  if (!lesson) throw new Error('Lesson not found.');
  if (lesson.status === 'completed' && lesson.result) return lesson.result;
  const track = d.tracks.find((t) => t.id === lesson.trackId);
  let result: LessonResult | undefined;

  store.mutate((data) => {
    const today = dayKey();
    const total = lesson.questions.length;
    const answers = lesson.questions.map((q) => lesson.answers[q.id]);
    const score = total ? answers.reduce((s, a) => s + (a?.result.score ?? 0), 0) / total : 0;
    const correctCount = answers.filter((a) => a?.result.correct).length;
    const lessonXp = lesson.questions.reduce((s, q) => {
      const a = lesson.answers[q.id];
      return s + (a ? xpForAnswer(q, a.result) : 0);
    }, 0);
    const levelBefore = track ? currentLevelNumber(track, data.topicProgress, data.trackProgress) : 0;
    const goal = data.settings.dailyGoalXp;
    const xpTodayBefore = (data.stats.xpByDay[today] ?? 0) - lessonXp;

    const byTopic = new Map<string, number[]>();
    for (const q of lesson.questions) {
      const topicId = q.topicId ?? lesson.topicId;
      if (!topicId) continue;
      const list = byTopic.get(topicId) ?? [];
      list.push(lesson.answers[q.id]?.result.score ?? 0);
      byTopic.set(topicId, list);
    }
    for (const [topicId, scores] of byTopic) {
      const tp = ensureTopicProgress(data, lesson.trackId, topicId);
      if (lesson.kind === 'lesson') {
        if (topicId === lesson.topicId) applyLessonOutcome(tp, avg(scores), today, true);
      } else {
        applyLessonOutcome(tp, avg(scores), today, false);
      }
    }

    let passed = score >= PASS_SCORE;
    let bonus = 10;
    if (lesson.kind === 'checkpoint' && track && lesson.level) {
      passed = score >= CHECKPOINT_PASS_SCORE;
      const tp = (data.trackProgress[track.id] ??= { trackId: track.id, checkpoints: {} });
      const prev = tp.checkpoints[lesson.level];
      tp.checkpoints[lesson.level] = { passed: passed || !!prev?.passed, bestScore: Math.max(score, prev?.bestScore ?? 0), at: nowIso() };
      if (passed) {
        bonus += 30;
        const level = track.levels.find((l) => l.number === lesson.level);
        for (const t of level?.topics ?? []) {
          const p = ensureTopicProgress(data, track.id, t.id);
          if (!p.completed) {
            p.completed = true;
            p.testedOut = true;
            p.mastery = Math.max(p.mastery, 55);
            p.srs = scheduleSrs(p.srs, score, today);
          }
        }
      }
    }
    if (total > 0 && correctCount === total) {
      bonus += 10;
      data.stats.perfectLessons += 1;
    }
    if (lesson.kind === 'mistakes' && passed) {
      for (const a of data.attempts) if (lesson.sourceAttemptIds?.includes(a.id)) a.resolved = true;
    }
    awardXp(data, bonus);
    data.stats.lessonsCompleted += 1;
    addMinutes(data, durationMs);
    const levelAfter = track ? currentLevelNumber(track, data.topicProgress, data.trackProgress) : 0;
    const ids = lesson.topicId ? [lesson.topicId] : [...byTopic.keys()];
    const masteryAfter = avg(ids.map((id) => data.topicProgress[id]?.mastery ?? 0));
    const achievements = checkAchievements(data);
    const xpTodayAfter = data.stats.xpByDay[today] ?? 0;
    lesson.status = 'completed';
    lesson.completedAt = nowIso();
    // Stale prefetches for this topic predate what we just learned about the learner; other part-done copies are retired.
    for (const [id, other] of Object.entries(data.lessons)) {
      if (id === lesson.id || !other.topicId || other.topicId !== lesson.topicId || other.status === 'completed') continue;
      if (Object.keys(other.answers).length) {
        if (other.kind === 'lesson') other.status = 'abandoned';
      } else if (other.prefetched) {
        jobs.cancelFor(id);
        delete data.lessons[id];
      }
    }
    result = {
      score,
      correctCount,
      total,
      xp: lessonXp + bonus,
      durationMs,
      masteryBefore: lesson.masteryAtStart ?? 0,
      masteryAfter,
      passed,
      levelUnlocked: levelAfter > levelBefore ? levelAfter : undefined,
      achievements,
      goalReached: xpTodayBefore < goal && xpTodayAfter >= goal,
      debrief: { status: 'pending' },
    };
    lesson.result = result;
  });
  emitLesson(lesson);
  announceAchievements(result?.achievements ?? []);
  void runDebrief(lessonId);
  prefetchNext(lesson.trackId);
  return result as LessonResult;
}

function insertRemedialTopic(d: AppData, trackId: string, afterTopicId: string, rt: NonNullable<DebriefOutput['remedialTopic']>): boolean {
  const track = d.tracks.find((t) => t.id === trackId);
  const found = track && findTopic(track, afterTopicId);
  if (!track || !found) return false;
  const { level } = found;
  if (level.topics.filter((t) => t.addedByCoach).length >= 2) return false;
  const title = truncate(asString(rt.title), 70);
  if (!title || track.levels.some((l) => l.topics.some((t) => t.title.toLowerCase() === title.toLowerCase()))) return false;
  const index = level.topics.findIndex((t) => t.id === afterTopicId);
  level.topics.splice(index + 1, 0, {
    id: uid('tpc_'),
    title,
    summary: asString(rt.summary),
    concepts: asStringArray(rt.concepts, 6),
    addedByCoach: true,
    reason: asString(rt.reason),
  });
  track.updatedAt = nowIso();
  return true;
}

async function runDebrief(lessonId: string): Promise<void> {
  const d = store.data;
  const lesson = d.lessons[lessonId];
  const track = lesson && d.tracks.find((t) => t.id === lesson.trackId);
  if (!lesson?.result || !track) return;
  const model = fastModel();
  const job = jobs.start('debrief', 'Coach is reviewing your lesson', { refId: lessonId, model, background: true });
  try {
    const r = lesson.result;
    const lines = lesson.questions.map((q) => {
      const a = lesson.answers[q.id];
      const mark = !a ? '–' : a.result.verdict === 'correct' ? '✓' : a.result.verdict === 'partial' ? '~' : '✗';
      return `${mark} [${q.type} · d${q.difficulty} · ${q.concepts.join(', ')}] ${truncate(q.prompt, 140)} → learner: ${a ? truncate(answerText(q, a.answer), 100) : '(no answer)'} | correct: ${truncate(correctAnswerText(q), 100)}`;
    });
    const found = lesson.topicId ? findTopic(track, lesson.topicId) : undefined;
    const upcoming = found
      ? found.level.topics
          .slice(found.level.topics.findIndex((t) => t.id === lesson.topicId) + 1)
          .map((t) => t.title)
          .join('; ')
      : '';
    const out = await runAgent<DebriefOutput>({
      job,
      system: SYSTEM.debrief,
      prompt: debriefPrompt({
        header: `${KIND_LABEL[lesson.kind]}: ${lesson.title} · ${track.title}${lesson.level ? ` · ${levelLabel(track, lesson.level)}` : ''}`,
        results: `Score: ${Math.round(r.score * 100)}% (${r.correctCount}/${r.total} correct). Mastery: ${Math.round(r.masteryBefore)} → ${Math.round(r.masteryAfter)}.\n${lines.join('\n')}`,
        notes: notesText(d, { trackId: track.id, limit: 12 }),
        upcoming,
      }),
      model,
      effort: 'low',
      schema: debriefSchema,
      maxTurns: 3,
    });
    const o = out.data as DebriefOutput;
    let remedial: string | undefined;
    store.mutate((data) => {
      const l = data.lessons[lessonId];
      if (!l?.result) return;
      for (const n of (o.notes ?? []).slice(0, 3)) {
        const text = truncate(asString(n.text), 300);
        if (!text || data.notes.some((x) => similarText(x.text, text))) continue;
        data.notes.push({ id: uid('note_'), kind: n.kind, text, trackId: l.trackId, topicId: l.topicId, source: 'lesson', createdAt: nowIso() });
      }
      if (o.remedialTopic && l.kind === 'lesson' && l.topicId && l.result.score < 0.75) {
        if (insertRemedialTopic(data, l.trackId, l.topicId, o.remedialTopic)) remedial = truncate(asString(o.remedialTopic.title), 70);
      }
      l.result.debrief = {
        status: 'ready',
        headline: asString(o.headline),
        summary: asString(o.summary),
        strengths: asStringArray(o.strengths, 3),
        focusNext: asStringArray(o.focusNext, 3),
        nextStep: asString(o.nextStep),
        remedialTopicTitle: remedial,
      };
    });
    emitLesson(lesson);
    job.done();
    if (remedial) toast({ kind: 'info', title: 'Coach adapted your path', body: `Added “${remedial}” to help with what you missed.` });
  } catch (error) {
    store.mutate(() => {
      if (lesson.result) lesson.result.debrief = { status: 'error' };
    });
    emitLesson(lesson);
    job.fail(error);
  }
}

// ---------------------------------------------------------------------------
// Mistakes & history
// ---------------------------------------------------------------------------

export function listMistakes(): Attempt[] {
  const seen = new Set<string>();
  const out: Attempt[] = [];
  const attempts = store.data.attempts;
  for (let i = attempts.length - 1; i >= 0 && out.length < 200; i--) {
    const a = attempts[i];
    if (a.correct || a.resolved || !a.question || seen.has(a.questionId)) continue;
    seen.add(a.questionId);
    out.push(a);
  }
  return out;
}

export function resolveMistake(attemptId: string): void {
  store.mutate((d) => {
    const a = d.attempts.find((x) => x.id === attemptId);
    if (a) a.resolved = true;
  });
}

export function history(filter: { trackId?: string; topicId?: string; limit?: number }): Attempt[] {
  const out: Attempt[] = [];
  const attempts = store.data.attempts;
  const limit = filter.limit ?? 100;
  for (let i = attempts.length - 1; i >= 0 && out.length < limit; i--) {
    const a = attempts[i];
    if (filter.trackId && a.trackId !== filter.trackId) continue;
    if (filter.topicId && a.topicId !== filter.topicId) continue;
    out.push(a);
  }
  return out;
}
