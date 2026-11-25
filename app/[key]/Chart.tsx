'use client';
import { useEffect, useRef, useState } from 'react';
import { formatUsd } from '@/lib/money';
import type { RunPoint } from '@/lib/profit';
import { yTicks } from '@/lib/ticks';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

const W = 640, L = 8, T = 12;

export default function Chart({ points, bucket }: { points: RunPoint[]; bucket: 'day' | 'month' }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const [px, setPx] = useState(W);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setPx(e.contentRect.width || W));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  // The SVG is scaled to its box, so on narrow screens grow text, margins and height to keep labels ~13px.
  const k = Math.max(1, W / px), fs = 13 * k, H = Math.round(Math.min(270 * k, 420)), R = Math.round(84 * k), B = Math.round(26 * k);

  const lab = (d: string) => (bucket === 'month' ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : short(d));
  const n = points.length;
  const vals = points.map(p => p.total);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals, 1);
  const ticks = yTicks(vals, 'profit');
  const x = (i: number) => L + (n < 2 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

  const at = (clientX: number, rect: DOMRect) => {
    const f = (((clientX - rect.left) / rect.width) * W - L) / (W - L - R);
    setHover(Math.min(n - 1, Math.max(0, Math.round(f * (n - 1)))));
  };
  const cur = hover === null ? undefined : points[hover];

  return (
    <section>
      <div className="chartbox" style={{ position: 'relative' }}>
        <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0}
          aria-label={`Running total of take-home by ${bucket}, since you started`}
          onMouseMove={e => at(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(h => h ?? n - 1)} onBlur={() => setHover(null)}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') setHover(h => Math.max(0, (h ?? n) - 1));
            if (e.key === 'ArrowRight') setHover(h => Math.min(n - 1, (h ?? -1) + 1));
          }}>
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--grey)" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--grey)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          {ticks.map(t => <text key={t.value} x={W - 4} y={y(t.value) + fs * 0.3} fontSize={fs} textAnchor="end" fill="var(--muted)">{t.label}</text>)}
          {n > 0 && <text x={L} y={H - 6} fontSize={fs} fill="var(--muted)">{lab(points[0].day)}</text>}
          {n > 1 && <text x={W - R} y={H - 6} fontSize={fs} textAnchor="end" fill="var(--muted)">{lab(points[n - 1].day)}</text>}
          <polyline points={points.map((p, i) => `${x(i)},${y(p.total)}`).join(' ')} fill="none" stroke="var(--green)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => p.shipment && <circle key={p.day} cx={x(i)} cy={y(p.total)} r={4 * Math.sqrt(k)} fill="var(--green)" stroke="var(--bg, #fff)" strokeWidth={1.5}><title>{`Shipment received ${lab(p.day)}`}</title></circle>)}
        </svg>
        {cur && (
          <div className="card" role="status" style={{ position: 'absolute', top: 4, left: `${Math.min(60, (x(hover!) / W) * 100)}%`, pointerEvents: 'none', fontSize: 14 }}>
            <div><strong>{formatUsd(cur.total)}</strong> total · {lab(cur.day)}</div>
            <div className="muted">{cur.change < 0 ? '−' : '+'}{formatUsd(Math.abs(cur.change))} that {bucket}{cur.shipment && ' · shipment received'}</div>
          </div>
        )}
      </div>
      <p className="muted"><span className="swatch" style={{ background: 'var(--green)' }} /> Dot = shipment received · dashed line = break-even</p>

      <button type="button" onClick={() => setTable(t => !t)} aria-expanded={table}>{table ? 'Hide table' : 'Show as table'}</button>
      {table && (
        <div className="tablewrap"><table>
          <thead><tr><th>{bucket === 'month' ? 'Month' : 'Day'}</th><th className="n">Running total</th><th className="n">Change</th><th>Shipment</th></tr></thead>
          <tbody>{points.map(p => (
            <tr key={p.day}><td>{lab(p.day)}</td><td className="n">{formatUsd(p.total)}</td><td className="n">{formatUsd(p.change)}</td><td>{p.shipment ? 'Received' : ''}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}
