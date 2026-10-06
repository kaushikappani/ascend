// Domain model shared by the main process (source of truth) and the renderer.

export type ISODate = string; // full ISO timestamp
export type DayKey = string; // local calendar day, YYYY-MM-DD

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type QuestionType =
  | 'mcq'
  | 'multi_select'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'ordering'
  | 'match';

export interface MatchPair {
  left: string;
  right: string;
}

/** One exercise. Type-specific fields are optional and validated per type. */
export interface Question {
  id: string;
  type: QuestionType;
  /** Markdown question text. For fill_blank, blanks are written as `___`. */
  prompt: string;
  code?: string;
  codeLanguage?: string;
  options?: string[]; // mcq, multi_select
  correctIndex?: number; // mcq
  correctIndices?: number[]; // multi_select
  answer?: boolean; // true_false
  blanks?: string[][]; // fill_blank: accepted answers for each blank, in order
  wordBank?: string[]; // fill_blank: chips (all answers + distractors)
  items?: string[]; // ordering: items in the correct order
  pairs?: MatchPair[]; // match
  keyPoints?: string[]; // short_answer rubric
  sampleAnswer?: string; // short_answer model answer
  explanation: string;
  optionFeedback?: string[]; // why each option is right/wrong
  hint?: string;
  interviewTip?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  concepts: string[];
  /** Topic this question exercises (interleaved review questions may target earlier topics). */
  topicId?: string;
}

export type UserAnswer =
  | { type: 'mcq'; index: number }
  | { type: 'multi_select'; indices: number[] }
  | { type: 'true_false'; value: boolean }
  | { type: 'fill_blank'; values: string[] }
  | { type: 'short_answer'; text: string }
  | { type: 'ordering'; sequence: string[] }
  | { type: 'match'; mistakes: number }
  | { type: 'skip' };

export type Verdict = 'correct' | 'partial' | 'incorrect';

export interface AnswerResult {
  verdict: Verdict;
  correct: boolean;
  score: number; // 0..1
  feedback?: string;
  missing?: string[];
  modelAnswer?: string;
  /** Per-blank correctness for fill_blank, per-slot for ordering. */
  parts?: boolean[];
  /** A typed answer was accepted despite a small typo. */
  typoAccepted?: boolean;
}

export interface AnswerRecord {
  answer: UserAnswer;
  result: AnswerResult;
  timeMs: number;
  at: ISODate;
  /** The learner revealed the hint before answering (half XP, weaker mastery evidence). */
  hintUsed?: boolean;
}

// ---------------------------------------------------------------------------
// Tracks & roadmap
// ---------------------------------------------------------------------------

export type TrackKind = 'core' | 'custom' | 'target';

export interface Topic {
  id: string;
  title: string;
  summary: string;
  concepts: string[];
  interviewFocus?: string;
  /** Inserted by the coach to remediate a weakness. */
  addedByCoach?: boolean;
  reason?: string;
}

export interface Level {
  number: number; // 1-based
  title: string;
  summary: string;
  topics: Topic[];
}

