import { requireKey } from '@/lib/access';
import { loadSnapshot } from '@/lib/data';
import { deleteShipmentAction, saveShipmentAction } from '../actions';
import { ActionForm, DeleteButton } from '../ui';

export const dynamic = 'force-dynamic';

const PAYER = { my: 'My', ngoc: 'Ngoc' };
const money = (n: number, c: string) => (c === 'USD' ? `$${(n / 100).toFixed(2)}` : `${n.toLocaleString('en-US')} ₫`);

export default async function ShipmentsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const s = await loadSnapshot();
  const products = s.products.filter(p => p.active);
  const sku = new Map(s.products.map(p => [p.id, p.sku]));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <h1>Shipments</h1>

      <h2>New shipment</h2>
      <ActionForm action={saveShipmentAction.bind(null, key)} submit="Save shipment">
        <div className="row"><label>Received on<input type="date" name="received_on" defaultValue={today} required /></label></div>
        <div className="row"><label>Paid by<select name="paid_by"><option value="my">My</option><option value="ngoc">Ngoc</option></select></label></div>
        <div className="cols2">
          <div className="row"><label>Freight<input name="freight" inputMode="decimal" defaultValue="0" required /></label></div>
          <div className="row"><label>Freight currency<select name="freight_currency"><option>USD</option><option>VND</option></select></label></div>
        </div>
        <div className="row"><label>Note (optional)<input name="note" /></label></div>
        <p className="muted">Fill in a row for each product that came in. Rows with no units are ignored.</p>
        {products.length === 0 && <p className="error">Add products in Settings first.</p>}
        <div className="lines">
          {products.map(p => (
            <div className="line" key={p.id}>
              <input type="hidden" name="line_product_id[]" value={p.id} />
              <strong>{p.sku} · {p.name}</strong>
              <div className="fields">
                <label>Units<input name="line_units[]" inputMode="numeric" /></label>
                <label>Vendor cost<input name="line_vendor[]" inputMode="decimal" /></label>
                <label>Vendor currency<select name="line_vendor_currency[]"><option>USD</option><option>VND</option></select></label>
                <label>Expiry date<input type="date" name="line_expiry[]" /></label>
              </div>
            </div>
          ))}
        </div>
      </ActionForm>

      <h2>Past shipments</h2>
      {s.shipments.length === 0 && <p>None yet.</p>}
      {s.shipments.map(sh => (
        <div className="card shipment" key={sh.id}>
          <p className="head"><strong>{sh.received_on}</strong> · paid by {PAYER[sh.paid_by]} · freight {money(sh.freight_amount, sh.freight_currency)}{sh.note && ` · ${sh.note}`}</p>
          <ul>
            {s.lines.filter(l => l.shipment_id === sh.id).map(l => (
              <li key={l.id}>{sku.get(l.product_id)} × {l.units}, cost {money(l.vendor_amount, l.vendor_currency)}, expires {l.expiry_date}</li>
            ))}
          </ul>
          <DeleteButton action={deleteShipmentAction.bind(null, key, sh.id)} ask="Delete this shipment? Its stock goes away too." />
        </div>
      ))}
    </>
  );
}
