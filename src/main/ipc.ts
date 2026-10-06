// Typed RPC surface exposed to the renderer through the preload bridge.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import { RPC_CHANNEL, type OnboardingInput, type Rpc } from '@shared/api';
import type { AppData, Profile, Settings } from '@shared/types';
import { cachedModels, checkConnection, getConnection, resolveClaudeExecutable } from './agent/runtime';
import { jobs } from './jobs';
import { store } from './store';
import { clamp, errorMessage, nowIso, uid } from './util';
import { shutdownChats, createThread, removeThread, retryChat, sendChat } from './services/chat';
import { generateInsight } from './services/insights';
import { finishInterview, removeInterview, retryTurn, sendAnswer, shutdownInterviews, startInterview } from './services/interviews';
import {
  abandonLesson,
  answerQuestion,
  beginLesson,
  completeLesson,
  getLesson,
  history,
  listMistakes,
  resolveMistake,
  retryLesson,
  startLesson,
  warmGrader,
} from './services/lessons';
import { createTarget, removeTarget, retryTarget, setActiveTarget } from './services/targets';
import { createTrack, extendRoadmap, regenerateTrack, removeTrack, setActiveTrack, setStartLevel } from './services/tracks';

export const TITLEBAR = {
  light: { color: '#F6F6FB', symbolColor: '#2B2D42' },
  dark: { color: '#141526', symbolColor: '#E6E7F5' },
};

function sanitizeSettings(patch: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = { ...patch };
  delete out.hasApiKey;
  if (out.lessonLength !== undefined) out.lessonLength = clamp(Math.round(out.lessonLength), 4, 15);
  if (out.dailyGoalXp !== undefined) out.dailyGoalXp = clamp(Math.round(out.dailyGoalXp), 10, 500);
  if (out.model !== undefined) out.model = out.model.trim() || store.data.settings.model;
  if (out.fastModel !== undefined) out.fastModel = out.fastModel.trim();
  if (out.claudePath !== undefined) out.claudePath = out.claudePath.trim();
  return out;
}

