// Claude Code integration: every AI feature in Ascend runs through the Claude Agent SDK,
// which drives a real Claude Code process (web tools, MCP tools, structured output).
import { app } from 'electron';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { query, startup } from '@anthropic-ai/claude-agent-sdk';
import type {
  AccountInfo,
  McpSdkServerConfigWithInstance,
  ModelInfo,
  Options,
  Query,
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
  WarmQuery,
} from '@anthropic-ai/claude-agent-sdk';
import { FALLBACK_MODELS } from '@shared/constants';
import type { ActivityKind, ConnectionStatus, EffortLevel, ModelOption } from '@shared/types';
import { emit } from '../events';
import type { Job } from '../jobs';
import { store } from '../store';
import { clamp, errorMessage, nowIso, truncate } from '../util';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type AgentErrorCode =
  | 'auth'
  | 'rate_limit'
  | 'model'
  | 'overloaded'
  | 'launch'
  | 'cancelled'
  | 'format'
  | 'busy'
  | 'unknown';

export class AgentError extends Error {
  constructor(
    message: string,
    readonly code: AgentErrorCode,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export function toAgentError(raw: string, kind: string | undefined, model: string, stderr = ''): AgentError {
  const text = `${raw}\n${stderr}`;
  if (kind === 'authentication_failed' || /not logged in|please run \/login|invalid api key|authentication_error|oauth token/i.test(text)) {
    return new AgentError(
      "Claude Code isn't signed in. Open a terminal, run `claude` and use /login — or add an API key in Settings → Claude connection.",
      'auth',
    );
  }
  if (kind === 'rate_limit' || /usage limit|rate.?limit|429|quota/i.test(text)) {
    const reset = connection.rateLimit?.resetsAt ? ` (resets ${new Date(connection.rateLimit.resetsAt * 1000).toLocaleString()})` : '';
    return new AgentError(`You've reached your Claude usage limit${reset}. Try again later or pick a lighter model in Settings.`, 'rate_limit');
  }
  if (kind === 'model_not_found' || /model.{0,40}(not found|not available|does not exist|invalid)|invalid model|unknown model/i.test(text)) {
    return new AgentError(`The model “${model}” isn't available for your account. Choose another model in Settings.`, 'model');
  }
  if (kind === 'overloaded' || /overloaded|529/i.test(text)) {
    return new AgentError('Claude is overloaded right now. Please retry in a moment.', 'overloaded');
  }
  if (/ENOENT|EACCES|not found at|failed to launch|spawn/i.test(text)) {
    return new AgentError(`Couldn't start Claude Code. Check Settings → Claude Code executable. (${truncate(raw, 160)})`, 'launch');
  }
  return new AgentError(truncate(raw || 'Claude Code stopped unexpectedly.', 400), 'unknown');
}

// ---------------------------------------------------------------------------
// Environment, executable, effort
// ---------------------------------------------------------------------------

let workspace = '';

export function workspaceDir(): string {
  if (!workspace) {
    workspace = path.join(app.getPath('userData'), 'agent-workspace');
    fs.mkdirSync(workspace, { recursive: true });
  }
  return workspace;
}

/** The SDK ships Claude Code as a native binary; in a packaged app it lives in app.asar.unpacked. */
export function resolveClaudeExecutable(): string | undefined {
  const custom = store.data.settings.claudePath.trim();
  if (custom) return custom;
  try {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
    const bin = path.join(path.dirname(pkgJson), process.platform === 'win32' ? 'claude.exe' : 'claude');
    const unpacked = bin.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    if (fs.existsSync(unpacked)) return unpacked;
  } catch {
    // Fall back to the SDK's own resolution.
  }
  return undefined;
}

function buildEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_AGENT_SDK_CLIENT_APP: `ascend-coach/${app.getVersion()}`,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const { authMode } = store.data.settings;
  const key = authMode === 'apiKey' ? store.getApiKey() : null;
  if (key) env.ANTHROPIC_API_KEY = key;
  return env;
}

const EFFORT_ORDER: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export function effortFor(model: string, base: EffortLevel | undefined): EffortLevel | undefined {
  if (!base) return undefined;
  const info = findModel(model);
  if (info?.supportsEffort === false) return undefined;
  if (!info && /haiku/i.test(model)) return undefined;
  const shift = { speed: -1, balanced: 0, quality: 1 }[store.data.settings.quality] ?? 0;
  let effort = EFFORT_ORDER[clamp(EFFORT_ORDER.indexOf(base) + shift, 0, 3)];
  const supported = info?.effortLevels;
  if (supported?.length && !supported.includes(effort)) {
    effort = [...supported].sort(
      (a, b) => Math.abs(EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(effort)) - Math.abs(EFFORT_ORDER.indexOf(b) - EFFORT_ORDER.indexOf(effort)),
    )[0];
  }
  return effort;
}

export function mainModel(): string {
  return store.data.settings.model;
}

export function fastModel(): string {
  return store.data.settings.fastModel || store.data.settings.model;
}

interface OptionParams {
  system: string;
  model: string;
  effort?: EffortLevel;
  schema?: Record<string, unknown>;
  web?: boolean;
  mcp?: { server: McpSdkServerConfigWithInstance; tools: string[] };
  maxTurns?: number;
  stream?: boolean;
  persist?: boolean;
  resume?: string;
  controller: AbortController;
  onStderr?: (line: string) => void;
}

function buildOptions(p: OptionParams): Options {
  const builtins = p.web ? ['WebSearch', 'WebFetch'] : [];
  const options: Options = {
    cwd: workspaceDir(),
    model: p.model,
    systemPrompt: p.system,
    tools: builtins,
    allowedTools: [...builtins, ...(p.mcp?.tools ?? [])],
    settingSources: [],
    strictMcpConfig: true,
    permissionMode: 'dontAsk',
    persistSession: p.persist ?? false,
    includePartialMessages: p.stream ?? false,
    maxTurns: p.maxTurns ?? 12,
    abortController: p.controller,
    env: buildEnv(),
    verbatimPrompts: true,
    stderr: (data) => p.onStderr?.(data),
  };
  const exe = resolveClaudeExecutable();
  if (exe) options.pathToClaudeCodeExecutable = exe;
  const effort = effortFor(p.model, p.effort);
  if (effort) options.effort = effort;
  if (p.mcp) options.mcpServers = { coach: p.mcp.server };
  if (p.schema) options.outputFormat = { type: 'json_schema', schema: p.schema };
  if (p.resume) options.resume = p.resume;
  return options;
}

// ---------------------------------------------------------------------------
// Connection status, models, rate limits
// ---------------------------------------------------------------------------

let connection: ConnectionStatus = { state: 'unknown' };
let models: ModelOption[] = [];
let checking: Promise<ConnectionStatus> | null = null;

export function getConnection(): ConnectionStatus {
  return connection;
}

function setConnection(patch: Partial<ConnectionStatus>): void {
  connection = { ...connection, ...patch };
  emit('connection', connection);
}

export function cachedModels(): ModelOption[] {
  return models.length ? models : FALLBACK_MODELS;
}

function findModel(model: string): ModelOption | undefined {
  return cachedModels().find((m) => m.value === model || m.resolvedModel === model);
}

function toModelOption(info: ModelInfo): ModelOption {
  return {
    value: info.value,
    displayName: info.displayName,
    description: info.description,
    resolvedModel: info.resolvedModel,
    supportsEffort: info.supportsEffort,
    effortLevels: info.supportedEffortLevels,
  };
}

function noteRateLimit(info: { status: string; resetsAt?: number; rateLimitType?: string; utilization?: number }): void {
  setConnection({ rateLimit: { status: info.status, resetsAt: info.resetsAt, type: info.rateLimitType, utilization: info.utilization } });
}

function describeAuth(apiKeySource: string | undefined, account: AccountInfo): string {
  if (apiKeySource === 'ANTHROPIC_API_KEY') return 'Anthropic API key';
  if (apiKeySource === '/login managed key') return 'Console API key (via /login)';
  if (apiKeySource === 'apiKeyHelper') return 'API key helper';
  if (account.apiProvider && account.apiProvider !== 'firstParty') return `${account.apiProvider} credentials`;
  return account.subscriptionType ? `${account.subscriptionType} login` : 'Claude login';
}

/** Runs a tiny query to verify auth + model, and refreshes the model list from Claude Code. */
export function checkConnection(): Promise<ConnectionStatus> {
  if (checking) return checking;
  checking = (async () => {
    setConnection({ state: 'checking', error: undefined });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const model = mainModel();
    let stderr = '';
    try {
      const q = query({
        prompt: 'Reply with the single word: ready',
        options: buildOptions({
          system: 'You are a connectivity check. Reply with exactly one word.',
          model,
          effort: 'low',
          maxTurns: 1,
          controller,
          onStderr: (l) => (stderr = (stderr + l).slice(-2000)),
        }),
      });
      let meta: Promise<[AccountInfo, ModelInfo[]]> | undefined;
      let version: string | undefined;
      let authSource: string | undefined;
      let resolvedModel: string | undefined;
      let result: SDKResultMessage | undefined;
      let assistantError: string | undefined;
      for await (const m of q) {
        if (!meta) meta = Promise.all([q.accountInfo().catch(() => ({})), q.supportedModels().catch(() => [])]);
        if (m.type === 'system' && m.subtype === 'init') {
          version = m.claude_code_version;
          authSource = m.apiKeySource;
          resolvedModel = m.model;
        } else if (m.type === 'assistant' && m.error) assistantError = m.error;
        else if (m.type === 'rate_limit_event') noteRateLimit(m.rate_limit_info);
        else if (m.type === 'result') result = m;
      }
      const [account, modelInfos] = meta ? await meta : [{} as AccountInfo, [] as ModelInfo[]];
      if (modelInfos.length) models = modelInfos.map(toModelOption);
      const base: Partial<ConnectionStatus> = {
        checkedAt: nowIso(),
        email: account.email,
        organization: account.organization,
        subscription: account.subscriptionType,
        authSource: describeAuth(authSource, account),
        claudeVersion: version,
        model: resolvedModel,
      };
      if (!result || result.subtype !== 'success' || result.is_error) {
        const raw = result ? (result.subtype === 'success' ? result.result : result.errors.join('; ')) : 'No response from Claude Code';
        setConnection({ ...base, state: 'error', error: toAgentError(raw, assistantError, model, stderr).message });
      } else {
        recordUsage(result);
        setConnection({ ...base, state: 'connected', error: undefined });
      }
    } catch (error) {
      const message = controller.signal.aborted ? 'Timed out while contacting Claude Code.' : toAgentError(errorMessage(error), undefined, model, stderr).message;
      setConnection({ state: 'error', checkedAt: nowIso(), error: message });
    } finally {
      clearTimeout(timeout);
      checking = null;
    }
    return connection;
  })();
  return checking;
}

// ---------------------------------------------------------------------------
// Usage accounting
// ---------------------------------------------------------------------------

interface UsageBaseline {
  cost: number;
  perModel: Record<string, { input: number; output: number; web: number; cost: number }>;
}

/** Records a result's usage. Live sessions report cumulative totals, so they pass a baseline to diff against. */
function recordUsage(result: SDKResultMessage, baseline?: UsageBaseline): void {
  store.mutate((d) => {
    const cost = result.total_cost_usd || 0;
    d.usage.calls += 1;
    d.usage.costUsd += Math.max(0, cost - (baseline?.cost ?? 0));
    for (const [model, u] of Object.entries(result.modelUsage ?? {})) {
      const input = u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
      const prev = baseline?.perModel[model] ?? { input: 0, output: 0, web: 0, cost: 0 };
      d.usage.inputTokens += Math.max(0, input - prev.input);
      d.usage.outputTokens += Math.max(0, u.outputTokens - prev.output);
      d.usage.webSearches += Math.max(0, u.webSearchRequests - prev.web);
      const row = (d.usage.byModel[model] ??= { calls: 0, costUsd: 0 });
      row.calls += 1;
      row.costUsd += Math.max(0, u.costUSD - prev.cost);
      if (baseline) baseline.perModel[model] = { input, output: u.outputTokens, web: u.webSearchRequests, cost: u.costUSD };
    }
    if (baseline) baseline.cost = cost;
  });
}

// ---------------------------------------------------------------------------
// Activity: turn tool calls into friendly, live status lines
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  mcp__coach__get_learner_profile: 'Reviewing your learner profile',
  mcp__coach__get_recent_mistakes: 'Looking at your recent mistakes',
  mcp__coach__record_coach_note: 'Saving a note to your profile',
  mcp__coach__suggest_practice: 'Preparing a practice session for you',
  mcp__coach__schedule_review: 'Scheduling a review',
  StructuredOutput: 'Packaging everything up',
};

