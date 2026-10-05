// Company targets: web research + JD analysis + a company-specific prep path.
import type { NewTargetInput } from '@shared/api';
import type { CompanyBrief, Target } from '@shared/types';
import {
  conceptListText,
  daysUntil,
  learnerProfileText,
  strongConcepts,
  tracksOverviewText,
  weakConcepts,
} from '../agent/context';
import { SYSTEM, targetResearchPrompt } from '../agent/prompts';
import { mainModel, runAgent } from '../agent/runtime';
import { briefSchema } from '../agent/schemas';
import { checkAchievements } from '../engine/gamification';
import { notify, toast } from '../events';
import { jobs } from '../jobs';
import { store } from '../store';
import { asString, asStringArray, clamp, errorMessage, nowIso, truncate, uid } from '../util';
import { announceAchievements } from './common';
import { createTrack, generateRoadmap, removeTrack } from './tracks';

const IMPORTANCE = ['critical', 'high', 'medium', 'low'] as const;
const LEVELS = ['none', 'basic', 'intermediate', 'strong'] as const;
const CATEGORIES = ['technical', 'behavioral', 'system_design', 'coding', 'company'] as const;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeBrief(raw: Partial<CompanyBrief> | undefined): CompanyBrief {
  const r = raw ?? {};
  const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    overview: asString(r.overview),
    techStack: asStringArray(r.techStack, 30),
    interviewProcess: list<CompanyBrief['interviewProcess'][number]>(r.interviewProcess)
      .map((s) => ({ stage: asString(s?.stage), description: asString(s?.description), tips: asString(s?.tips) || undefined }))
      .filter((s) => s.stage),
    values: list<CompanyBrief['values'][number]>(r.values)
      .map((v) => ({ name: asString(v?.name), howToShow: asString(v?.howToShow) }))
      .filter((v) => v.name),
    recentNews: asStringArray(r.recentNews, 8),
    roleSummary: asString(r.roleSummary),
    mustHave: asStringArray(r.mustHave, 20),
    niceToHave: asStringArray(r.niceToHave, 20),
    keywords: asStringArray(r.keywords, 30),
    skillGaps: list<CompanyBrief['skillGaps'][number]>(r.skillGaps)
      .map((g) => ({
        skill: asString(g?.skill),
        importance: pick(g?.importance, IMPORTANCE, 'medium'),
        currentLevel: pick(g?.currentLevel, LEVELS, 'basic'),
        gap: asString(g?.gap),
        action: asString(g?.action),
      }))
      .filter((g) => g.skill),
    prepPlan: list<CompanyBrief['prepPlan'][number]>(r.prepPlan)
      .map((p) => ({ day: asString(p?.day), focus: asString(p?.focus), tasks: asStringArray(p?.tasks, 6) }))
      .filter((p) => p.day || p.focus),
    likelyQuestions: list<CompanyBrief['likelyQuestions'][number]>(r.likelyQuestions)
      .map((q) => ({
        category: pick(q?.category, CATEGORIES, 'technical'),
        question: asString(q?.question),
        whyAsked: asString(q?.whyAsked),
        answerHints: asStringArray(q?.answerHints, 5),
      }))
      .filter((q) => q.question),
    tips: asStringArray(r.tips, 10),
    sources: list<CompanyBrief['sources'][number]>(r.sources)
      .map((s) => ({ title: asString(s?.title) || asString(s?.url), url: asString(s?.url) }))
      .filter((s) => /^https?:\/\//.test(s.url))
      .slice(0, 15),
    readinessEstimate: clamp(Math.round(Number(r.readinessEstimate) || 0), 0, 100),
  };
}

export function createTarget(input: NewTargetInput): string {
  const company = truncate(input.company ?? '', 80);
  const role = truncate(input.role ?? '', 100);
  if (!company || !role) throw new Error('Company and role are required.');
  const date = input.interviewDate && /^\d{4}-\d{2}-\d{2}$/.test(input.interviewDate) ? input.interviewDate : undefined;
  const now = nowIso();
  const target: Target = {
    id: uid('tgt_'),
    company,
    role,
    seniority: input.seniority?.trim() || undefined,
    location: input.location?.trim() || undefined,
    jobDescription: (input.jobDescription ?? '').trim().slice(0, 20000),
    interviewDate: date,
    notes: input.notes?.trim() || undefined,
    status: 'researching',
    createdAt: now,
    updatedAt: now,
  };
  store.mutate((d) => {
    d.targets.unshift(target);
    d.profile.activeTargetId = target.id;
  });
  void researchTarget(target.id);
  return target.id;
}

