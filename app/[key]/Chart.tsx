'use client';
import { useState } from 'react';
import { formatUsd } from '@/lib/money';
import type { DayPoint } from '@/lib/profit';
import { yTicks } from '@/lib/ticks';

type Measure = 'profit' | 'revenue' | 'units';
const LABEL: Record<Measure, string> = { profit: 'Profit', revenue: 'Revenue', units: 'Units sold' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

const W = 640, H = 270, L = 8, R = 140, T = 12, B = 26;

export default function Chart({ current, previous }: { current: DayPoint[]; previous: DayPoint[] }) {
  const [measure, setMeasure] = useState<Measure>('profit');
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const fmt = (v: number) => (measure === 'units' ? String(v) : formatUsd(v));
  const val = (p: DayPoint | undefined) => (p ? p[measure] : undefined);
  const n = Math.max(current.length, previous.length);
  const all = [...current, ...previous].map(p => p[measure]);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all, 1);
  const ticks = yTicks(all, measure);
  const firstDay = (current[0] ?? previous[0])?.day, lastDay = (current[current.length - 1] ?? previous[previous.length - 1])?.day;
  const x = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = (pts: DayPoint[]) => pts.map((p, i) => `${x(i).toFixed(1)},${y(p[measure]).toFixed(1)}`).join(' ');

  const at = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const cur = hover === null ? undefined : current[hover];
  const prev = hover === null ? undefined : previous[hover];

  return (
    <section>
      <div className="seg" role="group" aria-label="Measure">
        {(Object.keys(LABEL) as Measure[]).map(m => (
          <button key={m} type="button" aria-pressed={m === measure} onClick={() => setMeasure(m)}>{LABEL[m]}</button>
        ))}
      </div>

      <div className="chartbox" style={{ position: 'relative' }}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0}
          aria-label={`${LABEL[measure]} by day, this period against the previous one`}
          onMouseMove={e => at(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(h => h ?? n - 1)} onBlur={() => setHover(null)}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') setHover(h => Math.max(0, (h ?? n) - 1));
            if (e.key === 'ArrowRight') setHover(h => Math.min(n - 1, (h ?? -1) + 1));
          }}>
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--grey)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {ticks.map(k => <text key={k.value} x={W - 4} y={y(k.value) + 4} fontSize="13" textAnchor="end" fill="var(--muted)">{k.label}</text>)}
          {firstDay && <text x={L} y={H - 6} fontSize="13" fill="var(--muted)">{short(firstDay)}</text>}
          {lastDay && n > 1 && <text x={x(n - 1)} y={H - 6} fontSize="13" textAnchor="end" fill="var(--muted)">{short(lastDay)}</text>}
          <polyline points={line(previous)} fill="none" stroke="var(--grey)" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          <polyline points={line(current)} fill="none" stroke="var(--blue)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {previous.length > 0 && <text x={x(previous.length - 1) + 6} y={y(val(previous[previous.length - 1])!) + 14} fontSize="12" fill="var(--muted)">Previous</text>}
          {current.length > 0 && <text x={x(current.length - 1) + 6} y={y(val(current[current.length - 1])!) - 4} fontSize="12" fill="var(--blue)">This period</text>}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {hover !== null && (
          <div className="card" role="status" style={{ position: 'absolute', top: 4, left: `${Math.min(60, (x(hover) / W) * 100)}%`, pointerEvents: 'none', fontSize: 14 }}>
            {cur && <div><strong>{fmt(cur[measure])}</strong> <span style={{ color: 'var(--blue)' }}>this period</span> · {short(cur.day)}</div>}
            {prev && <div><strong>{fmt(prev[measure])}</strong> <span className="muted">previous</span> · {short(prev.day)}</div>}
          </div>
        )}
      </div>

      <button type="button" onClick={() => setTable(t => !t)} aria-expanded={table}>{table ? 'Hide table' : 'Show as table'}</button>
      {table && (
        <div className="tablewrap"><table>
          <thead><tr><th>Day</th><th>This period</th><th>Previous day</th><th>Previous</th></tr></thead>
          <tbody>{Array.from({ length: n }, (_, i) => (
            <tr key={i}>
              <td>{current[i] ? short(current[i].day) : ''}</td><td>{current[i] ? fmt(current[i][measure]) : ''}</td>
              <td>{previous[i] ? short(previous[i].day) : ''}</td><td>{previous[i] ? fmt(previous[i][measure]) : ''}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}