function hostOf(url: unknown): string {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '');
  } catch {
    return 'a web page';
  }
}

export function describeTool(name: string, input: Record<string, unknown>): { kind: ActivityKind; text: string } {
  if (name === 'WebSearch') return { kind: 'search', text: `Searching the web: “${truncate(String(input.query ?? ''), 80)}”` };
  if (name === 'WebFetch') return { kind: 'fetch', text: `Reading ${hostOf(input.url)}` };
  if (name === 'mcp__coach__get_topic_mastery') return { kind: 'tool', text: `Checking your mastery of “${truncate(String(input.query ?? ''), 50)}”` };
  if (name === 'StructuredOutput') return { kind: 'writing', text: TOOL_LABELS[name] };
  return { kind: 'tool', text: TOOL_LABELS[name] ?? `Using ${name.replace(/^mcp__\w+__/, '')}` };
}

class ActivityTracker {
  private thinkingShown = false;
  private writingShown = false;

  constructor(private readonly job: Job) {}

  handle(m: SDKMessage, cb: { onText?: (delta: string) => void; onToolUse?: (name: string) => void } = {}): void {
    const { onText, onToolUse } = cb;
    if (m.type === 'assistant' && !m.parent_tool_use_id) {
      for (const block of m.message.content) {
        if (block.type === 'tool_use') {
          const { kind, text } = describeTool(block.name, (block.input ?? {}) as Record<string, unknown>);
          this.job.activity(kind, text);
          this.thinkingShown = false;
          this.writingShown = false;
          onToolUse?.(block.name);
        } else if (block.type === 'thinking' && !this.thinkingShown) {
          this.thinkingShown = true;
          this.job.activity('thinking', 'Thinking it through…');
        }
      }
    } else if (m.type === 'stream_event' && !m.parent_tool_use_id) {
      const ev = m.event;
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        if (!this.writingShown) {
          this.writingShown = true;
          this.job.activity('writing', 'Writing…');
        }
        onText?.(ev.delta.text);
      }
    } else if (m.type === 'system' && m.subtype === 'api_retry') {
      this.job.activity('retry', `Claude is busy — retrying (${m.attempt}/${m.max_retries})…`);
    } else if (m.type === 'rate_limit_event') {
      noteRateLimit(m.rate_limit_info);
    }
  }
}

