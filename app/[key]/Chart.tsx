'use client';
import { useState } from 'react';
import { formatUsd } from '@/lib/money';
import type { DayPoint } from '@/lib/profit';
import { yTicks } from '@/lib/ticks';

type Measure = 'profit' | 'revenue' | 'units';
const LABEL: Record<Measure, string> = { profit: 'Profit', revenue: 'Revenue', units: 'Units sold' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

const W = 640, H = 270, L = 8, R = 84, T = 12, B = 26;

export default function Chart({ current, previous, bucket }: { current: DayPoint[]; previous: DayPoint[]; bucket: 'day' | 'month' }) {
  const [measure, setMeasure] = useState<Measure>('profit');
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const ghost = bucket === 'day' && previous.length > 0;
  const lab = (d: string) => (bucket === 'month' ? MONTHS[Number(d.slice(5, 7)) - 1] : short(d));
  const fmt = (v: number) => (measure === 'units' ? String(v) : formatUsd(v));
  const n = ghost ? Math.max(current.length, previous.length) : current.length;
  const all = [...current, ...(ghost ? previous : [])].map(p => p[measure]);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all, 1);
  const ticks = yTicks(all, measure);
  const firstDay = current[0]?.day, lastDay = current[current.length - 1]?.day;
  const slot = (W - L - R) / Math.max(n, 1);
  const bw = ghost ? slot * 0.4 : slot * 0.7;
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const bar = (p: DayPoint | undefined, i: number, k: number, fill: string, op: number) => p && (
    <rect key={`${k}${i}`} x={L + i * slot + (slot - (ghost ? 2 * bw : bw)) / 2 + k * bw} y={Math.min(y(p[measure]), y(0))} width={bw} height={Math.abs(y(p[measure]) - y(0))} fill={fill} opacity={op} />
  );

  const at = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    setHover(Math.min(n - 1, Math.max(0, Math.floor((px - L) / slot))));
  };

  const cur = hover === null ? undefined : current[hover];
  const prev = hover === null || !ghost ? undefined : previous[hover];

  return (
    <section>
      <div className="seg" role="group" aria-label="Measure">
        {(Object.keys(LABEL) as Measure[]).map(m => (
          <button key={m} type="button" aria-pressed={m === measure} onClick={() => setMeasure(m)}>{LABEL[m]}</button>
        ))}
      </div>

      <div className="chartbox" style={{ position: 'relative' }}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0}
          aria-label={`${LABEL[measure]} by ${bucket}${ghost ? ', this period against the previous one' : ''}`}
          onMouseMove={e => at(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(h => h ?? n - 1)} onBlur={() => setHover(null)}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') setHover(h => Math.max(0, (h ?? n) - 1));
            if (e.key === 'ArrowRight') setHover(h => Math.min(n - 1, (h ?? -1) + 1));
          }}>
          {hover !== null && <rect x={L + hover * slot} y={T} width={slot} height={H - T - B} fill="var(--green-soft)" />}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--grey)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {ticks.map(k => <text key={k.value} x={W - 4} y={y(k.value) + 4} fontSize="13" textAnchor="end" fill="var(--muted)">{k.label}</text>)}
          {bucket === 'month'
            ? current.map((p, i) => <text key={p.day} x={L + (i + 0.5) * slot} y={H - 6} fontSize="13" textAnchor="middle" fill="var(--muted)">{lab(p.day)}</text>)
            : <>
              {firstDay && <text x={L} y={H - 6} fontSize="13" fill="var(--muted)">{short(firstDay)}</text>}
              {lastDay && n > 1 && <text x={L + (current.length - 0.5) * slot} y={H - 6} fontSize="13" textAnchor="end" fill="var(--muted)">{short(lastDay)}</text>}
            </>}
          {ghost && previous.map((p, i) => bar(p, i, 0, 'var(--grey)', 0.45))}
          {current.map((p, i) => bar(p, i, ghost ? 1 : 0, 'var(--green)', 1))}
        </svg>
        {hover !== null && (
          <div className="card" role="status" style={{ position: 'absolute', top: 4, left: `${Math.min(60, (hover * slot / W) * 100)}%`, pointerEvents: 'none', fontSize: 14 }}>
            {cur && <div><strong>{fmt(cur[measure])}</strong> <span style={{ color: 'var(--green)' }}>this period</span> · {lab(cur.day)}</div>}
            {prev && <div><strong>{fmt(prev[measure])}</strong> <span className="muted">previous</span> · {short(prev.day)}</div>}
          </div>
        )}
      </div>
      {ghost && <p className="muted"><span className="swatch" style={{ background: 'var(--green)' }} /> This period <span className="swatch" style={{ background: 'var(--grey)', opacity: 0.45 }} /> Previous</p>}

      <button type="button" onClick={() => setTable(t => !t)} aria-expanded={table}>{table ? 'Hide table' : 'Show as table'}</button>
      {table && (
        <div className="tablewrap"><table>
          <thead><tr><th>{bucket === 'month' ? 'Month' : 'Day'}</th><th className="n">{ghost ? 'This period' : LABEL[measure]}</th>{ghost && <><th>Previous day</th><th className="n">Previous</th></>}</tr></thead>
          <tbody>{Array.from({ length: n }, (_, i) => (
            <tr key={i}>
              <td>{current[i] ? lab(current[i].day) : ''}</td><td className="n">{current[i] ? fmt(current[i][measure]) : ''}</td>
              {ghost && <><td>{previous[i] ? short(previous[i].day) : ''}</td><td className="n">{previous[i] ? fmt(previous[i][measure]) : ''}</td></>}
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}
