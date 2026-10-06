import type { LearnCardType, ModelOption, QuestionType, Settings } from './types';

export const APP_NAME = 'Ascend';
export const DATA_VERSION = 2;

/** Default main model (per Claude API guidance); the live list from Claude Code overrides the menu. */
export const DEFAULT_MODEL = 'claude-opus-5';

export const FALLBACK_MODELS: ModelOption[] = [
  { value: 'claude-opus-5', displayName: 'Opus 5', description: 'Deep reasoning and the richest explanations', supportsEffort: true },
  { value: 'claude-opus-5-5', displayName: 'Opus 5.5', description: 'Newest Opus model', supportsEffort: true },
  { value: 'claude-fable-5-1', displayName: 'Fable 5.1', description: 'Most capable model; slower and premium', supportsEffort: true },
  { value: 'claude-sonnet-5', displayName: 'Sonnet 5', description: 'Fast and capable for everyday practice', supportsEffort: true },
  { value: 'claude-haiku-4-5', displayName: 'Haiku 4.5', description: 'Fastest; great for quick drills and grading', supportsEffort: false },
];

export interface TrackPreset {
  key: string;
  title: string;
  emoji: string;
  color: string;
  tagline: string;
  subject: string;
  recommended?: boolean;
}

export const TRACK_PRESETS: TrackPreset[] = [
  {
    key: 'java-spring',
    title: 'Java & Spring Boot',
    emoji: '☕',
    color: '#F08A24',
    tagline: 'From Java syntax to production-grade Spring Boot microservices',
    subject:
      'Java and Spring Boot for backend engineering interviews: core Java and OOP, collections and generics, ' +
      'exceptions, functional Java (lambdas, streams), modern Java (records, sealed types, pattern matching, virtual threads), ' +
      'concurrency, JVM internals and garbage collection, Spring Framework (IoC/DI, bean lifecycle, AOP), Spring Boot ' +
      '(auto-configuration, REST APIs, validation, configuration, Actuator), Spring Data JPA and transactions, ' +
      'Spring Security, testing, microservices with Spring Cloud, performance, and production readiness.',
    recommended: true,
  },
  {
    key: 'agentic-ai',
    title: 'Agentic AI',
    emoji: '🤖',
    color: '#8B5CF6',
    tagline: 'From LLM fundamentals to production multi-agent systems',
    subject:
      'Agentic AI engineering interviews: LLM fundamentals (tokens, context windows, sampling), prompt engineering, ' +
      'structured outputs, tool use and function calling, embeddings, vector search and RAG, agent loops (ReAct, planning, ' +
      'reflection), memory and state, multi-agent orchestration, the Model Context Protocol (MCP), agent frameworks and SDKs, ' +
      'evaluation and testing of agents, guardrails, safety and security (prompt injection), observability, cost and latency ' +
      'optimisation, and production agent architecture.',
    recommended: true,
  },
  {
    key: 'system-design',
    title: 'System Design',
    emoji: '🏗️',
    color: '#0EA5E9',
    tagline: 'Design scalable systems like a senior engineer',
    subject:
      'System design interviews: requirements and estimation, APIs, load balancing, caching, databases (SQL vs NoSQL, ' +
      'sharding, replication), consistency models, queues and streaming, microservices, reliability, observability, ' +
      'and classic design problems (URL shortener, chat, feed, rate limiter, payments).',
  },
  {
    key: 'dsa-java',
    title: 'DSA in Java',
    emoji: '🧮',
    color: '#10B981',
    tagline: 'Crack coding rounds with patterns, not memorisation',
    subject:
      'Data structures and algorithms for coding interviews in Java: complexity analysis, arrays and strings, hashing, ' +
      'two pointers, sliding window, stacks and queues, linked lists, trees, heaps, graphs, recursion and backtracking, ' +
      'dynamic programming, greedy, and common problem-solving patterns.',
  },
  {
    key: 'microservices',
    title: 'Microservices & Kafka',
    emoji: '📨',
    color: '#F43F5E',
    tagline: 'Event-driven architecture that survives production',
    subject:
      'Microservices and event-driven architecture: service decomposition, REST vs gRPC, API gateways, service discovery, ' +
      'resilience patterns (circuit breaker, retries, bulkheads), distributed transactions and sagas, Apache Kafka ' +
      '(topics, partitions, consumer groups, delivery semantics, Kafka Streams), observability, and deployment.',
  },
  {
    key: 'sql',
    title: 'SQL & Databases',
    emoji: '🗄️',
    color: '#6366F1',
    tagline: 'Queries, indexes and transactions interviewers love',
    subject:
      'SQL and relational databases: joins, aggregation, window functions, subqueries and CTEs, normalisation, indexing ' +
      'and query plans, transactions and isolation levels, locking, PostgreSQL/MySQL specifics, and NoSQL trade-offs.',
  },
  {
    key: 'behavioral',
    title: 'Behavioral (STAR)',
    emoji: '🗣️',
    color: '#EAB308',
    tagline: 'Tell stories that get you hired',
    subject:
      'Behavioral interviews: the STAR method, leadership and ownership stories, conflict, failure and learning, ' +
      'influence without authority, prioritisation, and communicating technical decisions.',
  },
  {
    key: 'cloud-devops',
    title: 'Cloud & DevOps',
    emoji: '☁️',
    color: '#14B8A6',
    tagline: 'Ship, scale and operate with confidence',
    subject:
      'Cloud and DevOps for backend engineers: Docker, Kubernetes, CI/CD, infrastructure as code, AWS core services, ' +
      'networking basics, monitoring and alerting, and incident response.',
  },
];

