import { create } from 'zustand';
import type { StartLessonInput } from '@shared/api';
import type { AppSnapshot, ConnectionStatus, JobInfo, ModelOption, Toast } from '@shared/types';
import { api, errorText } from './api';

export type Route =
  | { name: 'learn' }
  | { name: 'practice' }
  | { name: 'interview'; id?: string }
  | { name: 'targets' }
  | { name: 'target'; id: string }
  | { name: 'coach'; id?: string }
  | { name: 'progress' }
  | { name: 'settings' };

interface AppState {
  ready: boolean;
  snapshot: AppSnapshot | null;
  jobs: JobInfo[];
  connection: ConnectionStatus;
  models: ModelOption[];
  route: Route;
  lessonId: string | null;
  toasts: Toast[];
  /** Streaming text for chat/interview messages, keyed by message id. */
  streams: Record<string, string>;
  /** Keeps the onboarding flow on screen while the first roadmaps are designed. */
  onboardingActive: boolean;
  setOnboardingActive: (active: boolean) => void;
  navigate: (route: Route) => void;
  openLesson: (id: string) => void;
  closeLesson: () => void;
  pushToast: (toast: Omit<Toast, 'id'> & { id?: string }) => void;
  dismissToast: (id: string) => void;
  setModels: (models: ModelOption[]) => void;
}

export const useApp = create<AppState>()((set) => ({
  ready: false,
  snapshot: null,
  jobs: [],
  connection: { state: 'unknown' },
  models: [],
  route: { name: 'learn' },
  lessonId: null,
  toasts: [],
  streams: {},
  onboardingActive: false,
  setOnboardingActive: (onboardingActive) => set({ onboardingActive }),
  navigate: (route) => set({ route }),
  openLesson: (id) => set({ lessonId: id }),
  closeLesson: () => set({ lessonId: null }),
  pushToast: (toast) =>
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id: toast.id ?? Math.random().toString(36).slice(2) }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setModels: (models) => set({ models }),
}));

export function toastError(title: string, error: unknown): void {
  useApp.getState().pushToast({ kind: 'error', title, body: errorText(error) });
}

export function toastInfo(title: string, body?: string): void {
  useApp.getState().pushToast({ kind: 'info', title, body });
}

/** Run an API call, surfacing failures as a toast. */
export async function attempt<T>(title: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    toastError(title, error);
    return undefined;
  }
}

export async function startLesson(input: StartLessonInput): Promise<void> {
  const id = await attempt("Couldn't start that session", () => api.lessons.start(input));
  if (id) useApp.getState().openLesson(id);
}

function pendingMessageIds(s: AppSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const t of s.threads) for (const m of t.messages) if (m.pending) ids.add(m.id);
  for (const i of s.interviews) for (const m of i.messages) if (m.pending) ids.add(m.id);
  return ids;
}

let booted = false;

export async function bootstrap(): Promise<void> {
  if (booted) return;
  booted = true;
  api.on.snapshot((snapshot) =>
    useApp.setState((s) => {
      const pending = pendingMessageIds(snapshot);
      const streams = Object.fromEntries(Object.entries(s.streams).filter(([id]) => pending.has(id)));
      return { snapshot, streams };
    }),
  );
  api.on.jobs((jobs) => useApp.setState({ jobs }));
  api.on.connection((connection) => useApp.setState({ connection }));
  api.on.toast((toast) => useApp.getState().pushToast(toast));
  api.on.chatDelta((e) =>
    useApp.setState((s) => ({ streams: { ...s.streams, [e.messageId]: (e.reset ? '' : (s.streams[e.messageId] ?? '')) + e.delta } })),
  );
  api.on.navigate((r) => {
    const route = (r.params?.id ? { name: r.name, id: r.params.id } : { name: r.name }) as Route;
    useApp.setState({ route, lessonId: null });
  });
  const [snapshot, jobs, connection] = await Promise.all([api.app.snapshot(), api.jobs.list(), api.claude.status()]);
  useApp.setState({ snapshot, jobs, connection, ready: true });
  api.claude
    .models()
    .then((models) => useApp.getState().setModels(models))
    .catch(() => undefined);
}

// Debug/test handle (the renderer is sandboxed; this only exposes the page's own UI state).
(window as unknown as { __ascend?: unknown }).__ascend = { useApp };

/** Refresh the model list whenever a connection check completes. */
useApp.subscribe((state, prev) => {
  if (state.connection.checkedAt && state.connection.checkedAt !== prev.connection.checkedAt) {
    api.claude
      .models()
      .then((models) => useApp.getState().setModels(models))
      .catch(() => undefined);
  }
});
