// Tracks every running agent task so the UI can show live activity and offer cancellation.
import type { ActivityKind, JobInfo, JobKind } from '@shared/types';
import { emit } from './events';
import { errorMessage, nowIso, uid } from './util';

const MAX_ACTIVITY = 40;
const KEEP_FINISHED = 25;

export class Job {
  readonly controller = new AbortController();
  readonly info: JobInfo;

  constructor(
    private readonly manager: JobManager,
    kind: JobKind,
    label: string,
    opts: { refId?: string; model: string; background?: boolean },
  ) {
    this.info = {
      id: uid('job_'),
      kind,
      label,
      refId: opts.refId,
      status: 'running',
      activity: [],
      model: opts.model,
      startedAt: nowIso(),
      background: opts.background,
    };
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get running(): boolean {
    return this.info.status === 'running';
  }

  activity(kind: ActivityKind, text: string): void {
    const last = this.info.activity.at(-1);
    if (last && last.text === text) return;
    this.info.activity.push({ at: nowIso(), kind, text });
    if (this.info.activity.length > MAX_ACTIVITY) this.info.activity.splice(0, this.info.activity.length - MAX_ACTIVITY);
    this.manager.changed();
  }

  setLabel(label: string): void {
    this.info.label = label;
    this.manager.changed();
  }

  done(): void {
    if (!this.running) return;
    this.info.status = 'done';
    this.info.endedAt = nowIso();
    this.manager.changed();
  }

  fail(error: unknown): void {
    if (!this.running) return;
    this.info.status = this.signal.aborted ? 'cancelled' : 'error';
    this.info.error = errorMessage(error);
    this.info.endedAt = nowIso();
    this.manager.changed();
  }

  cancel(): void {
    if (!this.running) return;
    this.controller.abort();
    this.info.status = 'cancelled';
    this.info.endedAt = nowIso();
    this.manager.changed();
  }
}

export class JobManager {
  private jobs: Job[] = [];
  private timer: NodeJS.Timeout | null = null;

  start(kind: JobKind, label: string, opts: { refId?: string; model: string; background?: boolean }): Job {
    const job = new Job(this, kind, label, opts);
    this.jobs.push(job);
    this.changed();
    return job;
  }

  list(): JobInfo[] {
    const running = this.jobs.filter((j) => j.running);
    const finished = this.jobs.filter((j) => !j.running).slice(-KEEP_FINISHED);
    this.jobs = [...finished, ...running];
    return this.jobs.map((j) => j.info);
  }

  cancel(jobId: string): void {
    this.jobs.find((j) => j.info.id === jobId)?.cancel();
  }

  cancelFor(refId: string): void {
    for (const job of this.jobs) if (job.info.refId === refId) job.cancel();
  }

  isRunning(kind: JobKind, refId: string): boolean {
    return this.jobs.some((j) => j.running && j.info.kind === kind && j.info.refId === refId);
  }

  cancelAll(): void {
    for (const job of this.jobs) job.cancel();
  }

  changed(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      emit('jobs', this.list());
    }, 120);
  }
}

export const jobs = new JobManager();
