import { requireKey } from '@/lib/access';
import { loadSnapshot } from '@/lib/data';
import { US_ZONES } from '@/lib/forms';
import type { Product } from '@/lib/types';
import { saveProductAction, setRateAction, setTimeZoneAction } from '../actions';
import { ActionForm } from '../ui';

export const dynamic = 'force-dynamic';

function ProductFields({ p }: { p?: Product }) {
  return (
    <div className="lines">
      <div className="row"><label>SKU<input name="sku" defaultValue={p?.sku} required /></label></div>
      <div className="row"><label>Name<input name="name" defaultValue={p?.name} required /></label></div>
      <div className="row"><label>Grams<input name="grams" inputMode="numeric" defaultValue={p?.grams} required /></label></div>
      <div className="row"><label>Packaging
        <select name="packaging" defaultValue={p?.packaging ?? 'bag'}><option value="bag">Bag</option><option value="can">Can</option></select></label></div>
      <div className="row"><label>Store price (USD)<input name="store_price" inputMode="decimal" defaultValue={p ? (p.store_price / 100).toFixed(2) : ''} required /></label></div>
      <div className="row"><label>Low stock at<input name="low_stock_at" inputMode="numeric" defaultValue={p?.low_stock_at ?? 3} /></label></div>
      <div className="row"><label>Etsy listing id (optional)<input name="etsy_listing_id" defaultValue={p?.etsy_listing_id ?? ''} /></label></div>
      <div className="row"><label>Details (optional)<input name="details" defaultValue={p?.details} /></label></div>
    </div>
  );
}

export default async function SettingsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const s = await loadSnapshot();
  const years = Object.keys(s.rates).map(Number).sort();
  return (
    <>
      <h1>Settings</h1>

      <h2>Time zone</h2>
      <p className="muted">Days and months in reports follow this.{!s.timeZone && ' Not set yet.'}</p>
      <ActionForm action={setTimeZoneAction.bind(null, key)} submit="Save time zone">
        <div className="row"><select name="time_zone" defaultValue={s.timeZone ?? ''} aria-label="Time zone">
          <option value="" disabled>Choose…</option>
          {US_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
        </select></div>
      </ActionForm>

      <h2>Exchange rates</h2>
      <p className="muted">VND per USD, one rate for each year.</p>
      <ul>{years.map(y => <li key={y}>{y}: {s.rates[y].toLocaleString('en-US')} VND per USD</li>)}{years.length === 0 && <li>No rates yet.</li>}</ul>
      <ActionForm action={setRateAction.bind(null, key)} submit="Save rate">
        <div className="row"><label>Year<input name="year" inputMode="numeric" defaultValue={new Date().getFullYear()} /></label></div>
        <div className="row"><label>VND per USD<input name="vnd_per_usd" inputMode="decimal" placeholder="25000" /></label></div>
      </ActionForm>

      <h2>Products</h2>
      {s.products.map(p => (
        <details key={p.id} className="card" style={{ marginBottom: 8 }}>
          <summary style={{ minHeight: 48, display: 'flex', alignItems: 'center' }}>{p.sku} · {p.name}</summary>
          <ActionForm action={saveProductAction.bind(null, key, p.id)} submit="Save product"><ProductFields p={p} /></ActionForm>
        </details>
      ))}
      <details className="card" open={s.products.length === 0}>
        <summary style={{ minHeight: 48, display: 'flex', alignItems: 'center' }}>Add product</summary>
        <ActionForm action={saveProductAction.bind(null, key, '')} submit="Add product"><ProductFields /></ActionForm>
      </details>

      <h2>Export</h2>
      <a className="link" href={`/${key}/export`}>Download all data (JSON)</a>
    </>
  );
}
