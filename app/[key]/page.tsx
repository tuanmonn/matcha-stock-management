import Link from 'next/link';
import { requireKey } from '@/lib/access';
import { loadSnapshot } from '@/lib/data';
import { dismissIssueAction } from './actions';
import { parseRange } from '@/lib/forms';
import { formatUsd, formatVnd, usdCentsToVnd } from '@/lib/money';
import type { Range, Window } from '@/lib/periods';
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

type Item = { tone: 'Urgent' | 'Soon' | 'FYI'; text: string; href?: string; cta?: string; dismiss?: string };

function Todo({ warnings, name, s, uncategorizedCents, keyValue }: { warnings: Warning[]; name: Map<string, string>; s: Snapshot; uncategorizedCents: number; keyValue: string }) {
  const base = `/${keyValue}`;
  const items: Item[] = warnings.map((w): Item => {
    const n = name.get(w.productId) ?? 'Product';
    if (w.kind === 'expiry') {
      if (w.level === 'expired') return { tone: 'Urgent', text: `${n}: expired on ${dmy(w.expiryDate)}`, href: `${base}/stock`, cta: 'View stock' };
      const months = { '1m': '1 month', '2m': '2 months', '3m': '3 months' }[w.level];
      return { tone: w.level === '1m' ? 'Urgent' : 'Soon', text: `${n}: expires ${dmy(w.expiryDate)} (${months})`, href: `${base}/stock`, cta: 'View stock' };
    }
    if (w.kind === 'negative_stock') return { tone: 'Urgent', text: `${n}: Stock is −${Math.abs(w.stock)}, so check the count`, href: `${base}/stock`, cta: 'Check count' };
    return { tone: 'Soon', text: `${n}: Only ${w.stock} left`, href: `${base}/shipments`, cta: 'Add shipment' };
  });
  if (s.etsy.status === 'reconnect') items.push({ tone: 'Urgent', text: 'Etsy access ended. Reconnect in Settings. Until then, record Etsy orders on the sale screen.', href: `${base}/settings`, cta: 'Reconnect' });
  for (const i of s.issues) items.push({ tone: 'Urgent', text: i.detail, href: `${base}/settings`, cta: 'Open settings', dismiss: i.id });
  if (uncategorizedCents > 0) items.push({ tone: 'FYI', text: `${formatUsd(uncategorizedCents)} of Etsy charges this period aren't sorted into fees or ads yet.` });
  if (items.length === 0) return null;
  const order = { Urgent: 0, Soon: 1, FYI: 2 };
  items.sort((a, b) => order[a.tone] - order[b.tone]);
  return (
    <section className="attention">
      <h2>To do ({items.length})</h2>
      {items.map((x, i) => (
        <div key={i} className={`todo ${x.tone.toLowerCase()}`}>
          <span className="chip">{x.tone}</span>
          <span className="msg">{x.text}</span>
          {x.href && <Link className="btn" href={x.href}>{x.cta}</Link>}
          {x.dismiss && <form className="inline" action={dismissIssueAction.bind(null, keyValue, x.dismiss)}><button type="submit">Dismiss</button></form>}
        </div>
      ))}
    </section>
  );
}

// Delta vs the previous window; arrow and words carry the meaning, colour only reinforces it.
function Delta({ diff, text, vs }: { diff: number; text: string; vs: string }) {
  if (diff === 0) return <div className="delta">Same as {vs}</div>;
  return <div className={`delta ${diff > 0 ? 'up' : 'down'}`}>{diff > 0 ? '▲' : '▼'} {text} vs {vs}</div>;
}

