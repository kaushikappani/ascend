import type { ModelOption } from '@shared/types';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function relTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d > 300 ? 'numeric' : undefined });
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

export function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString();
}

export function fmtDate(day?: string): string {
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function greeting(name?: string): string {
  const h = new Date().getHours();
  const part = h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name.split(' ')[0]}` : part;
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  );
}

export function modelName(models: ModelOption[], value: string): string {
  const m = models.find((x) => x.value === value) ?? models.find((x) => x.resolvedModel === value);
  if (m) return m.displayName;
  return value.replace(/^claude-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export const PRAISE = ['Nice!', 'Excellent!', 'Great job!', 'Spot on!', 'Nailed it!', 'Brilliant!', 'You got it!', 'Perfect!'];
export const ENCOURAGE = ['Not quite', 'Almost there', 'Good try', 'Let’s learn this one'];

export function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