export const TRACK_COLORS = ['#F08A24', '#8B5CF6', '#0EA5E9', '#10B981', '#F43F5E', '#6366F1', '#EAB308', '#14B8A6', '#EC4899'];

export const START_LEVEL_OPTIONS = [
  { level: 1, label: 'New to it', hint: 'Start from the foundations' },
  { level: 3, label: 'Know the basics', hint: 'Skip the absolute fundamentals' },
  { level: 5, label: 'Comfortable', hint: 'Used it on real projects' },
  { level: 7, label: 'Advanced', hint: 'Senior-level depth' },
];

/** The self-placement option closest to a level (tracks store the number). */
export function startLevelOption(level: number): (typeof START_LEVEL_OPTIONS)[number] {
  return START_LEVEL_OPTIONS.reduce((best, o) => (Math.abs(o.level - level) < Math.abs(best.level - level) ? o : best));
}

/** Every core roadmap has these mandatory levels; only once all of them are done can it grow further. */
export const CORE_LEVELS = 10;

/** Levels added each time a finished roadmap is extended, and the overall cap. */
export const EXTEND_LEVELS = 3;
export const MAX_LEVELS = 40;

/** Seconds a question must be on screen before its hint can be revealed. */
export const HINT_DELAY_SECONDS = 12;

export const LEARN_CARD_TYPES: LearnCardType[] = ['flashcard', 'steps', 'quick_check', 'sort'];

export const LEARN_CARD_META: Record<LearnCardType, { label: string; emoji: string }> = {
  flashcard: { label: 'Flashcard', emoji: '🃏' },
  steps: { label: 'Worked example', emoji: '🧭' },
  quick_check: { label: 'Quick check', emoji: '⚡' },
  sort: { label: 'Sort it out', emoji: '🗂️' },
};

export const DAILY_GOALS = [
  { xp: 20, label: 'Casual', hint: '~5 min / day' },
  { xp: 50, label: 'Regular', hint: '~15 min / day' },
  { xp: 100, label: 'Serious', hint: '~30 min / day' },
  { xp: 150, label: 'Intense', hint: '45+ min / day' },
];

