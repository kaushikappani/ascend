import confetti from 'canvas-confetti';

const COLORS = ['#6c5ce7', '#8b7cff', '#ffb020', '#1fae6b', '#ff7a1a', '#1e9be8'];

export function celebrate(big = false): void {
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 9999 };
  confetti({ ...base, particleCount: big ? 160 : 90, spread: big ? 100 : 70, startVelocity: 42, origin: { y: 0.55 } });
  if (big) {
    setTimeout(() => confetti({ ...base, particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } }), 180);
    setTimeout(() => confetti({ ...base, particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } }), 260);
  }
}
