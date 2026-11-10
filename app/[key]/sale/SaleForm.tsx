'use client';
import { startTransition, useActionState, useEffect, useState } from 'react';
import { recordSale } from '../actions';

export type SaleProduct = { id: string; name: string; grams: number; stock: number; store_price: number };

const price = (cents: number) => (cents / 100).toFixed(2);

export default function SaleForm({ keyValue, products, firstId, today, etsyConnected, connectedDay }: { keyValue: string; products: SaleProduct[]; firstId: string; today: string; etsyConnected: boolean; connectedDay: string | null }) {
  const [state, run, pending] = useActionState(recordSale.bind(null, keyValue), null);
  // The sale id is made on the server at render so a double-tap sends the same id twice; every reply issues a fresh one.
  const [id, setId] = useState(firstId);
  const [pid, setPid] = useState('');
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState('');

  useEffect(() => {
    if (!state) return;
    setId(crypto.randomUUID()); // any reply means this id is spent; a lost reply keeps it, and the server then answers "Already saved"
    if (state.saved) { setPid(''); setQty(1); setCost(''); }
  }, [state]);

  return (
    <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); startTransition(() => run(f)); }}>
      <input type="hidden" name="id" value={id} />
      <fieldset className="products">
        <legend>Product</legend>
        {products.map(p => (
          <label key={p.id} className={`choice big${pid === p.id ? ' on' : ''}`}>
            <input type="radio" name="product_id" value={p.id} checked={pid === p.id}
              onChange={() => { setPid(p.id); setCost(price(p.store_price)); }} />
            <strong>{p.name}</strong>
            <span>{p.grams} g · {p.stock} left</span>
          </label>
        ))}
        {products.length === 0 && <p>No products yet. Add them in Settings.</p>}
      </fieldset>

      <div className="row">
        <label>Quantity</label>
        <div className="stepper">
          <button type="button" aria-label="One less" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
          <input name="qty" inputMode="numeric" value={qty} onChange={e => setQty(Number(e.target.value.replace(/\D/g, '')) || 0)} aria-label="Quantity" />
          <button type="button" aria-label="One more" onClick={() => setQty(q => q + 1)}>+</button>
        </div>
      </div>

      <div className="row">
        <label htmlFor="price">Price each (USD)</label>
        <input id="price" name="price" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} />
      </div>

      <fieldset className="channel">
        <legend>Channel</legend>
        <div className="choices">
          <label className="choice"><input type="radio" name="channel" value="store" defaultChecked /> Store</label>
          <label className="choice"><input type="radio" name="channel" value="etsy" /> {etsyConnected && connectedDay ? `Etsy (orders before ${Number(connectedDay.slice(5, 7))}/${Number(connectedDay.slice(8))})` : 'Etsy'}</label>
        </div>
      </fieldset>

      <details key={id}>
        <summary className="link">Different date</summary>
        <div className="row">
          <label htmlFor="sold_on">Sale date</label>
          <input id="sold_on" type="date" name="sold_on" defaultValue={today} />
        </div>
      </details>

      {state?.error && <p role="alert" className="error">{state.error}</p>}
      {state?.saved && <p role="status" className="ok">{state.saved}</p>}
      <button type="submit" className="primary" disabled={pending}>{pending ? 'Saving…' : 'Save sale'}</button>
    </form>
  );
}
