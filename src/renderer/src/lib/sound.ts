// Tiny synthesized sound effects (no audio assets needed).
import { useApp } from './store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useApp.getState().snapshot?.settings.sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'triangle', gain = 0.07): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export const sfx = {
  correct(): void {
    tone(659, 0, 0.14);
    tone(988, 0.09, 0.22);
  },
  wrong(): void {
    tone(247, 0, 0.18, 'square', 0.035);
    tone(196, 0.12, 0.24, 'square', 0.035);
  },
  partial(): void {
    tone(523, 0, 0.14);
    tone(587, 0.1, 0.18);
  },
  tap(): void {
    tone(880, 0, 0.05, 'sine', 0.025);
  },
  match(): void {
    tone(784, 0, 0.08, 'sine', 0.05);
    tone(1175, 0.05, 0.12, 'sine', 0.05);
  },
  complete(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.26));
  },
  levelUp(): void {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.06));
  },
};
