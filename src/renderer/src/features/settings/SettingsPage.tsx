import { CircleAlert, CircleCheck, Download, FolderOpen, KeyRound, LoaderCircle, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ALL_QUESTION_TYPES, DAILY_GOALS, FALLBACK_MODELS, QUESTION_TYPE_META } from '@shared/constants';
import type { AppInfo, AppSnapshot, PrimerDepth, Profile, QualityMode, ResearchMode, Settings, ThemeMode } from '@shared/types';
import { ConfirmModal } from '../../components/Modal';
import { PageFrame } from '../../components/Page';
import { Badge, Button, Card, Chip, Input, Label, Segmented, Select, Textarea, Toggle } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtNumber, relTime } from '../../lib/format';
import { attempt, toastInfo, useApp } from '../../lib/store';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-black">{title}</h2>
      {description && <p className="mt-0.5 mb-2 text-sm font-semibold text-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </Card>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[260px_1fr] items-start gap-6">
      <div>
        <div className="text-sm font-extrabold">{label}</div>
        {hint && <div className="mt-0.5 text-xs font-semibold text-faint">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function save(patch: Partial<Settings>) {
  void attempt("Couldn't save settings", () => api.settings.update(patch));
}

function saveProfile(patch: Partial<Profile>) {
  void attempt("Couldn't save your profile", () => api.profile.update(patch));
}

function ConnectionSection({ settings, info }: { settings: Settings; info: AppInfo | null }) {
  const connection = useApp((s) => s.connection);
  const [key, setKey] = useState('');
  const [path, setPath] = useState(settings.claudePath);
  return (
    <Section title="Claude Code connection" description="Every lesson, grade, interview and research task runs through Claude Code via the Claude Agent SDK.">
      <div className="flex items-start gap-4 rounded-2xl bg-sunken p-4">
        {connection.state === 'connected' ? (
          <CircleCheck className="mt-0.5 size-6 shrink-0 text-ok" />
        ) : connection.state === 'error' ? (
          <CircleAlert className="mt-0.5 size-6 shrink-0 text-bad" />
        ) : (
          <LoaderCircle className="mt-0.5 size-6 shrink-0 animate-spin text-brand" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-black">
            {connection.state === 'connected' ? 'Connected' : connection.state === 'error' ? 'Not connected' : 'Checking…'}
          </div>
          {connection.state === 'error' && <div className="mt-0.5 text-sm font-semibold text-bad-ink">{connection.error}</div>}
          <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[13px] font-semibold text-muted">
            {connection.email && <span>Account: {connection.email}</span>}
            {connection.organization && <span>Organization: {connection.organization}</span>}
            {connection.subscription && <span>Plan: {connection.subscription}</span>}
            {connection.authSource && <span>Auth: {connection.authSource}</span>}
            {connection.claudeVersion && <span>Claude Code v{connection.claudeVersion}</span>}
            {connection.model && <span>Model: {connection.model}</span>}
            {connection.checkedAt && <span>Checked {relTime(connection.checkedAt)}</span>}
            {connection.rateLimit && (
              <span>
                Usage limit: {connection.rateLimit.status}
                {connection.rateLimit.utilization !== undefined && ` · ${Math.round(connection.rateLimit.utilization * 100)}% used`}
                {connection.rateLimit.resetsAt && ` · resets ${new Date(connection.rateLimit.resetsAt * 1000).toLocaleString()}`}
              </span>
            )}
          </div>
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" />} onClick={() => void attempt('Check failed', () => api.claude.check())}>
          Test
        </Button>
      </div>
      <Row label="Sign-in method" hint="Claude Code login uses your existing `claude` sign-in (Pro, Max, Team or Enterprise).">
        <Segmented<Settings['authMode']>
          value={settings.authMode}
          onChange={(v) => save({ authMode: v })}
          options={[
            { value: 'claude', label: 'Claude Code login' },
            { value: 'apiKey', label: 'Anthropic API key' },
          ]}
        />
      </Row>
      {settings.authMode === 'apiKey' && (
        <Row label="API key" hint="Stored encrypted with Windows credential protection. Never exported.">
          <div className="flex gap-2">
            <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={settings.hasApiKey ? '•••••••••••• (saved)' : 'sk-ant-…'} />
            <Button icon={<KeyRound className="size-4" />} disabled={!key.trim()} onClick={() => void attempt("Couldn't save the key", () => api.claude.setApiKey(key.trim())).then(() => setKey(''))}>
              Save
            </Button>
            {settings.hasApiKey && (
              <Button variant="ghost" onClick={() => void attempt("Couldn't remove the key", () => api.claude.setApiKey(null))}>
                Remove
              </Button>
            )}
          </div>
        </Row>
      )}
      <Row label="Claude Code executable" hint={<>Leave empty to use the binary bundled with the SDK. In use: <span className="font-mono">{info?.claudePath}</span></>}>
        <div className="flex gap-2">
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="e.g. C:\Users\you\.local\bin\claude.exe" className="font-mono text-[13px]" />
          <Button variant="secondary" disabled={path === settings.claudePath} onClick={() => save({ claudePath: path })}>
            Apply
          </Button>
        </div>
      </Row>
    </Section>
  );
}

export function SettingsPage() {
  const snapshot = useApp((s) => s.snapshot) as AppSnapshot;
  const models = useApp((s) => s.models);
  const settings = snapshot.settings;
  const profile = snapshot.profile;
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const list = (models.length ? models : FALLBACK_MODELS).filter((m) => m.value !== 'default');
  const current = list.find((m) => m.value === settings.model);

  useEffect(() => {
    void api.app.info().then(setInfo);
  }, [settings.claudePath]);

  return (
    <PageFrame title="Settings">
      <div className="mx-auto flex max-w-[980px] flex-col gap-6">
        <ConnectionSection settings={settings} info={info} />

        <Section title="Models" description="Pick the Claude model that powers your coach. The list comes live from your Claude Code account.">
          <Row label="Coaching model" hint="Lessons, questions, roadmaps, company research and interviews.">
            <Select value={settings.model} onChange={(e) => save({ model: e.target.value })}>
              {!current && <option value={settings.model}>{settings.model}</option>}
              {list.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.displayName}
                  {m.value !== m.resolvedModel && m.resolvedModel ? ` (${m.value})` : ''} — {m.description}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Fast model" hint="Short-answer grading and lesson debriefs. A faster model means quicker feedback.">
            <Select value={settings.fastModel} onChange={(e) => save({ fastModel: e.target.value })}>
              <option value="">Same as coaching model</option>
              {list.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.displayName} — {m.description}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Speed vs depth" hint="Adjusts how much Claude thinks on each task (effort level).">
            <Segmented<QualityMode>
              value={settings.quality}
              onChange={(v) => save({ quality: v })}
              options={[
                { value: 'speed', label: '⚡ Faster', hint: 'Lower effort: quicker responses' },
                { value: 'balanced', label: '⚖️ Balanced', hint: 'Recommended' },
                { value: 'quality', label: '🧠 Deeper', hint: 'Higher effort: richer, slower' },
              ]}
            />
          </Row>
        </Section>

        <Section title="Learning" description="Shape how lessons are generated for you.">
          <Row label="Daily goal">
            <Segmented value={settings.dailyGoalXp} onChange={(v) => save({ dailyGoalXp: v })} options={DAILY_GOALS.map((g) => ({ value: g.xp, label: `${g.label} · ${g.xp} XP`, hint: g.hint }))} />
          </Row>
          <Row label="Questions per lesson">
            <Segmented value={settings.lessonLength} onChange={(v) => save({ lessonLength: v })} options={[5, 8, 10, 12].map((n) => ({ value: n, label: String(n) }))} />
          </Row>
          <Row label="Study primer before practice" hint="A short textbook-style read written for your level and gaps.">
            <Segmented<PrimerDepth>
              value={settings.primer}
              onChange={(v) => save({ primer: v })}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'brief', label: 'Brief' },
                { value: 'standard', label: 'Standard' },
                { value: 'deep', label: 'Deep dive' },
              ]}
            />
          </Row>
          <Row label="Question types" hint="The coach mixes the enabled types in every lesson.">
            <div className="flex flex-wrap gap-2">
              {ALL_QUESTION_TYPES.map((t) => (
                <Chip key={t} active={settings.questionTypes[t]} onClick={() => save({ questionTypes: { ...settings.questionTypes, [t]: !settings.questionTypes[t] } })}>
                  {QUESTION_TYPE_META[t].label}
                </Chip>
              ))}
            </div>
          </Row>
          <Row label="Web research" hint="Lets Claude search the web for current versions, tooling and company info.">
            <Segmented<ResearchMode>
              value={settings.research}
              onChange={(v) => save({ research: v })}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'smart', label: 'Smart', hint: 'Only when a topic moves fast' },
                { value: 'always', label: 'Always verify' },
              ]}
            />
          </Row>
          <Row label="Prepare the next lesson in advance" hint="Generates your next lesson in the background so it opens instantly.">
            <Toggle checked={settings.prefetch} onChange={(v) => save({ prefetch: v })} label="Prefetch next lesson" />
          </Row>
        </Section>

        <Section title="About you" description="Your coach uses this to calibrate difficulty, examples and interview questions.">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input defaultValue={profile.name} onBlur={(e) => e.target.value !== profile.name && saveProfile({ name: e.target.value })} />
            </div>
            <div>
              <Label>Current role</Label>
              <Input defaultValue={profile.currentRole} onBlur={(e) => e.target.value !== profile.currentRole && saveProfile({ currentRole: e.target.value })} />
            </div>
            <div>
              <Label>Target role</Label>
              <Input defaultValue={profile.targetRole} onBlur={(e) => e.target.value !== profile.targetRole && saveProfile({ targetRole: e.target.value })} />
            </div>
            <div>
              <Label>Years of experience</Label>
              <Input type="number" min={0} max={40} defaultValue={profile.experienceYears} onBlur={(e) => saveProfile({ experienceYears: Math.max(0, Number(e.target.value) || 0) })} />
            </div>
          </div>
          <div>
            <Label>Goals</Label>
            <Textarea rows={3} defaultValue={profile.goals} onBlur={(e) => e.target.value !== profile.goals && saveProfile({ goals: e.target.value })} />
          </div>
        </Section>

        <Section title="Appearance & sound">
          <Row label="Theme">
            <Segmented<ThemeMode>
              value={settings.theme}
              onChange={(v) => save({ theme: v })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
          <Row label="Sound effects">
            <Toggle checked={settings.sound} onChange={(v) => save({ sound: v })} label="Sound effects" />
          </Row>
          <Row label="Desktop notifications" hint="e.g. when company research finishes in the background.">
            <Toggle checked={settings.notifications} onChange={(v) => save({ notifications: v })} label="Notifications" />
          </Row>
        </Section>

        <Section title="Usage" description="Estimated by Claude Code for the calls this app made. With a subscription login this counts against your plan, not a bill.">
          <div className="grid grid-cols-4 gap-3">
            {[
              ['Agent runs', fmtNumber(snapshot.usage.calls)],
              ['Est. cost', `$${snapshot.usage.costUsd.toFixed(2)}`],
              ['Tokens in / out', `${fmtNumber(snapshot.usage.inputTokens / 1000)}k / ${fmtNumber(snapshot.usage.outputTokens / 1000)}k`],
              ['Web searches', fmtNumber(snapshot.usage.webSearches)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-sunken p-4">
                <div className="text-lg font-black">{value}</div>
                <div className="text-xs font-bold text-faint">{label}</div>
              </div>
            ))}
          </div>
          {Object.keys(snapshot.usage.byModel).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(snapshot.usage.byModel).map(([model, row]) => (
                <Badge key={model}>
                  {model}: {row.calls} runs · ${row.costUsd.toFixed(2)}
                </Badge>
              ))}
            </div>
          )}
        </Section>

        <Section title="Your data" description="Everything is stored locally on this PC.">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<FolderOpen className="size-4" />} onClick={() => void api.app.openDataFolder()}>
              Open data folder
            </Button>
            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              onClick={() =>
                void attempt('Export failed', () => api.app.exportData()).then((r) => {
                  if (r?.ok) toastInfo('Backup saved', r.path);
                })
              }
            >
              Export backup
            </Button>
            <Button
              variant="secondary"
              icon={<Upload className="size-4" />}
              onClick={() =>
                void attempt('Import failed', () => api.app.importData()).then((r) => {
                  if (r?.ok) toastInfo('Backup restored');
                  else if (r?.error) toastInfo('Import failed', r.error);
                })
              }
            >
              Import backup
            </Button>
            <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setConfirmReset(true)}>
              Reset all progress
            </Button>
          </div>
          {info && (
            <div className="text-xs font-semibold text-faint">
              Ascend v{info.version} · Electron {info.electron} · {info.platform} · data in <span className="font-mono">{info.dataDir}</span>
            </div>
          )}
        </Section>
      </div>
      <ConfirmModal
        open={confirmReset}
        title="Reset all progress?"
        body="This deletes your tracks, lessons, mastery, interviews, targets and notes, and restarts onboarding. Consider exporting a backup first."
        confirmLabel="Reset everything"
        danger
        onConfirm={() => void attempt('Reset failed', () => api.app.resetData())}
        onClose={() => setConfirmReset(false)}
      />
    </PageFrame>
  );
}