// Tiny trend line for a card: no axes, hidden from screen readers.
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(26 - (hi === lo ? 13 : ((v - lo) / (hi - lo)) * 24)).toFixed(1)}`).join(' ');
  return <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke="var(--green)" strokeWidth={2} vectorEffect="non-scaling-stroke" /></svg>;
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
    return <><h1>Dashboard</h1><p><Link className="link" href={`${base}/settings`}>Set the store&apos;s time zone in Settings</Link></p><Todo warnings={[]} name={new Map()} s={s} uncategorizedCents={0} keyValue={key} /></>;
  }
  const name = new Map(s.products.map(p => [p.id, p.name]));
  if (d.status === 'missing_rate') {
    return <><h1>Dashboard</h1><p>Add the {d.year} exchange rate in <Link href={`${base}/settings`}>Settings</Link> to see reports.</p><Todo warnings={d.warnings} name={name} s={s} uncategorizedCents={0} keyValue={key} /></>;
  }

  const year = Number(d.today.slice(0, 4));
  const vnd = (cents: number) => (s.rates[year] ? formatVnd(usdCentsToVnd(cents, year, s.rates)) : '—');
  const cur = d.current.shop, prevS = d.previous, prev = prevS?.shop;
  const custom = range.kind === 'custom' ? range : { from: d.windows.current.from, to: d.windows.current.to };
  const life = d.lifetime;

  const vs = d.windows.previous ? label(d.windows.previous) : '';
  const approx = d.current.approximate ? '(approximate)' : '';
  const spark = (m: 'profit' | 'revenue' | 'orders') => <Spark values={d.series.current.map(p => p[m])} />;
  const kpi = (title: string, big: React.ReactNode, sub: React.ReactNode, delta: React.ReactNode, sp?: React.ReactNode) => (
    <div className="card kpi"><h3>{title}</h3><div className="big">{big}</div>{sub && <div className="sub">{sub}</div>}{delta}{sp}</div>
  );
  const usdDelta = (c: number, p: number) => prev && <Delta diff={c - p} text={formatUsd(Math.abs(c - p))} vs={vs} />;
  const avg = (t: Totals) => (t.orders ? Math.round(t.revenue / t.orders) : null);
  const curAvg = avg(cur), prevAvg = prev ? avg(prev) : null;

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
  const stockOfId = new Map(d.stock.map(x => [x.productId, x.stock]));
  const empty = { revenue: 0, cogs: 0, expenses: 0, fees: 0, ads: 0, profit: 0, margin: null, units: 0, orders: 0 } as Totals;
  const ids = new Set([...s.products.filter(p => p.active).map(p => p.id), ...Object.keys(d.current.bySku)]);
  const products = [...ids].map(id => [id, name.get(id) ?? id, d.current.bySku[id] ?? empty] as const).sort((a, b) => b[2].profit - a[2].profit);
  const shared = d.current.byChannel.etsy.profit + d.current.byChannel.store.profit - cur.profit;
  const sharedSku = Object.values(d.current.bySku).reduce((n, t) => n + t.profit, 0) - cur.profit;
  const sharedNote = (v: number, by: string) => v > 0 && <p className="muted">Shop costs not split by {by} (expenses, ads, other Etsy fees): {formatUsd(v)}. {by === 'channel' ? 'Etsy + Store' : 'Products'} − this = total profit.</p>;
  const flow: [string, number, boolean][] = [['Sales', cur.revenue, false], ['Product cost', cur.cogs, true], ['Etsy fees', cur.fees, true], ['Ads', cur.ads, true], ['Expenses', cur.expenses, true], ['Take-home', cur.profit, false]];
  const rows = flow.filter(([l, v]) => v !== 0 || l === 'Sales' || l === 'Take-home');
  const seg = (k: Range['kind'], text: string, href: string) => <Link className={`link${range.kind === k ? ' on' : ''}`} aria-current={range.kind === k ? 'page' : undefined} href={href}>{text}</Link>;

  return (
    <>
      <h1>Dashboard</h1>

      <p><Link className="link" href={`${base}/settle`}>Settle up: who gets what, and what Ngoc sends →</Link></p>

      {life && (
        <section className="hero">
          <h2>Since you started</h2>
          <div className="big">{formatUsd(life.shop.profit)}</div>
          <div className="vnd">{vnd(life.shop.profit)} {life.approximate ? '(approximate)' : ''}</div>
          <p>Profit since {dmy(life.since)} · {life.shop.orders} orders · {formatUsd(life.shop.revenue)} in sales{life.shop.revenue > 0 && ` · you kept ${Math.round((life.shop.profit / life.shop.revenue) * 100)}¢ of every $1`}</p>
        </section>
      )}

      <div className="seg">
        {seg('week', 'This week', `${base}?range=week`)}
        {seg('month', 'This month', base)}
        {seg('all', 'All time', `${base}?range=all`)}
        {seg('custom', 'Custom', `${base}?range=custom&from=${custom.from}&to=${custom.to}`)}
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

      <h2>This period</h2>
      <div className="kpis">
        {kpi('Take-home', formatUsd(cur.profit), <>{vnd(cur.profit)} {approx}</>, usdDelta(cur.profit, prev?.profit ?? 0), spark('profit'))}
        {kpi('Revenue', formatUsd(cur.revenue), approx, usdDelta(cur.revenue, prev?.revenue ?? 0), spark('revenue'))}
        {kpi('Orders', String(cur.orders), approx, prev && <Delta diff={cur.orders - prev.orders} text={`${Math.abs(cur.orders - prev.orders)} orders`} vs={vs} />, spark('orders'))}
        {kpi('Average order', curAvg === null ? '—' : formatUsd(curAvg), '', curAvg !== null && prevAvg !== null && <Delta diff={curAvg - prevAvg} text={formatUsd(Math.abs(curAvg - prevAvg))} vs={vs} />)}
      </div>
      {(d.current.approximate || prevS?.approximate) && <p className="muted">Approximate means a month in that period uses past monthly totals, at today&apos;s average cost.</p>}

      <Todo warnings={d.warnings} name={name} s={s} uncategorizedCents={d.uncategorizedFeesCents} keyValue={key} />

      <h2>Where the money went</h2>
      {cur.revenue === 0 ? <p className="muted">No sales in this period.</p> : (
        <div className="card flow">{rows.map(([l, v, cost]) => {
          const share = (v / cur.revenue) * 100;
          return (
            <div key={l} className={l === 'Take-home' ? 'fl total' : 'fl'}>
              <span>{l}</span><span className="n">{cost ? '−' : ''}{formatUsd(v)}</span><span className="n">{Math.round(share)}% of sales</span>
              <div className={`bar${cost ? ' cost' : ''}`}><span style={{ width: `${Math.max(0, Math.min(100, share))}%` }} /></div>
            </div>
          );
        })}</div>
      )}

      <h2>Trend by {d.series.bucket}</h2>
      <Chart current={d.series.current} previous={d.series.previous} bucket={d.series.bucket} />

      <h2>By product</h2>
      <div className="tablewrap"><table>
        <thead><tr><th>Product</th><th className="n">Profit</th><th className="n">Units</th><th className="n">Margin</th><th className="n">Stock left</th></tr></thead>
        <tbody>{products.map(([id, k, t]) => (
          <tr key={id}><td>{k}</td><td className="n">{formatUsd(t.profit)}</td><td className="n">{t.units}</td><td className="n">{pct(t.margin)}</td><td className="n">{stockOfId.get(id) ?? '—'}</td></tr>
        ))}</tbody>
      </table></div>
      {sharedNote(sharedSku, 'product')}

      <h2>Etsy and store</h2>
      <div className="pair">{channel('Etsy', d.current.byChannel.etsy)}{channel('Store', d.current.byChannel.store)}</div>
      {sharedNote(shared, 'channel')}
    </>
  );
}
