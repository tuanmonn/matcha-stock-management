import Link from 'next/link';
import { requireKey } from '@/lib/access';
import { loadSnapshot } from '@/lib/data';
import { dismissIssueAction } from './actions';
import { parseRange } from '@/lib/forms';
import { formatUsd, formatVnd, usdCentsToVnd } from '@/lib/money';
import type { Window } from '@/lib/periods';
import type { Totals } from '@/lib/profit';
import { buildDashboard } from '@/lib/report';
import type { Warning } from '@/lib/alerts';
import type { Snapshot } from '@/lib/data';
import Chart from './Chart';

export const dynamic = 'force-dynamic';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const dmy = (d: string) => `${dm(d)} ${d.slice(0, 4)}`;
const label = (w: Window) => (w.from === w.to ? dm(w.from) : w.from.slice(0, 7) === w.to.slice(0, 7) ? `${Number(w.from.slice(8))}–${dm(w.to)}` : `${dm(w.from)} – ${dm(w.to)}`);
const pct = (m: number | null) => (m === null ? '—' : `${(m * 100).toFixed(1)}%`);

function EtsyWarnings({ s, uncategorizedCents, keyValue }: { s: Snapshot; uncategorizedCents: number; keyValue: string }) {
  return (
    <>
      {s.etsy.status === 'reconnect' && <p className="warn bad">Etsy access ended. Reconnect in Settings.</p>}
      {s.issues.map(i => (
        <form key={i.id} action={dismissIssueAction.bind(null, keyValue, i.id)}>
          <p className="warn bad">{i.detail} <button type="submit">Dismiss</button></p>
        </form>
      ))}
      {uncategorizedCents > 0 && <p className="warn">{formatUsd(uncategorizedCents)} of Etsy charges this period aren&apos;t sorted into fees or ads yet.</p>}
    </>
  );
}

function Warnings({ warnings, name, extra }: { warnings: Warning[]; name: Map<string, string>; extra?: React.ReactNode }) {
  const warn = (w: Warning): { text: string; bad: boolean } => {
    const n = name.get(w.productId) ?? 'Product';
    if (w.kind === 'expiry') {
      if (w.level === 'expired') return { text: `${n}: expired on ${dmy(w.expiryDate)}`, bad: true };
      const months = { '1m': '1 month', '2m': '2 months', '3m': '3 months' }[w.level];
      return { text: `${n}: expires ${dmy(w.expiryDate)} (${months})`, bad: w.level === '1m' };
    }
    if (w.kind === 'negative_stock') return { text: `${n}: Stock is −${Math.abs(w.stock)}, so check the count`, bad: true };
    return { text: `${n}: Only ${w.stock} left`, bad: false };
  };

  if (warnings.length === 0 && !extra) return null;
  return (
    <>
      <h2>Warnings</h2>
      {extra}
      {warnings.map((w, i) => { const x = warn(w); return <p key={i} className={`warn${x.bad ? ' bad' : ''}`}>{x.text}</p>; })}
    </>
  );
}

type SP = { range?: string; from?: string; to?: string };

export default async function Dashboard({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<SP> }) {
  const { key } = await params;
  requireKey(key);
  const sp = await searchParams;
  const range = parseRange(sp);
  const s = await loadSnapshot();
  const d = buildDashboard(s, new Date(), range);
  const base = `/${key}`;

  if (d.status === 'needs_time_zone') {
    return <><h1>Dashboard</h1><p><Link className="link" href={`${base}/settings`}>Set the store&apos;s time zone in Settings</Link></p><Warnings warnings={[]} name={new Map()} extra={<EtsyWarnings s={s} uncategorizedCents={0} keyValue={key} />} /></>;
  }
  const name = new Map(s.products.map(p => [p.id, p.name]));
  if (d.status === 'missing_rate') {
    return <><h1>Dashboard</h1><p>Add the {d.year} exchange rate in <Link href={`${base}/settings`}>Settings</Link> to see reports.</p><Warnings warnings={d.warnings} name={name} extra={<EtsyWarnings s={s} uncategorizedCents={0} keyValue={key} />} /></>;
  }

  const year = Number(d.today.slice(0, 4));
  const vnd = (cents: number) => (s.rates[year] ? formatVnd(usdCentsToVnd(cents, year, s.rates)) : '—');
  const cur = d.current.shop, prev = d.previous.shop;
  const custom = range.kind === 'custom' ? range : { from: d.windows.current.from, to: d.windows.current.to };

  const rows: [string, (t: Totals) => string][] = [
    ['Profit', t => formatUsd(t.profit)],
    ['Profit (VND)', t => vnd(t.profit)],
    ['Margin', t => pct(t.margin)],
    ['Revenue', t => formatUsd(t.revenue)],
    ['Units sold', t => String(t.units)],
    ['Orders', t => String(t.orders)],
  ];

  const split = (title: string, entries: [string, Totals][]) => (
    <>
      <h2>{title}</h2>
      <div className="tablewrap"><table>
        <thead><tr><th></th><th>Profit</th><th>Revenue</th><th>Units</th><th>Orders</th></tr></thead>
        <tbody>{entries.map(([k, t]) => (
          <tr key={k}><td>{k}</td><td>{formatUsd(t.profit)}</td><td>{formatUsd(t.revenue)}</td><td>{t.units}</td><td>{t.orders}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  );

  return (
    <>
      <h1>Dashboard</h1>

      <div className="filters">
        <Link className={`link${range.kind === 'week' ? ' on' : ''}`} href={`${base}?range=week`}>This week</Link>
        <Link className={`link${range.kind === 'month' ? ' on' : ''}`} href={base}>This month</Link>
        <Link className={`link${range.kind === 'custom' ? ' on' : ''}`} href={`${base}?range=custom&from=${custom.from}&to=${custom.to}`}>Custom</Link>
      </div>
      {range.kind === 'custom' && (
        <form method="get" action={base} className="filters">
          <input type="hidden" name="range" value="custom" />
          <label>From <input type="date" name="from" defaultValue={range.from} /></label>
          <label>To <input type="date" name="to" defaultValue={range.to} /></label>
          <button type="submit">Apply</button>
        </form>
      )}
      {sp.range === 'custom' && range.kind === 'month' && <p className="muted">That date range was not valid, so this month is shown.</p>}

      <Warnings warnings={d.warnings} name={name} extra={<EtsyWarnings s={s} uncategorizedCents={d.uncategorizedFeesCents} keyValue={key} />} />

      <h2>Profit by day</h2>
      <Chart current={d.series.current} previous={d.series.previous} />

      <h2>Totals</h2>
      <div className="tablewrap"><table>
        <thead><tr>
          <th></th>
          <th>{label(d.windows.current)}{d.current.approximate && ' (approximate)'}</th>
          <th>{label(d.windows.previous)}{d.previous.approximate && ' (approximate)'}</th>
        </tr></thead>
        <tbody>{rows.map(([n, f]) => <tr key={n}><td>{n}</td><td><strong>{f(cur)}</strong></td><td>{f(prev)}</td></tr>)}</tbody>
      </table></div>
      {(d.current.approximate || d.previous.approximate) && <p className="muted">Approximate means a month in that period uses past monthly totals, at today&apos;s average cost.</p>}

      {split('Etsy and store', [['Etsy', d.current.byChannel.etsy], ['Store', d.current.byChannel.store]])}
      {split('By product', Object.entries(d.current.bySku).map(([id, t]) => [name.get(id) ?? id, t] as [string, Totals]))}
    </>
  );
}