export interface Track {
  id: string;
  kind: TrackKind;
  title: string;
  subject: string;
  tagline: string;
  emoji: string;
  color: string;
  levels: Level[];
  /** Levels up to this number are unlocked from the start (self-placement). */
  startLevel: number;
  /**
   * Where level 1 of this roadmap sits on the absolute 1-10 scale: the learner's self-assessed
   * starting point, so a "Comfortable" learner's level 1 already assumes working knowledge.
   * Unset for roadmaps designed before calibration (level 1 = absolute foundations).
   */
  baseLevel?: number;
  status: 'generating' | 'ready' | 'error';
  error?: string;
  targetId?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ConceptStat {
  attempts: number;
  correct: number;
  strength: number; // 0..100 moving average
  lastSeen: ISODate;
}

export interface SrsState {
  reps: number;
  interval: number; // days
  ease: number;
  due?: DayKey;
}

export interface TopicProgress {
  topicId: string;
  trackId: string;
  mastery: number; // 0..100
  attempts: number;
  correct: number;
  lessonsCompleted: number;
  bestScore: number; // 0..1
  completed: boolean;
  testedOut?: boolean;
  /** A regular lesson on this topic was opened (drives where "Up next" points). */
  lessonStarted?: boolean;
  lastPracticedAt?: ISODate;
  srs: SrsState;
  concepts: Record<string, ConceptStat>;
}

export interface CheckpointState {
  passed: boolean;
  bestScore: number;
  at: ISODate;
}

export interface TrackProgress {
  trackId: string;
  checkpoints: Record<number, CheckpointState>;
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export type LessonKind = 'lesson' | 'review' | 'checkpoint' | 'weakspots' | 'mistakes' | 'custom' | 'rapid';

export type GenStatus = 'none' | 'pending' | 'streaming' | 'ready' | 'error';

export interface Debrief {
  status: 'pending' | 'ready' | 'error';
  headline?: string;
  summary?: string;
  strengths?: string[];
  focusNext?: string[];
  nextStep?: string;
  remedialTopicTitle?: string;
}

export interface LessonResult {
  score: number;
  correctCount: number;
  total: number;
  xp: number;
  durationMs: number;
  masteryBefore: number;
  masteryAfter: number;
  passed: boolean;
  levelUnlocked?: number;
  /** This lesson finished the roadmap's last level; more levels are being designed. */
  trackCompleted?: boolean;
  achievements: string[];
  goalReached?: boolean;
  debrief?: Debrief;
}

// ---------------------------------------------------------------------------
// Hands-on walkthrough (interactive cards between the primer and the questions)
// ---------------------------------------------------------------------------

export type LearnCardType = 'flashcard' | 'steps' | 'quick_check' | 'sort';

/** One interactive learning card. Ungraded: it prepares the learner for the questions. */
export interface LearnCard {
  id: string;
  type: LearnCardType;
  title: string;
  /** Markdown. flashcard: the recall prompt; steps: the scenario; quick_check: the question; sort: the instruction. */
  prompt: string;
  code?: string;
  codeLanguage?: string;
  answer?: string; // flashcard: revealed on the back
  steps?: string[]; // steps: revealed one at a time
  options?: string[]; // quick_check
  correctIndex?: number; // quick_check
  buckets?: string[]; // sort: exactly two bucket names
  items?: { text: string; bucket: number }[]; // sort
  /** Takeaway shown once the learner has interacted. */
  explanation?: string;
}

export interface Source {
  title: string;
  url: string;
}

export interface Lesson {
  id: string;
  kind: LessonKind;
  trackId: string;
  topicId?: string;
  level?: number;
  title: string;
  subtitle?: string;
  focus?: string;
  primer?: string;
  primerStatus: GenStatus;
  walkthrough?: LearnCard[];
  walkthroughStatus: GenStatus;
  questions: Question[];
  questionsStatus: GenStatus;
  error?: string;
  /** Generation was cut off by the app closing; resumed automatically on the next launch. */
  interrupted?: boolean;
  status: 'generating' | 'ready' | 'in_progress' | 'completed' | 'abandoned';
  prefetched?: boolean;
  model: string;
  masteryAtStart?: number;
  /** For "fix my mistakes" sessions: the attempts being revisited. */
  sourceAttemptIds?: string[];
  createdAt: ISODate;
  startedAt?: ISODate;
  completedAt?: ISODate;
  answers: Record<string, AnswerRecord>;
  result?: LessonResult;
  sources?: Source[];
}

/** Lightweight lesson row included in snapshots. */
export type LessonSummary = Omit<Lesson, 'primer' | 'walkthrough' | 'questions' | 'answers'> & { questionCount: number; answeredCount: number };

export interface Attempt {
  id: string;
  lessonId: string;
  lessonKind: LessonKind;
  trackId: string;
  topicId?: string;
  questionId: string;
  type: QuestionType;
  difficulty: number;
  concepts: string[];
  prompt: string;
  correct: boolean;
  score: number;
  userAnswerText: string;
  correctAnswerText: string;
  explanation: string;
  at: ISODate;
  hintUsed?: boolean;
  resolved?: boolean;
  question?: Question;
}

// ---------------------------------------------------------------------------
// Coach memory
// ---------------------------------------------------------------------------

export type NoteKind = 'strength' | 'weakness' | 'insight' | 'plan';

export interface CoachNote {
  id: string;
  kind: NoteKind;
  text: string;
  trackId?: string;
  topicId?: string;
  source: 'lesson' | 'interview' | 'chat' | 'target' | 'system';
  createdAt: ISODate;
  pinned?: boolean;
}

export interface Insight {
  id: string;
  createdAt: ISODate;
  headline: string;
  summary: string;
  wins: string[];
  risks: string[];
  plan: { when: string; focus: string }[];
  readiness: { area: string; score: number; comment: string }[];
}

// ---------------------------------------------------------------------------
// Company targets
// ---------------------------------------------------------------------------

export interface CompanyBrief {
  overview: string;
  techStack: string[];
  interviewProcess: { stage: string; description: string; tips?: string }[];
  values: { name: string; howToShow: string }[];
  recentNews: string[];
  roleSummary: string;
  mustHave: string[];
  niceToHave: string[];
  keywords: string[];
  skillGaps: {
    skill: string;
    importance: 'critical' | 'high' | 'medium' | 'low';
    currentLevel: 'none' | 'basic' | 'intermediate' | 'strong';
    gap: string;
    action: string;
  }[];
  prepPlan: { day: string; focus: string; tasks: string[] }[];
  likelyQuestions: {
    category: 'technical' | 'behavioral' | 'system_design' | 'coding' | 'company';
    question: string;
    whyAsked: string;
    answerHints: string[];
  }[];
  tips: string[];
  sources: Source[];
  readinessEstimate: number;
}

export interface Target {
  id: string;
  company: string;
  role: string;
  seniority?: string;
  location?: string;
  jobDescription: string;
  interviewDate?: DayKey;
  notes?: string;
  status: 'researching' | 'building' | 'ready' | 'error';
  error?: string;
  brief?: CompanyBrief;
  trackId?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------------------------------------------------------------------------
// Conversations (mock interviews and coach chat)
// ---------------------------------------------------------------------------

export interface CoachAction {
  id: string;
  kind: 'practice';
  title: string;
  focus: string;
  trackId: string;
  topicId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: ISODate;
  pending?: boolean;
  error?: boolean;
  questionNumber?: number;
  followUp?: boolean;
  tools?: string[];
  actions?: CoachAction[];
}

export type InterviewStyle = 'technical' | 'behavioral' | 'system_design' | 'rapid_fire' | 'mixed';
export type InterviewDifficulty = 'auto' | 'junior' | 'mid' | 'senior' | 'staff';
export type InterviewPersona = 'friendly' | 'neutral' | 'tough';

export interface Scorecard {
  overall: number;
  verdict: 'strong_hire' | 'hire' | 'lean_hire' | 'lean_no_hire' | 'no_hire';
  summary: string;
  dimensions: { name: string; score: number; comment: string }[];
  questions: { question: string; score: number; feedback: string; idealAnswer: string }[];
  strengths: string[];
  improvements: string[];
  focusTopics: string[];
}

export interface InterviewSession {
  id: string;
  title: string;
  trackId?: string;
  targetId?: string;
  style: InterviewStyle;
  difficulty: InterviewDifficulty;
  persona: InterviewPersona;
  questionCount: number;
  asked: number;
  focus?: string;
  messages: ChatMessage[];
  status: 'active' | 'scoring' | 'completed' | 'error';
  error?: string;
  claudeSessionId?: string;
  scorecard?: Scorecard;
  model: string;
  startedAt: ISODate;
  endedAt?: ISODate;
  xp?: number;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  claudeSessionId?: string;
  contextLabel?: string;
  context?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------------------------------------------------------------------------
// Profile, settings, stats
// ---------------------------------------------------------------------------

export interface Profile {
  name: string;
  currentRole: string;
  experienceYears: number;
  targetRole: string;
  goals: string;
  timeline: string;
  onboarded: boolean;
  createdAt: ISODate;
  activeTrackId?: string;
  activeTargetId?: string;
}

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type QualityMode = 'speed' | 'balanced' | 'quality';
export type ResearchMode = 'off' | 'smart' | 'always';
export type PrimerDepth = 'off' | 'brief' | 'standard' | 'deep';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface Settings {
  model: string;
  fastModel: string; // '' means "same as main model"
  quality: QualityMode;
  research: ResearchMode;
  lessonLength: number;
  primer: PrimerDepth;
  /** Hands-on walkthrough between the primer and the questions. */
  walkthrough: boolean;
  questionTypes: Record<QuestionType, boolean>;
  dailyGoalXp: number;
  sound: boolean;
  theme: ThemeMode;
  prefetch: boolean;
  notifications: boolean;
  claudePath: string; // '' means the SDK's bundled Claude Code
  authMode: 'claude' | 'apiKey';
  hasApiKey: boolean;
}

export interface Stats {
  xp: number;
  xpByDay: Record<DayKey, number>;
  minutesByDay: Record<DayKey, number>;
  streak: { current: number; longest: number; lastDay?: DayKey };
  lessonsCompleted: number;
  questionsAnswered: number;
  correctAnswers: number;
  perfectLessons: number;
  interviewsCompleted: number;
  achievements: Record<string, ISODate>;
}

export interface Usage {
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  byModel: Record<string, { calls: number; costUsd: number }>;
}

export interface AppData {
  version: number;
  profile: Profile;
  settings: Settings;
  tracks: Track[];
  topicProgress: Record<string, TopicProgress>;
  trackProgress: Record<string, TrackProgress>;
  lessons: Record<string, Lesson>;
  attempts: Attempt[];
  notes: CoachNote[];
  insights: Insight[];
  targets: Target[];
  interviews: InterviewSession[];
  threads: ChatThread[];
  stats: Stats;
  usage: Usage;
}

/** What the renderer receives: everything except heavy lesson bodies and the raw attempt log. */
export interface AppSnapshot extends Omit<AppData, 'lessons' | 'attempts'> {
  lessons: LessonSummary[];
  mistakesCount: number;
  dueReviews: number;
}

// ---------------------------------------------------------------------------
// Agent jobs & connection
// ---------------------------------------------------------------------------

export type JobKind =
  | 'connection'
  | 'roadmap'
  | 'primer'
  | 'walkthrough'
  | 'questions'
  | 'grade'
  | 'debrief'
  | 'target'
  | 'interview'
  | 'scorecard'
  | 'chat'
  | 'insight';

export type ActivityKind = 'status' | 'search' | 'fetch' | 'tool' | 'thinking' | 'writing' | 'retry';

export interface ActivityItem {
  at: ISODate;
  kind: ActivityKind;
  text: string;
}

export interface JobInfo {
  id: string;
  kind: JobKind;
  label: string;
  refId?: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  activity: ActivityItem[];
  model: string;
  startedAt: ISODate;
  endedAt?: ISODate;
  error?: string;
  background?: boolean;
}

export interface ModelOption {
  value: string;
  displayName: string;
  description: string;
  resolvedModel?: string;
  supportsEffort?: boolean;
  effortLevels?: EffortLevel[];
}

export interface ConnectionStatus {
  state: 'unknown' | 'checking' | 'connected' | 'error';
  checkedAt?: ISODate;
  email?: string;
  organization?: string;
  subscription?: string;
  authSource?: string;
  claudeVersion?: string;
  model?: string;
  error?: string;
  rateLimit?: { status: string; resetsAt?: number; type?: string; utilization?: number };
}

export interface AppInfo {
  version: string;
  dataDir: string;
  claudePath: string;
  platform: string;
  electron: string;
}

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error' | 'achievement';
  title: string;
  body?: string;
  action?: { label: string; route: string; params?: Record<string, string> };
}
