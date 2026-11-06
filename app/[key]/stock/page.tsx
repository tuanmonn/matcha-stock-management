import { requireKey } from '@/lib/access';
import { loadSnapshot, stockOf } from '@/lib/data';
import { formatUsd } from '@/lib/money';
import { dayKey } from '@/lib/periods';
import { buildDashboard } from '@/lib/report';
import { clearExpiryAction, saveCorrectionAction } from '../actions';
import { ActionForm } from '../ui';

export const dynamic = 'force-dynamic';

export default async function StockPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const s = await loadSnapshot();
  // Stock does not depend on the range, so any range will do. Without a time zone or rate the costs are unavailable.
  const d = buildDashboard(s, new Date(), { kind: 'month' });
  const avg = new Map(d.status === 'ok' ? d.stock.map(x => [x.productId, x.avgCostCents]) : []);
  const tz = s.timeZone ?? 'UTC';
  return (
    <>
      <h1>Stock</h1>
      {d.status !== 'ok' && <p className="warn">Average cost needs the time zone and exchange rates in Settings.</p>}

      {s.products.map(p => {
        const moves = s.moves.filter(m => m.product_id === p.id);
        const expiries = s.expiry.filter(e => e.product_id === p.id && !e.cleared_at);
        return (
          <section className="card" key={p.id} style={{ marginBottom: 12 }}>
            <h2 style={{ marginTop: 0 }}>{p.sku} · {p.name}</h2>
            <p>
              <strong>{stockOf(s.moves, p.id)}</strong> in stock
              {avg.has(p.id) && <> · average cost {formatUsd(avg.get(p.id)!)}</>}
            </p>
            <p className="muted">Expiry dates on hand:</p>
            {expiries.length === 0 && <p>None.</p>}
            {expiries.map(e => (
              <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{e.expiry_date}</span>
                <form action={clearExpiryAction.bind(null, key, e.id)}><button type="submit">Clear</button></form>
              </div>
            ))}
            <details>
              <summary style={{ minHeight: 48, display: 'flex', alignItems: 'center' }}>History ({moves.length})</summary>
              <div className="tablewrap"><table>
                <thead><tr><th>Day</th><th>Kind</th><th>Change</th><th>Reason</th></tr></thead>
                <tbody>{moves.map(m => (
                  <tr key={m.id}><td>{dayKey(m.at, tz)}</td><td>{m.kind}</td><td>{m.qty_delta > 0 ? `+${m.qty_delta}` : m.qty_delta}</td><td>{m.reason}</td></tr>
                ))}</tbody>
              </table></div>
            </details>
          </section>
        );
      })}

      <h2>Correct a count</h2>
      <ActionForm action={saveCorrectionAction.bind(null, key)} submit="Save correction">
        <div className="row"><label>Product
          <select name="product_id" required>{s.products.map(p => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></label></div>
        <div className="row"><label>Change (use − to remove)<input name="delta" inputMode="numeric" placeholder="-1" required /></label></div>
        <div className="row"><label>Reason<input name="reason" required /></label></div>
      </ActionForm>
    </>
  );
}