function completeOnboarding(input: OnboardingInput): void {
  store.mutate((d) => {
    Object.assign(d.profile, input.profile, { onboarded: true });
    d.settings.dailyGoalXp = clamp(input.dailyGoalXp, 10, 500);
    if (input.model) d.settings.model = input.model;
  });
  for (const track of input.tracks) createTrack(track);
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const handlers: Rpc = {
    app: {
      snapshot: async () => store.snapshot(),
      info: async () => ({
        version: app.getVersion(),
        dataDir: store.dataDir(),
        claudePath: resolveClaudeExecutable() ?? 'Bundled with the Claude Agent SDK',
        platform: `${process.platform} ${process.arch}`,
        electron: process.versions.electron,
      }),
      openExternal: async (url) => {
        if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
      },
      openDataFolder: async () => {
        await shell.openPath(store.dataDir());
      },
      exportData: async () => {
        const win = getWindow();
        const opts = {
          title: 'Export Ascend data',
          defaultPath: `ascend-backup-${nowIso().slice(0, 10)}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        };
        const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
        if (res.canceled || !res.filePath) return { ok: false };
        store.saveNow();
        fs.writeFileSync(res.filePath, JSON.stringify(store.data, null, 1), 'utf8');
        return { ok: true, path: res.filePath };
      },
      importData: async () => {
        const win = getWindow();
        const opts = { title: 'Import Ascend data', properties: ['openFile' as const], filters: [{ name: 'JSON', extensions: ['json'] }] };
        const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
        if (res.canceled || !res.filePaths[0]) return { ok: false };
        try {
          const parsed = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8')) as Partial<AppData>;
          if (!parsed || typeof parsed !== 'object' || !parsed.profile || !Array.isArray(parsed.tracks)) {
            return { ok: false, error: "That file doesn't look like an Ascend backup." };
          }
          jobs.cancelAll();
          shutdownInterviews();
          shutdownChats();
          store.replaceAll(parsed);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      },
      resetData: async () => {
        jobs.cancelAll();
        shutdownInterviews();
        shutdownChats();
        store.reset();
      },
      setTitleBarTheme: async (theme) => {
        const win = getWindow();
        if (win && process.platform === 'win32') win.setTitleBarOverlay({ ...TITLEBAR[theme], height: 48 });
        win?.setBackgroundColor(TITLEBAR[theme].color);
      },
    },
    claude: {
      status: async () => getConnection(),
      check: () => checkConnection(),
      models: async (refresh) => {
        if (refresh || getConnection().state === 'unknown') await checkConnection();
        return cachedModels();
      },
      setApiKey: async (key) => {
        store.setApiKey(key?.trim() || null);
        if (key?.trim()) {
          store.mutate((d) => {
            d.settings.authMode = 'apiKey';
          });
        }
        void checkConnection();
      },
    },
    profile: {
      update: async (patch: Partial<Profile>) => {
        store.mutate((d) => {
          Object.assign(d.profile, patch);
        });
      },
    },
    settings: {
      update: async (patch) => {
        const clean = sanitizeSettings(patch);
        const before = store.data.settings;
        const recheck =
          (clean.model !== undefined && clean.model !== before.model) ||
          (clean.claudePath !== undefined && clean.claudePath !== before.claudePath) ||
          (clean.authMode !== undefined && clean.authMode !== before.authMode);
        store.mutate((d) => {
          d.settings = { ...d.settings, ...clean, questionTypes: { ...d.settings.questionTypes, ...clean.questionTypes } };
          if (!Object.values(d.settings.questionTypes).some(Boolean)) d.settings.questionTypes.mcq = true;
        });
        if (recheck) void checkConnection();
      },
    },
    onboarding: {
      complete: async (input) => completeOnboarding(input),
    },
    tracks: {
      create: async (input) => createTrack(input),
      regenerate: async (trackId) => regenerateTrack(trackId),
      remove: async (trackId) => removeTrack(trackId),
      setActive: async (trackId) => setActiveTrack(trackId),
      setStartLevel: async (trackId, level) => setStartLevel(trackId, level),
      extend: async (trackId) => extendRoadmap(trackId),
    },
    lessons: {
      start: async (input) => startLesson(input),
      get: async (lessonId) => getLesson(lessonId),
      begin: async (lessonId) => beginLesson(lessonId),
      answer: (input) => answerQuestion(input),
      warmGrader: async (lessonId) => {
        void warmGrader(lessonId);
      },
      complete: async (lessonId, durationMs) => {
        const result = completeLesson(lessonId, durationMs);
        // Finishing the last level opens the next stretch of the roadmap right away.
        const trackId = getLesson(lessonId)?.trackId;
        if (result.trackCompleted && trackId) {
          try {
            extendRoadmap(trackId);
          } catch {
            // The learner can still extend it by hand from the path.
          }
        }
        return result;
      },
      abandon: async (lessonId) => abandonLesson(lessonId),
      retry: async (lessonId) => retryLesson(lessonId),
    },
    practice: {
      mistakes: async () => listMistakes(),
      resolveMistake: async (attemptId) => resolveMistake(attemptId),
      history: async (filter) => history(filter),
    },
    targets: {
      create: async (input) => createTarget(input),
      retry: async (targetId) => retryTarget(targetId),
      remove: async (targetId) => removeTarget(targetId),
      setActive: async (targetId) => setActiveTarget(targetId),
    },
    interviews: {
      start: async (input) => startInterview(input),
      send: async (id, text) => sendAnswer(id, text),
      retry: async (id) => retryTurn(id),
      finish: async (id) => {
        void finishInterview(id);
      },
      remove: async (id) => removeInterview(id),
    },
    chat: {
      create: async (input) => createThread(input),
      send: async (threadId, text) => sendChat(threadId, text),
      retry: async (threadId) => retryChat(threadId),
      remove: async (threadId) => removeThread(threadId),
    },
    notes: {
      add: async ({ kind, text }) => {
        const clean = text.trim();
        if (!clean) return;
        store.mutate((d) => {
          d.notes.push({ id: uid('note_'), kind, text: clean.slice(0, 400), source: 'system', createdAt: nowIso(), pinned: true });
        });
      },
      remove: async (noteId) => {
        store.mutate((d) => {
          d.notes = d.notes.filter((n) => n.id !== noteId);
        });
      },
      togglePin: async (noteId) => {
        store.mutate((d) => {
          const n = d.notes.find((x) => x.id === noteId);
          if (n) n.pinned = !n.pinned;
        });
      },
    },
    insights: {
      generate: async () => {
        void generateInsight();
      },
    },
    jobs: {
      list: async () => jobs.list(),
      cancel: async (jobId) => jobs.cancel(jobId),
    },
  };

  ipcMain.handle(RPC_CHANNEL, async (_event, method: string, args: unknown[]) => {
    const [group, name] = String(method).split('.');
    const fn = (handlers as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>)[group]?.[name];
    if (typeof fn !== 'function') return { ok: false, error: `Unknown method ${method}` };
    try {
      return { ok: true, value: await fn(...(Array.isArray(args) ? args : [])) };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  });
}
