// "Ace", Ascend's coach mascot: a friendly climber blob with a summit flag.
import type { ReactNode } from 'react';
import { cn } from '../lib/format';

export type Mood = 'happy' | 'thinking' | 'celebrate' | 'sad' | 'wave';

const INK = '#1d1e33';

export function Mascot({ mood = 'happy', size = 96, className, bob = true }: { mood?: Mood; size?: number; className?: string; bob?: boolean }) {
  const pupil = mood === 'thinking' ? { dx: 2.5, dy: -3.5 } : mood === 'sad' ? { dx: 0, dy: 2.5 } : { dx: 0, dy: 0 };
  const arm = { stroke: '#5e45e6', strokeWidth: 7, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <svg viewBox="0 0 120 124" width={size} height={size} className={cn(bob && 'animate-bob', className)} aria-hidden>
      <defs>
        <linearGradient id="ace-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a293ff" />
          <stop offset="1" stopColor="#5b41e2" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="118" rx="30" ry="4.5" fill="#1d1e33" opacity="0.12" />
      {/* summit flag antenna */}
      <path d="M60 24 V8" stroke="#5b41e2" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M61.5 8 L77 12.5 L61.5 17 Z" fill="#ffb020" />
      {/* arms */}
      {mood === 'celebrate' ? (
        <>
          <path d="M26 64 Q14 50 17 36" {...arm} />
          <path d="M94 64 Q106 50 103 36" {...arm} />
        </>
      ) : mood === 'wave' ? (
        <>
          <path d="M24 72 Q15 80 19 90" {...arm} />
          <path d="M95 62 Q108 52 106 38" {...arm} />
        </>
      ) : (
        <>
          <path d="M24 72 Q15 80 19 90" {...arm} />
          <path d="M96 72 Q105 80 101 90" {...arm} />
        </>
      )}
      {/* body */}
      <path d="M60 24 C88 24 102 44 102 70 C102 96 84 110 60 110 C36 110 18 96 18 70 C18 44 32 24 60 24 Z" fill="url(#ace-body)" />
      <ellipse cx="60" cy="88" rx="24" ry="16" fill="#ffffff" opacity="0.16" />
      {/* eyes */}
      <g className="mascot-eyes">
        <ellipse cx="46" cy="60" rx="10.5" ry="12" fill="#fff" />
        <ellipse cx="74" cy="60" rx="10.5" ry="12" fill="#fff" />
        <circle cx={47 + pupil.dx} cy={62 + pupil.dy} r="5.2" fill={INK} />
        <circle cx={75 + pupil.dx} cy={62 + pupil.dy} r="5.2" fill={INK} />
        <circle cx={48.8 + pupil.dx} cy={59.8 + pupil.dy} r="1.7" fill="#fff" />
        <circle cx={76.8 + pupil.dx} cy={59.8 + pupil.dy} r="1.7" fill="#fff" />
      </g>
      {mood === 'sad' && (
        <>
          <path d="M37 47 L50 50" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M83 47 L70 50" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      <ellipse cx="35" cy="77" rx="5.5" ry="3.2" fill="#ff8fb1" opacity="0.65" />
      <ellipse cx="85" cy="77" rx="5.5" ry="3.2" fill="#ff8fb1" opacity="0.65" />
      {/* mouth */}
      {mood === 'celebrate' ? (
        <>
          <path d="M48 76 Q60 94 72 76 Z" fill={INK} />
          <path d="M54 84 Q60 90 66 84 Q60 81 54 84 Z" fill="#ff6f91" />
        </>
      ) : mood === 'sad' ? (
        <path d="M51 86 Q60 78 69 86" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : mood === 'thinking' ? (
        <path d="M53 82 Q58 80 67 81" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M50 78 Q60 88 70 78" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      )}
      {mood === 'thinking' && (
        <g fill="#a293ff">
          <circle cx="98" cy="26" r="3" opacity="0.6" />
          <circle cx="106" cy="17" r="4" opacity="0.8" />
          <circle cx="112" cy="6" r="5" />
        </g>
      )}
      {mood === 'celebrate' && (
        <g fill="#ffb020">
          <path d="M14 20 l2.5 5 5 2.5 -5 2.5 -2.5 5 -2.5 -5 -5 -2.5 5 -2.5z" />
          <path d="M104 14 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" />
          <path d="M108 58 l1.6 3.2 3.2 1.6 -3.2 1.6 -1.6 3.2 -1.6 -3.2 -3.2 -1.6 3.2 -1.6z" />
        </g>
      )}
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8e7dff" />
          <stop offset="1" stopColor="#5433db" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#logo-bg)" />
      <path d="M84 396 L204 214 L256 288 L320 150 L428 396 Z" fill="#fff" />
      <path d="M204 214 L234 258 L218 252 L204 268 L190 250 L178 254 Z" fill="#cfc6ff" />
      <path d="M320 150 L352 220 L336 211 L320 232 L304 211 L290 218 Z" fill="#cfc6ff" />
      <path d="M320 152 L320 84" stroke="#fff" strokeWidth="16" strokeLinecap="round" />
      <path d="M322 86 L384 104 L322 124 Z" fill="#ffb020" />
    </svg>
  );
}

export function SpeechBubble({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative rounded-3xl border-2 border-line bg-elev px-5 py-4 text-[15px] font-bold shadow-card', className)}>
      <span className="absolute top-6 -left-[9px] size-4 rotate-45 border-b-2 border-l-2 border-line bg-elev" />
      {children}
    </div>
  );
}