function resultText(result: SDKResultMessage): string {
  return result.subtype === 'success' ? result.result : result.errors.join('; ') || result.subtype;
}

function tryParseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[[{]/);
  if (start < 0) return undefined;
  try {
    return JSON.parse(candidate.slice(start));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// One-shot agent tasks
// ---------------------------------------------------------------------------

export interface AgentTask {
  job: Job;
  system: string;
  prompt: string;
  model: string;
  effort?: EffortLevel;
  schema?: Record<string, unknown>;
  web?: boolean;
  mcp?: { server: McpSdkServerConfigWithInstance; tools: string[] };
  maxTurns?: number;
  onText?: (delta: string) => void;
  onToolUse?: (name: string) => void;
  warm?: WarmHandle | null;
}

export interface AgentOutput<T> {
  text: string;
  data: T | undefined;
  sessionId?: string;
  costUsd: number;
}

export async function runAgent<T = unknown>(task: AgentTask): Promise<AgentOutput<T>> {
  const { job } = task;
  let stderr = '';
  let q: Query;
  if (task.warm) {
    const warm = task.warm;
    job.signal.addEventListener('abort', () => warm.controller.abort(), { once: true });
    q = warm.warm.query(task.prompt);
  } else {
    q = query({
      prompt: task.prompt,
      options: buildOptions({
        system: task.system,
        model: task.model,
        effort: task.effort,
        schema: task.schema,
        web: task.web,
        mcp: task.mcp,
        maxTurns: task.maxTurns,
        stream: !!task.onText,
        controller: job.controller,
        onStderr: (l) => (stderr = (stderr + l).slice(-4000)),
      }),
    });
    job.activity('status', 'Starting Claude Code…');
  }
  const tracker = new ActivityTracker(job);
  let result: SDKResultMessage | undefined;
  let assistantError: string | undefined;
  try {
    for await (const m of q) {
      tracker.handle(m, { onText: task.onText, onToolUse: task.onToolUse });
      if (m.type === 'assistant' && m.error) assistantError = m.error;
      if (m.type === 'result') result = m;
    }
  } catch (error) {
    if (job.signal.aborted) throw new AgentError('Cancelled', 'cancelled');
    throw toAgentError(errorMessage(error), assistantError, task.model, stderr);
  }
  if (job.signal.aborted) throw new AgentError('Cancelled', 'cancelled');
  if (!result) throw toAgentError('Claude Code exited without a result.', assistantError, task.model, stderr);
  recordUsage(result);
  if (result.subtype !== 'success' || result.is_error) {
    throw toAgentError(resultText(result), assistantError, task.model, stderr);
  }
  let data: T | undefined;
  if (task.schema) {
    data = (result.structured_output ?? tryParseJson(result.result)) as T | undefined;
    if (!data || typeof data !== 'object') throw new AgentError('Claude returned an unexpected format. Please retry.', 'format');
  }
  return { text: result.result, data, sessionId: result.session_id, costUsd: result.total_cost_usd };
}

// ---------------------------------------------------------------------------
// Pre-warmed processes (hide Claude Code start-up time for latency-sensitive calls)
// ---------------------------------------------------------------------------

export interface WarmHandle {
  warm: WarmQuery;
  controller: AbortController;
}

export async function warmStart(p: {
  system: string;
  model: string;
  effort?: EffortLevel;
  schema?: Record<string, unknown>;
}): Promise<WarmHandle | null> {
  try {
    const controller = new AbortController();
    const warm = await startup({
      options: buildOptions({ ...p, maxTurns: 4, controller }),
      initializeTimeoutMs: 45_000,
    });
    return { warm, controller };
  } catch (error) {
    console.warn('[agent] warm start failed', errorMessage(error));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Live multi-turn sessions (mock interviews, coach chat)
// ---------------------------------------------------------------------------

export interface LiveSessionConfig {
  system: string;
  model: string;
  effort?: EffortLevel;
  web?: boolean;
  mcp?: { server: McpSdkServerConfigWithInstance; tools: string[] };
  resume?: string;
  maxTurns?: number;
}

export interface TurnOutput {
  text: string;
  tools: string[];
}

interface Turn {
  job: Job;
  onText?: (delta: string) => void;
  onToolUse?: (name: string) => void;
  resolve: (out: TurnOutput) => void;
  reject: (err: AgentError) => void;
  tools: string[];
  tracker: ActivityTracker;
  assistantError?: string;
}

const IDLE_CLOSE_MS = 12 * 60_000;

/**
 * Keeps one Claude Code process alive across turns (streaming input), so replies
 * start fast. If the process exits or idles out, the next turn resumes the session.
 */
export class LiveSession {
  private queue: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  private generation = 0;
  private q: Query | null = null;
  private controller = new AbortController();
  private turn: Turn | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private baseline: UsageBaseline = { cost: 0, perModel: {} };
  private stderr = '';
  sessionId?: string;

  constructor(private readonly config: LiveSessionConfig) {
    this.sessionId = config.resume;
  }

  get busy(): boolean {
    return !!this.turn;
  }

  send(
    text: string,
    job: Job,
    callbacks: { onText?: (delta: string) => void; onToolUse?: (name: string) => void } = {},
  ): Promise<TurnOutput> {
    if (this.turn) return Promise.reject(new AgentError('Still working on the previous reply.', 'busy'));
    this.clearIdle();
    this.ensureStarted();
    return new Promise<TurnOutput>((resolve, reject) => {
      this.turn = { job, ...callbacks, resolve, reject, tools: [], tracker: new ActivityTracker(job) };
      job.signal.addEventListener(
        'abort',
        () => {
          this.q?.interrupt().catch(() => undefined);
          this.finishTurn(new AgentError('Cancelled', 'cancelled'));
        },
        { once: true },
      );
      this.queue.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        origin: { kind: 'human' },
      } as SDKUserMessage);
      this.wake?.();
    });
  }

  private ensureStarted(): void {
    if (this.q) return;
    const gen = ++this.generation;
    this.controller = new AbortController();
    this.baseline = { cost: 0, perModel: {} };
    this.q = query({
      prompt: this.input(gen),
      options: buildOptions({
        ...this.config,
        resume: this.sessionId,
        persist: true,
        stream: true,
        maxTurns: this.config.maxTurns ?? 20,
        controller: this.controller,
        onStderr: (l) => (this.stderr = (this.stderr + l).slice(-4000)),
      }),
    });
    void this.pump(this.q, gen);
  }

  private async *input(gen: number): AsyncGenerator<SDKUserMessage> {
    while (gen === this.generation) {
      const next = this.queue.shift();
      if (next) {
        yield next;
        continue;
      }
      await new Promise<void>((resolve) => (this.wake = resolve));
      this.wake = null;
    }
  }

  private async pump(q: Query, gen: number): Promise<void> {
    try {
      for await (const m of q) {
        if (m.type === 'system' && m.subtype === 'init') {
          this.sessionId = m.session_id;
          continue;
        }
        const t = this.turn;
        if (!t) continue;
        t.tracker.handle(m, { onText: t.onText, onToolUse: t.onToolUse });
        if (m.type === 'assistant' && !m.parent_tool_use_id) {
          if (m.error) t.assistantError = m.error;
          for (const block of m.message.content) if (block.type === 'tool_use') t.tools.push(block.name);
        } else if (m.type === 'result') {
          recordUsage(m, this.baseline);
          if (m.subtype === 'success' && !m.is_error) this.finishTurn(null, { text: m.result, tools: t.tools });
          else this.finishTurn(toAgentError(resultText(m), t.assistantError, this.config.model, this.stderr));
        }
      }
      this.finishTurn(toAgentError('The Claude Code session ended unexpectedly.', undefined, this.config.model, this.stderr));
    } catch (error) {
      this.finishTurn(toAgentError(errorMessage(error), this.turn?.assistantError, this.config.model, this.stderr));
    } finally {
      if (gen === this.generation) {
        this.q = null;
        this.queue = [];
      }
    }
  }

  private finishTurn(error: AgentError | null, out?: TurnOutput): void {
    const t = this.turn;
    if (!t) return;
    this.turn = null;
    if (error) t.reject(error);
    else t.resolve(out ?? { text: '', tools: [] });
    this.scheduleIdle();
  }

  private scheduleIdle(): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => this.stop(), IDLE_CLOSE_MS);
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  /** Ends the current process; a later send() resumes the same session. */
  stop(): void {
    this.clearIdle();
    this.generation++;
    this.wake?.();
    const q = this.q;
    this.q = null;
    this.queue = [];
    try {
      q?.close();
    } catch {
      // already closed
    }
  }
}
