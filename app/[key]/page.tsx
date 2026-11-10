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

function Warnings({ warnings, name, s, uncategorizedCents, keyValue }: { warnings: Warning[]; name: Map<string, string>; s: Snapshot; uncategorizedCents: number; keyValue: string }) {
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
  const items = warnings.map(warn);
  const reconnect = s.etsy.status === 'reconnect';
  const count = items.length + s.issues.length + (reconnect ? 1 : 0) + (uncategorizedCents > 0 ? 1 : 0);
  if (count === 0) return null;
  return (
    <section className="attention">
      <h2>Needs attention ({count})</h2>
      {reconnect && <p className="warn bad">Etsy access ended. Reconnect in Settings. Until then, record Etsy orders on the sale screen.</p>}
      {s.issues.map(i => (
        <form key={i.id} action={dismissIssueAction.bind(null, keyValue, i.id)}>
          <p className="warn bad">{i.detail} <button type="submit">Dismiss</button></p>
        </form>
      ))}
      {items.filter(x => x.bad).map((x, i) => <p key={i} className="warn bad">{x.text}</p>)}
      {items.filter(x => !x.bad).map((x, i) => <p key={i} className="warn">{x.text}</p>)}
      {uncategorizedCents > 0 && <p className="warn">{formatUsd(uncategorizedCents)} of Etsy charges this period aren&apos;t sorted into fees or ads yet.</p>}
    </section>
  );
}

// Delta vs the previous window; arrow and words carry the meaning, colour only reinforces it.
function Delta({ diff, text, vs }: { diff: number; text: string; vs: string }) {
  if (diff === 0) return <div className="delta">Same as {vs}</div>;
  return <div className={`delta ${diff > 0 ? 'up' : 'down'}`}>{diff > 0 ? '▲' : '▼'} {text} vs {vs}</div>;
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
    return <><h1>Dashboard</h1><p><Link className="link" href={`${base}/settings`}>Set the store&apos;s time zone in Settings</Link></p><Warnings warnings={[]} name={new Map()} s={s} uncategorizedCents={0} keyValue={key} /></>;
  }
  const name = new Map(s.products.map(p => [p.id, p.name]));
  if (d.status === 'missing_rate') {
    return <><h1>Dashboard</h1><p>Add the {d.year} exchange rate in <Link href={`${base}/settings`}>Settings</Link> to see reports.</p><Warnings warnings={d.warnings} name={name} s={s} uncategorizedCents={0} keyValue={key} /></>;
  }

  const year = Number(d.today.slice(0, 4));
  const vnd = (cents: number) => (s.rates[year] ? formatVnd(usdCentsToVnd(cents, year, s.rates)) : '—');
  const cur = d.current.shop, prev = d.previous.shop;
  const custom = range.kind === 'custom' ? range : { from: d.windows.current.from, to: d.windows.current.to };

  const vs = label(d.windows.previous);
  const kpi = (title: string, big: React.ReactNode, sub: React.ReactNode, delta: React.ReactNode) => (
    <div className="card kpi"><h3>{title}</h3><div className="big">{big}</div><div className="sub">{sub}</div>{delta}</div>
  );
  const usdDelta = (c: number, p: number) => <Delta diff={c - p} text={formatUsd(Math.abs(c - p))} vs={vs} />;
  const approx = d.current.approximate ? '(approximate)' : '';

  const channel = (title: string, t: Totals) => (
    <div className="card kpi">
      <h3>{title}</h3>
      <div className="big">{formatUsd(t.profit)}</div>
      <div className="sub">Profit before shop costs</div>
      <div className="sub">{formatUsd(t.revenue)} revenue · {t.units} units · {t.orders} orders</div>
      {cur.revenue > 0 && <>
        <div className="bar"><span style={{ width: `${Math.max(0, Math.min(100, (t.revenue / cur.revenue) * 100))}%` }} /></div>
        <div className="sub">{Math.round((t.revenue / cur.revenue) * 100)}% of revenue</div>
      </>}
    </div>
  );
  const products = Object.entries(d.current.bySku).map(([id, t]) => [name.get(id) ?? id, t] as [string, Totals]).sort((a, b) => b[1].profit - a[1].profit);
  const shared = d.current.byChannel.etsy.profit + d.current.byChannel.store.profit - cur.profit;
  const sharedSku = Object.values(d.current.bySku).reduce((n, t) => n + t.profit, 0) - cur.profit;
  const sharedNote = (v: number, by: string) => v > 0 && <p className="muted">Shop costs not split by {by} (expenses, ads, other Etsy fees): {formatUsd(v)}. {by === 'channel' ? 'Etsy + Store' : 'Products'} − this = total profit.</p>;
  const mDiff = cur.margin !== null && prev.margin !== null ? (cur.margin - prev.margin) * 100 : null;

  return (
    <>
      <h1>Dashboard</h1>

      <div className="seg">
        <Link className={`link${range.kind === 'week' ? ' on' : ''}`} aria-current={range.kind === 'week' ? 'page' : undefined} href={`${base}?range=week`}>This week</Link>
        <Link className={`link${range.kind === 'month' ? ' on' : ''}`} aria-current={range.kind === 'month' ? 'page' : undefined} href={base}>This month</Link>
        <Link className={`link${range.kind === 'custom' ? ' on' : ''}`} aria-current={range.kind === 'custom' ? 'page' : undefined} href={`${base}?range=custom&from=${custom.from}&to=${custom.to}`}>Custom</Link>
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

      <div className="kpis">
        {kpi('Profit', formatUsd(cur.profit), <>{vnd(cur.profit)} {approx}</>, usdDelta(cur.profit, prev.profit))}
        {kpi('Margin', pct(cur.margin), approx, mDiff !== null && <Delta diff={Math.round(mDiff * 10)} text={`${Math.abs(mDiff).toFixed(1)} pts`} vs={vs} />)}
        {kpi('Revenue', formatUsd(cur.revenue), approx, usdDelta(cur.revenue, prev.revenue))}
        {kpi('Units / Orders', `${cur.units} units`, `${cur.orders} orders ${approx}`, <Delta diff={cur.units - prev.units} text={`${Math.abs(cur.units - prev.units)} units`} vs={vs} />)}
      </div>
      {(d.current.approximate || d.previous.approximate) && <p className="muted">Approximate means a month in that period uses past monthly totals, at today&apos;s average cost.</p>}

      <Warnings warnings={d.warnings} name={name} s={s} uncategorizedCents={d.uncategorizedFeesCents} keyValue={key} />

      <h2>Profit by day</h2>
      <Chart current={d.series.current} previous={d.series.previous} />

      <h2>Etsy and store</h2>
      <div className="pair">{channel('Etsy', d.current.byChannel.etsy)}{channel('Store', d.current.byChannel.store)}</div>
      {sharedNote(shared, 'channel')}

      <h2>By product</h2>
      <div className="tablewrap"><table>
        <thead><tr><th></th><th className="n">Profit</th><th className="n">Revenue</th><th className="n">Units</th><th className="n">Orders</th></tr></thead>
        <tbody>{products.map(([k, t]) => (
          <tr key={k}><td>{k}</td><td className="n">{formatUsd(t.profit)}</td><td className="n">{formatUsd(t.revenue)}</td><td className="n">{t.units}</td><td className="n">{t.orders}</td></tr>
        ))}</tbody>
      </table></div>
      {sharedNote(sharedSku, 'product')}
    </>
  );
}