async function buildTargetTrack(target: Target): Promise<void> {
  const d = store.data;
  let trackId = target.trackId && d.tracks.some((t) => t.id === target.trackId) ? target.trackId : undefined;
  if (!trackId) {
    const id = createTrack({
      title: `${target.company} · ${target.role}`,
      subject: `Interview preparation for the ${target.role} role at ${target.company}`,
      emoji: '🎯',
      color: '#0EA5E9',
      tagline: `Your personal prep path for ${target.company}`,
      startLevel: 99,
      kind: 'target',
    });
    store.mutate((data) => {
      const track = data.tracks.find((t) => t.id === id);
      if (track) track.targetId = target.id;
      target.trackId = id;
    });
    trackId = id;
  }
  await generateRoadmap(trackId);
}

async function researchTarget(targetId: string): Promise<void> {
  const d = store.data;
  const target = d.targets.find((t) => t.id === targetId);
  if (!target || jobs.isRunning('target', targetId)) return;
  const model = mainModel();
  const job = jobs.start('target', `Researching ${target.company}`, { refId: targetId, model, background: true });
  store.mutate(() => {
    target.status = 'researching';
    target.error = undefined;
  });
  try {
    const webEnabled = d.settings.research !== 'off';
    const out = await runAgent<CompanyBrief>({
      job,
      system: SYSTEM.research,
      prompt: targetResearchPrompt({
        target,
        days: daysUntil(target),
        learner: learnerProfileText(d),
        tracks: tracksOverviewText(d),
        strong: conceptListText(strongConcepts(d, {}, 8)),
        weak: conceptListText(weakConcepts(d, {}, 10)),
        webEnabled,
      }),
      model,
      effort: 'high',
      schema: briefSchema,
      web: webEnabled,
      maxTurns: 30,
    });
    const brief = normalizeBrief(out.data);
    store.mutate(() => {
      target.brief = brief;
      target.status = 'building';
      target.updatedAt = nowIso();
    });
    job.done();
    await buildTargetTrack(target);
    let unlocked: string[] = [];
    store.mutate((data) => {
      target.status = 'ready';
      target.updatedAt = nowIso();
      unlocked = checkAchievements(data);
    });
    announceAchievements(unlocked);
    toast({
      kind: 'success',
      title: `🎯 ${target.company} prep is ready`,
      body: 'Company research, skill gaps, a day-by-day plan and a custom prep path.',
      action: { label: 'Open', route: 'target', params: { id: targetId } },
    });
    notify(`${target.company} prep is ready`, 'Your company-specific brief and prep path are waiting.', { name: 'target', params: { id: targetId } });
  } catch (error) {
    store.mutate(() => {
      target.status = target.brief ? 'ready' : 'error';
      target.error = errorMessage(error);
    });
    job.fail(error);
    if (!job.signal.aborted) toast({ kind: 'error', title: `Couldn't finish ${target.company} prep`, body: errorMessage(error) });
  }
}

export function retryTarget(targetId: string): void {
  const target = store.data.targets.find((t) => t.id === targetId);
  if (!target) return;
  const track = store.data.tracks.find((t) => t.id === target.trackId);
  if (target.brief && (!track || track.status !== 'ready')) {
    store.mutate(() => {
      target.status = 'building';
      target.error = undefined;
    });
    void buildTargetTrack(target)
      .then(() =>
        store.mutate(() => {
          target.status = 'ready';
        }),
      )
      .catch((error) =>
        store.mutate(() => {
          target.status = 'ready';
          target.error = errorMessage(error);
        }),
      );
    return;
  }
  void researchTarget(targetId);
}

export function removeTarget(targetId: string): void {
  jobs.cancelFor(targetId);
  const target = store.data.targets.find((t) => t.id === targetId);
  if (target?.trackId) removeTrack(target.trackId);
  store.mutate((d) => {
    d.targets = d.targets.filter((t) => t.id !== targetId);
    if (d.profile.activeTargetId === targetId) d.profile.activeTargetId = d.targets.find((t) => t.status === 'ready')?.id;
  });
}

export function setActiveTarget(targetId: string | null): void {
  store.mutate((d) => {
    d.profile.activeTargetId = targetId && d.targets.some((t) => t.id === targetId) ? targetId : undefined;
  });
}
