import { requireKey } from '@/lib/access';
import { loadSnapshot } from '@/lib/data';
import { dayKey } from '@/lib/periods';
import { deleteExpenseAction, deleteHistoryAction, deleteSaleAction, saveExpenseAction, saveHistoryAction } from '../actions';
import { ActionForm, DeleteButton } from '../ui';

export const dynamic = 'force-dynamic';

const money = (n: number, c: string) => (c === 'USD' ? `$${(n / 100).toFixed(2)}` : `${n.toLocaleString('en-US')} ₫`);

export default async function SalesPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const s = await loadSnapshot();
  const sku = new Map(s.products.map(p => [p.id, p.sku]));
  const tz = s.timeZone ?? 'UTC';
  const today = new Date().toISOString().slice(0, 10);
  const productSelect = (
    <select name="product_id" required>{s.products.map(p => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select>
  );
  return (
    <>
      <h1>Sales</h1>
      <div className="tablewrap"><table>
        <thead><tr><th>Day</th><th>Channel</th><th>Product</th><th>Qty</th><th>Price</th><th></th></tr></thead>
        <tbody>
          {s.sales.map(x => (
            <tr key={x.id}>
              <td>{dayKey(x.sold_at, tz)}</td><td>{x.channel}</td><td>{sku.get(x.product_id)}</td><td>{x.qty}</td><td>{money(x.unit_price, x.currency)}</td>
              <td>{x.etsy_transaction_id ? 'From Etsy' : <DeleteButton action={deleteSaleAction.bind(null, key, x.id)} ask="Delete this sale? Stock goes back up." />}</td>
            </tr>
          ))}
          {s.sales.length === 0 && <tr><td colSpan={6}>No sales yet.</td></tr>}
        </tbody>
      </table></div>

      <h2>Expenses</h2>
      <ActionForm action={saveExpenseAction.bind(null, key)} submit="Add expense">
        <div className="row"><label>Date<input type="date" name="spent_on" defaultValue={today} required /></label></div>
        <div className="row"><label>Category<select name="category"><option value="packaging">Packaging</option><option value="gift">Gift</option></select></label></div>
        <div className="row"><label>Amount<input name="amount" inputMode="decimal" required /></label></div>
        <div className="row"><label>Currency<select name="currency"><option>USD</option><option>VND</option></select></label></div>
        <div className="row"><label>Note (optional)<input name="note" /></label></div>
      </ActionForm>
      <div className="tablewrap"><table>
        <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Note</th><th></th></tr></thead>
        <tbody>
          {s.expenses.map(x => (
            <tr key={x.id}>
              <td>{x.spent_on}</td><td>{x.category}</td><td>{money(x.amount, x.currency)}</td><td>{x.note}</td>
              <td><DeleteButton action={deleteExpenseAction.bind(null, key, x.id)} ask="Delete this expense?" /></td>
            </tr>
          ))}
          {s.expenses.length === 0 && <tr><td colSpan={5}>None yet.</td></tr>}
        </tbody>
      </table></div>

      <h2>Past monthly totals</h2>
      <p className="muted">For months before you started using the app. Entering a month replaces any sales recorded in that month in reports.</p>
      <ActionForm action={saveHistoryAction.bind(null, key)} submit="Save month">
        <div className="row"><label>Month<input type="month" name="month" required /></label></div>
        <div className="row"><label>Product{productSelect}</label></div>
        <div className="row"><label>Channel<select name="channel"><option value="etsy">Etsy</option><option value="store">Store</option></select></label></div>
        <div className="row"><label>Units sold<input name="units" inputMode="numeric" required /></label></div>
        <div className="row"><label>Revenue<input name="revenue" inputMode="decimal" required /></label></div>
        <div className="row"><label>Currency<select name="currency"><option>USD</option><option>VND</option></select></label></div>
        <div className="row"><label>Orders<input name="orders" inputMode="numeric" required /></label></div>
      </ActionForm>
      <div className="tablewrap"><table>
        <thead><tr><th>Month</th><th>Product</th><th>Channel</th><th>Units</th><th>Revenue</th><th>Orders</th><th></th></tr></thead>
        <tbody>
          {s.history.map(h => (
            <tr key={h.id}>
              <td>{h.month.slice(0, 7)}</td><td>{sku.get(h.product_id)}</td><td>{h.channel}</td><td>{h.units}</td><td>{money(h.revenue, h.currency)}</td><td>{h.orders}</td>
              <td><DeleteButton action={deleteHistoryAction.bind(null, key, h.id)} ask="Delete this monthly total?" /></td>
            </tr>
          ))}
          {s.history.length === 0 && <tr><td colSpan={7}>None yet.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