export const QUESTION_TYPE_META: Record<QuestionType, { label: string; instruction: string }> = {
  mcq: { label: 'Multiple choice', instruction: 'Choose the correct answer' },
  multi_select: { label: 'Select all', instruction: 'Select all that apply' },
  true_false: { label: 'True or false', instruction: 'Is this statement true or false?' },
  fill_blank: { label: 'Fill in the blanks', instruction: 'Complete the blanks' },
  short_answer: { label: 'Short answer', instruction: 'Answer like you would in an interview' },
  ordering: { label: 'Put in order', instruction: 'Arrange these in the correct order' },
  match: { label: 'Match pairs', instruction: 'Tap the matching pairs' },
};

export const ALL_QUESTION_TYPES: QuestionType[] = ['mcq', 'multi_select', 'true_false', 'fill_blank', 'short_answer', 'ordering', 'match'];

export const DEFAULT_SETTINGS: Settings = {
  model: DEFAULT_MODEL,
  fastModel: '',
  quality: 'balanced',
  research: 'smart',
  lessonLength: 8,
  primer: 'standard',
  walkthrough: true,
  questionTypes: {
    mcq: true,
    multi_select: true,
    true_false: true,
    fill_blank: true,
    short_answer: true,
    ordering: true,
    match: true,
  },
  dailyGoalXp: 50,
  sound: true,
  theme: 'system',
  prefetch: true,
  notifications: true,
  claudePath: '',
  authMode: 'claude',
  hasApiKey: false,
};

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  emoji: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_steps', title: 'First Steps', description: 'Complete your first lesson', emoji: '🎯' },
  { id: 'flawless', title: 'Flawless', description: 'Finish a lesson with 100%', emoji: '💎' },
  { id: 'streak_3', title: 'On Fire', description: 'Reach a 3-day streak', emoji: '🔥' },
  { id: 'streak_7', title: 'Week Warrior', description: 'Reach a 7-day streak', emoji: '📅' },
  { id: 'streak_30', title: 'Unstoppable', description: 'Reach a 30-day streak', emoji: '🚀' },
  { id: 'xp_500', title: 'Rising Star', description: 'Earn 500 XP', emoji: '⭐' },
  { id: 'xp_2500', title: 'Powerhouse', description: 'Earn 2,500 XP', emoji: '⚡' },
  { id: 'xp_10000', title: 'Legend', description: 'Earn 10,000 XP', emoji: '👑' },
  { id: 'level_3', title: 'Climber', description: 'Unlock level 3 in any track', emoji: '🧗' },
  { id: 'level_6', title: 'Halfway Up', description: 'Unlock level 6 in any track', emoji: '⛰️' },
  { id: 'level_10', title: 'Summit', description: 'Unlock level 10 in any track', emoji: '🏔️' },
  { id: 'beyond', title: 'Beyond the Summit', description: 'Unlock a level past 10', emoji: '🌌' },
  { id: 'gatekeeper', title: 'Gatekeeper', description: 'Pass a level checkpoint', emoji: '🏆' },
  { id: 'deep_diver', title: 'Deep Diver', description: 'Reach 85% mastery on a topic', emoji: '🌊' },
  { id: 'centurion', title: 'Centurion', description: 'Answer 100 questions', emoji: '💯' },
  { id: 'mistake_hunter', title: 'Mistake Hunter', description: 'Finish a mistakes practice', emoji: '🧹' },
  { id: 'hot_seat', title: 'In the Hot Seat', description: 'Complete a mock interview', emoji: '🎤' },
  { id: 'offer_ready', title: 'Offer Ready', description: 'Score 80+ in a mock interview', emoji: '🤝' },
  { id: 'scout', title: 'Company Scout', description: 'Research a target company', emoji: '🔎' },
  { id: 'polymath', title: 'Polymath', description: 'Practise in 3 different tracks', emoji: '🧠' },
];

export const PASS_SCORE = 0.6;
export const CHECKPOINT_PASS_SCORE = 0.75;
export const MASTERED = 85;
