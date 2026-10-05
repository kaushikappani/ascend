// Small hand-built SVG charts: XP per day (single series) and an activity heatmap (sequential).
import { Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, dayKey, parseDay } from '@shared/progress';
import type { Stats } from '@shared/types';
import { cn } from '../../lib/format';

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function Tooltip({ x, y, lines }: { x: number | string; y: number; lines: string[] }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border-2 border-line bg-elev px-3 py-2 text-xs font-bold whitespace-nowrap shadow-pop"
      style={{ left: x, top: y - 8 }}
    >
      {lines.map((l, i) => (
        <div key={i} className={i === 0 ? 'text-ink' : 'text-muted'}>
          {l}
        </div>
      ))}
    </div>
  );
}

export function XpChart({ stats, goal, days = 14 }: { stats: Stats; goal: number; days?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const data = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const day = addDays(dayKey(), i - days + 1);
        return { day, xp: stats.xpByDay[day] ?? 0, minutes: stats.minutesByDay[day] ?? 0 };
      }),
    [stats, days],
  );
  const W = 640;
  const H = 200;
  const pad = { l: 34, r: 44, t: 16, b: 26 };
  const max = niceMax(Math.max(goal, ...data.map((d) => d.xp)));
  const slot = (W - pad.l - pad.r) / days;
  const barW = Math.min(24, slot - 6);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const total = data.reduce((s, d) => s + d.xp, 0);
  const best = data.reduce((b, d, i) => (d.xp > data[b].xp ? i : b), 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-muted">
          {total} XP in the last {days} days · goal {goal} XP/day
        </div>
        <button onClick={() => setTable((v) => !v)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-muted hover:bg-hover hover:text-ink">
          <Table2 className="size-3.5" /> {table ? 'Chart' : 'Table'}
        </button>
      </div>
      {table ? (
        <div className="max-h-[220px] overflow-y-auto rounded-2xl border-2 border-line">
          <table className="w-full text-sm">
            <thead className="bg-sunken text-left text-xs font-black text-muted">
              <tr>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2 text-right">XP</th>
                <th className="px-3 py-2 text-right">Minutes</th>
              </tr>
            </thead>
            <tbody className="font-semibold tabular-nums">
              {[...data].reverse().map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="px-3 py-1.5">{parseDay(d.day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td className="px-3 py-1.5 text-right">{d.xp}</td>
                  <td className="px-3 py-1.5 text-right">{Math.round(d.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="XP earned per day">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
                <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--text-faint)">
                  {Math.round(t)}
                </text>
              </g>
            ))}
            <line x1={pad.l} x2={W - pad.r} y1={y(goal)} y2={y(goal)} stroke="var(--text-faint)" strokeWidth="1" />
            <text x={W - pad.r + 6} y={y(goal) + 4} fontSize="11" fontWeight="800" fill="var(--text-muted)">
              goal
            </text>
            {data.map((d, i) => {
              const cx = pad.l + slot * i + slot / 2;
              const h = y(0) - y(d.xp);
              const r = Math.min(4, h / 2, barW / 2);
              const x0 = cx - barW / 2;
              const top = y(d.xp);
              const path =
                h > 0
                  ? `M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${y(0)} Z`
                  : '';
              const isToday = i === days - 1;
              return (
                <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={pad.l + slot * i} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
                  {path && <path d={path} fill={d.xp >= goal ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 55%, var(--bg-elev))'} opacity={hover === null || hover === i ? 1 : 0.55} />}
                  {(isToday || i === best) && d.xp > 0 && (
                    <text x={cx} y={top - 6} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--text-muted)">
                      {d.xp}
                    </text>
                  )}
                  {(i % 2 === days % 2 || isToday) && (
                    <text x={cx} y={H - 8} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={isToday ? 'var(--text)' : 'var(--text-faint)'}>
                      {isToday ? 'Today' : parseDay(d.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <Tooltip
              x={`${((pad.l + slot * hover + slot / 2) / W) * 100}%`}
              y={0}
              lines={[
                parseDay(data[hover].day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }),
                `${data[hover].xp} XP · ${Math.round(data[hover].minutes)} min`,
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}

const HEAT = [0, 28, 50, 75, 100];

export function ActivityHeatmap({ stats, weeks = 20 }: { stats: Stats; weeks?: number }) {
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null);
  const today = parseDay(dayKey());
  const end = addDays(dayKey(), 6 - today.getDay());
  const start = addDays(end, -(weeks * 7 - 1));
  const max = Math.max(1, ...Object.values(stats.xpByDay));
  const level = (xp: number) => (xp <= 0 ? 0 : Math.min(4, 1 + Math.floor((xp / max) * 3.999)));
  const cell = 14;
  const gap = 3;
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <div className="relative">
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {cols.map((col, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {col.map((day, d) => {
              const xp = stats.xpByDay[day] ?? 0;
              const future = day > dayKey();
              const l = level(xp);
              return (
                <div
                  key={day}
                  onMouseEnter={() => setHover({ day, x: w * (cell + gap) + cell / 2, y: d * (cell + gap) })}
                  onMouseLeave={() => setHover(null)}
                  className={cn('rounded-[4px]', future && 'opacity-0')}
                  style={{
                    width: cell,
                    height: cell,
                    background: l === 0 ? 'var(--bg-sunken)' : `color-mix(in srgb, var(--brand) ${HEAT[l]}%, var(--bg-elev))`,
                    outline: day === dayKey() ? '2px solid var(--text-faint)' : undefined,
                    outlineOffset: 1,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] font-bold text-faint">
        Less
        {HEAT.map((h, i) => (
          <span key={i} className="size-3 rounded-[3px]" style={{ background: i === 0 ? 'var(--bg-sunken)' : `color-mix(in srgb, var(--brand) ${h}%, var(--bg-elev))` }} />
        ))}
        More
      </div>
      {hover && (
        <Tooltip
          x={hover.x}
          y={hover.y}
          lines={[
            parseDay(hover.day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
            `${stats.xpByDay[hover.day] ?? 0} XP · ${Math.round(stats.minutesByDay[hover.day] ?? 0)} min`,
          ]}
        />
      )}
    </div>
  );
}
