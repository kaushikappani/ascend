// Single-file JSON persistence with atomic writes, daily backups and crash recovery.
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VERSION, DEFAULT_SETTINGS } from '@shared/constants';
import { addDays, dayKey } from '@shared/progress';
import type { AppData, AppSnapshot, Lesson, LessonSummary, Stats, Usage } from '@shared/types';
import { nowIso } from './util';

const MAX_ATTEMPTS = 6000;
const MAX_LESSON_BODIES = 250;

export function defaultStats(): Stats {
  return {
    xp: 0,
    xpByDay: {},
    minutesByDay: {},
    streak: { current: 0, longest: 0 },
    lessonsCompleted: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    perfectLessons: 0,
    interviewsCompleted: 0,
    achievements: {},
  };
}

function defaultUsage(): Usage {
  return { calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, webSearches: 0, byModel: {} };
}

export function defaultData(): AppData {
  return {
    version: DATA_VERSION,
    profile: {
      name: '',
      currentRole: '',
      experienceYears: 0,
      targetRole: '',
      goals: '',
      timeline: '',
      onboarded: false,
      createdAt: nowIso(),
    },
    settings: { ...DEFAULT_SETTINGS, questionTypes: { ...DEFAULT_SETTINGS.questionTypes } },
    tracks: [],
    topicProgress: {},
    trackProgress: {},
    lessons: {},
    attempts: [],
    notes: [],
    insights: [],
    targets: [],
    interviews: [],
    threads: [],
    stats: defaultStats(),
    usage: defaultUsage(),
  };
}

/** Fill in fields added in later versions and repair anything a crash may have left half-done. */
function normalize(raw: Partial<AppData>): AppData {
  const base = defaultData();
  const data: AppData = {
    ...base,
    ...raw,
    profile: { ...base.profile, ...raw.profile },
    settings: {
      ...base.settings,
      ...raw.settings,
      questionTypes: { ...base.settings.questionTypes, ...raw.settings?.questionTypes },
    },
    stats: { ...base.stats, ...raw.stats, streak: { ...base.stats.streak, ...raw.stats?.streak } },
    usage: { ...base.usage, ...raw.usage },
    version: DATA_VERSION,
  };
  const interrupted = 'Interrupted when the app closed. Tap retry to continue.';
  for (const [id, lesson] of Object.entries(data.lessons)) {
    const primerCut = lesson.primerStatus === 'pending' || lesson.primerStatus === 'streaming';
    const questionsCut = lesson.questionsStatus === 'pending';
    if (primerCut || questionsCut) {
      // A background prefetch that hadn't finished anything yet is simply regenerated later.
      if (lesson.prefetched && lesson.primerStatus !== 'ready' && lesson.questionsStatus !== 'ready' && !Object.keys(lesson.answers ?? {}).length) {
        delete data.lessons[id];
        continue;
      }
      // Keep whatever finished; only the cut-off parts are regenerated (a half-streamed primer is incomplete).
      if (primerCut) {
        lesson.primerStatus = 'error';
        lesson.primer = '';
      }
      if (questionsCut) lesson.questionsStatus = 'error';
      lesson.error = interrupted;
      lesson.interrupted = true;
    }
    if (lesson.status === 'generating' && lesson.questionsStatus === 'ready') lesson.status = 'ready';
    if (lesson.result?.debrief?.status === 'pending') lesson.result.debrief.status = 'error';
  }
  // v2: lessons left part-way are resumed rather than abandoned, so revive the latest one per unfinished topic.
  if ((raw.version ?? 1) < 2) {
    const latest = new Map<string, Lesson>();
    for (const l of Object.values(data.lessons)) {
      if (l.kind !== 'lesson' || l.status !== 'abandoned' || !l.topicId || data.topicProgress[l.topicId]?.completed) continue;
      const prev = latest.get(l.topicId);
      if (!prev || (l.startedAt ?? l.createdAt) > (prev.startedAt ?? prev.createdAt)) latest.set(l.topicId, l);
    }
    for (const l of latest.values()) l.status = 'in_progress';
  }
  // Remember which topics the learner has opened lessons on (older data predates the flag).
  for (const lesson of Object.values(data.lessons)) {
    const p = lesson.kind === 'lesson' && lesson.topicId && lesson.startedAt ? data.topicProgress[lesson.topicId] : undefined;
    if (p) p.lessonStarted = true;
  }
  for (const track of data.tracks) {
    if (track.status === 'generating') {
      track.status = track.levels.length ? 'ready' : 'error';
      if (track.status === 'error') track.error = interrupted;
    }
  }
  for (const target of data.targets) {
    if (target.status === 'researching' || target.status === 'building') {
      target.status = target.brief ? 'ready' : 'error';
      if (target.status === 'error') target.error = interrupted;
    }
  }
  for (const session of data.interviews) {
    if (session.status === 'scoring') session.status = 'active';
    for (const m of session.messages) {
      if (m.pending) {
        m.pending = false;
        m.error = true;
        m.text = m.text || 'This reply was interrupted.';
      }
    }
  }
  for (const thread of data.threads) {
    for (const m of thread.messages) {
      if (m.pending) {
        m.pending = false;
        m.error = true;
        m.text = m.text || 'This reply was interrupted.';
      }
    }
  }
  return data;
}

