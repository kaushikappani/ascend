// Typed contract between the renderer (window.ascend) and the main process.
import type {
  AnswerResult,
  AppInfo,
  AppSnapshot,
  Attempt,
  ConnectionStatus,
  InterviewDifficulty,
  InterviewPersona,
  InterviewStyle,
  JobInfo,
  Lesson,
  LessonKind,
  LessonResult,
  ModelOption,
  NoteKind,
  Profile,
  Settings,
  Toast,
  TrackKind,
  UserAnswer,
} from './types';

export interface NewTrackInput {
  title: string;
  subject: string;
  emoji: string;
  color: string;
  tagline?: string;
  /** Self-assessed starting point (1-10). The roadmap's level 1 is pitched here; everyone starts at level 1. */
  proficiency?: number;
  kind?: TrackKind;
}

export interface OnboardingInput {
  profile: Pick<Profile, 'name' | 'currentRole' | 'experienceYears' | 'targetRole' | 'goals' | 'timeline'>;
  tracks: NewTrackInput[];
  dailyGoalXp: number;
  model: string;
}

export interface StartLessonInput {
  trackId: string;
  kind: LessonKind;
  topicId?: string;
  level?: number;
  focus?: string;
  title?: string;
}

export interface AnswerInput {
  lessonId: string;
  questionId: string;
  answer: UserAnswer;
  timeMs: number;
  /** Second attempt during the mistake-review round: graded, but not recorded. */
  retry?: boolean;
  /** The learner revealed the hint first. */
  hintUsed?: boolean;
}

export interface NewTargetInput {
  company: string;
  role: string;
  jobDescription: string;
  interviewDate?: string;
  seniority?: string;
  location?: string;
  notes?: string;
}

export interface StartInterviewInput {
  trackId?: string;
  targetId?: string;
  style: InterviewStyle;
  difficulty: InterviewDifficulty;
  persona: InterviewPersona;
  questionCount: number;
  focus?: string;
}

export interface NewChatInput {
  title?: string;
  context?: string;
  contextLabel?: string;
}

export interface Rpc {
  app: {
    snapshot(): Promise<AppSnapshot>;
    info(): Promise<AppInfo>;
    openExternal(url: string): Promise<void>;
    openDataFolder(): Promise<void>;
    exportData(): Promise<{ ok: boolean; path?: string }>;
    importData(): Promise<{ ok: boolean; error?: string }>;
    resetData(): Promise<void>;
    setTitleBarTheme(theme: 'light' | 'dark'): Promise<void>;
  };
  claude: {
    status(): Promise<ConnectionStatus>;
    check(): Promise<ConnectionStatus>;
    models(refresh?: boolean): Promise<ModelOption[]>;
    setApiKey(key: string | null): Promise<void>;
  };
  profile: {
    update(patch: Partial<Profile>): Promise<void>;
  };
  settings: {
    update(patch: Partial<Settings>): Promise<void>;
  };
  onboarding: {
    complete(input: OnboardingInput): Promise<void>;
  };
  tracks: {
    create(input: NewTrackInput): Promise<string>;
    regenerate(trackId: string): Promise<void>;
    remove(trackId: string): Promise<void>;
    setActive(trackId: string): Promise<void>;
    setStartLevel(trackId: string, level: number): Promise<void>;
    /** Design the next few levels once the last one is complete. */
    extend(trackId: string): Promise<void>;
  };
  lessons: {
    start(input: StartLessonInput): Promise<string>;
    get(lessonId: string): Promise<Lesson | null>;
    begin(lessonId: string): Promise<void>;
    answer(input: AnswerInput): Promise<AnswerResult>;
    warmGrader(lessonId: string): Promise<void>;
    complete(lessonId: string, durationMs: number): Promise<LessonResult>;
    abandon(lessonId: string): Promise<void>;
    retry(lessonId: string): Promise<void>;
  };
  practice: {
    mistakes(): Promise<Attempt[]>;
    resolveMistake(attemptId: string): Promise<void>;
    history(filter: { trackId?: string; topicId?: string; limit?: number }): Promise<Attempt[]>;
  };
  targets: {
    create(input: NewTargetInput): Promise<string>;
    retry(targetId: string): Promise<void>;
    remove(targetId: string): Promise<void>;
    setActive(targetId: string | null): Promise<void>;
  };
  interviews: {
    start(input: StartInterviewInput): Promise<string>;
    send(interviewId: string, text: string): Promise<void>;
    retry(interviewId: string): Promise<void>;
    finish(interviewId: string): Promise<void>;
    remove(interviewId: string): Promise<void>;
  };
  chat: {
    create(input?: NewChatInput): Promise<string>;
    send(threadId: string, text: string): Promise<void>;
    retry(threadId: string): Promise<void>;
    remove(threadId: string): Promise<void>;
  };
  notes: {
    add(note: { kind: NoteKind; text: string }): Promise<void>;
    remove(noteId: string): Promise<void>;
    togglePin(noteId: string): Promise<void>;
  };
  insights: {
    generate(): Promise<void>;
  };
  jobs: {
    list(): Promise<JobInfo[]>;
    cancel(jobId: string): Promise<void>;
  };
}

/** Method names per group; the preload uses this to build the bridge. */
export const RPC_METHODS = {
  app: ['snapshot', 'info', 'openExternal', 'openDataFolder', 'exportData', 'importData', 'resetData', 'setTitleBarTheme'],
  claude: ['status', 'check', 'models', 'setApiKey'],
  profile: ['update'],
  settings: ['update'],
  onboarding: ['complete'],
  tracks: ['create', 'regenerate', 'remove', 'setActive', 'setStartLevel', 'extend'],
  lessons: ['start', 'get', 'begin', 'answer', 'warmGrader', 'complete', 'abandon', 'retry'],
  practice: ['mistakes', 'resolveMistake', 'history'],
  targets: ['create', 'retry', 'remove', 'setActive'],
  interviews: ['start', 'send', 'retry', 'finish', 'remove'],
  chat: ['create', 'send', 'retry', 'remove'],
  notes: ['add', 'remove', 'togglePin'],
  insights: ['generate'],
  jobs: ['list', 'cancel'],
} as const satisfies { [G in keyof Rpc]: readonly (keyof Rpc[G])[] };

export const RPC_CHANNEL = 'ascend:rpc';

export interface PrimerDeltaEvent {
  lessonId: string;
  delta: string;
  /** Discard what was streamed so far (it was preamble before a tool call). */
  reset?: boolean;
}

export interface ChatDeltaEvent {
  scope: 'thread' | 'interview';
  id: string;
  messageId: string;
  delta: string;
  reset?: boolean;
}

export interface NavigateEvent {
  name: string;
  params?: Record<string, string>;
}

export interface EventMap {
  snapshot: AppSnapshot;
  jobs: JobInfo[];
  lesson: Lesson;
  primerDelta: PrimerDeltaEvent;
  chatDelta: ChatDeltaEvent;
  toast: Toast;
  connection: ConnectionStatus;
  navigate: NavigateEvent;
}

export const EVENT_CHANNELS: { [K in keyof EventMap]: string } = {
  snapshot: 'ascend:evt:snapshot',
  jobs: 'ascend:evt:jobs',
  lesson: 'ascend:evt:lesson',
  primerDelta: 'ascend:evt:primer',
  chatDelta: 'ascend:evt:chat',
  toast: 'ascend:evt:toast',
  connection: 'ascend:evt:connection',
  navigate: 'ascend:evt:navigate',
};

export type AscendApi = Rpc & {
  on: { [K in keyof EventMap]: (cb: (payload: EventMap[K]) => void) => () => void };
};
