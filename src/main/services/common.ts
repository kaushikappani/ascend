import { ACHIEVEMENTS } from '@shared/constants';
import { toast } from '../events';

export function announceAchievements(ids: string[]): void {
  for (const id of ids) {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a) toast({ kind: 'achievement', title: `${a.emoji} Achievement unlocked: ${a.title}`, body: a.description });
  }
}

/** Rough near-duplicate check so the coach doesn't store the same observation twice. */
export function similarText(a: string, b: string): boolean {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return inter / Math.min(wa.size, wb.size) >= 0.7;
}