export function summarizeLesson(lesson: Lesson): LessonSummary {
  const { primer: _p, questions, answers, ...rest } = lesson;
  return { ...rest, questionCount: questions.length, answeredCount: Object.keys(answers).length };
}

type Listener = () => void;

class Store {
  data: AppData = defaultData();
  private file = '';
  private secretsFile = '';
  private saveTimer: NodeJS.Timeout | null = null;
  private listeners = new Set<Listener>();

  init(): void {
    const dir = this.dataDir();
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'ascend.json');
    this.secretsFile = path.join(dir, 'secrets.json');
    this.data = this.load();
  }

  dataDir(): string {
    return path.join(app.getPath('userData'), 'data');
  }

  private load(): AppData {
    for (const candidate of [this.file, `${this.file}.bak`]) {
      try {
        if (!fs.existsSync(candidate)) continue;
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as Partial<AppData>;
        return normalize(parsed);
      } catch (error) {
        console.error(`[store] failed to read ${candidate}`, error);
      }
    }
    return defaultData();
  }

  /** Apply a mutation, then persist (debounced) and notify listeners. */
  mutate<T>(fn: (data: AppData) => T): T {
    const result = fn(this.data);
    this.scheduleSave();
    for (const l of this.listeners) l();
    return result;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 400);
  }

  saveNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.file) return;
    this.prune();
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf8');
      this.backupDaily();
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error('[store] save failed', error);
    }
  }

  private backupDaily(): void {
    try {
      const bak = `${this.file}.bak`;
      if (!fs.existsSync(this.file)) return;
      const stale = !fs.existsSync(bak) || Date.now() - fs.statSync(bak).mtimeMs > 20 * 3600_000;
      if (stale) fs.copyFileSync(this.file, bak);
    } catch {
      // Backups are best-effort.
    }
  }

  /** Keep the file small: cap the attempt log and drop bodies of old finished lessons. */
  private prune(): void {
    const d = this.data;
    if (d.attempts.length > MAX_ATTEMPTS) d.attempts = d.attempts.slice(-MAX_ATTEMPTS);
    const finished = Object.values(d.lessons)
      .filter((l) => l.status === 'completed' || l.status === 'abandoned')
      .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
    for (const lesson of finished.slice(MAX_LESSON_BODIES)) {
      if (lesson.questions.length || lesson.primer) {
        lesson.primer = undefined;
        lesson.questions = [];
        lesson.answers = {};
      }
    }
  }

  snapshot(): AppSnapshot {
    const { lessons, attempts, ...rest } = this.data;
    const today = dayKey();
    const dueReviews = Object.values(this.data.topicProgress).filter(
      (p) => p.completed && p.srs.due && p.srs.due <= today,
    ).length;
    return {
      ...rest,
      lessons: Object.values(lessons)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 400)
        .map(summarizeLesson),
      mistakesCount: attempts.filter((a) => !a.correct && !a.resolved && a.question).length,
      dueReviews,
    };
  }

  replaceAll(data: Partial<AppData>): void {
    this.data = normalize(data);
    this.saveNow();
    for (const l of this.listeners) l();
  }

  reset(): void {
    const keepSettings = this.data.settings;
    this.data = defaultData();
    this.data.settings = keepSettings;
    this.saveNow();
    for (const l of this.listeners) l();
  }

  // ---- API key (encrypted with the OS keychain via safeStorage, kept out of exports) ----

  getApiKey(): string | null {
    try {
      if (!fs.existsSync(this.secretsFile)) return null;
      const raw = JSON.parse(fs.readFileSync(this.secretsFile, 'utf8')) as { apiKey?: string };
      if (!raw.apiKey) return null;
      const buf = Buffer.from(raw.apiKey, 'base64');
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    } catch {
      return null;
    }
  }

  setApiKey(key: string | null): void {
    if (!key) {
      fs.rmSync(this.secretsFile, { force: true });
    } else {
      const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8');
      fs.writeFileSync(this.secretsFile, JSON.stringify({ apiKey: buf.toString('base64') }), 'utf8');
    }
    this.mutate((d) => {
      d.settings.hasApiKey = !!key;
      if (!key && d.settings.authMode === 'apiKey') d.settings.authMode = 'claude';
    });
  }
}

export const store = new Store();

/** Local calendar day helpers bound to "now". */
export const today = (): string => dayKey();
export const yesterday = (): string => addDays(dayKey(), -1);
