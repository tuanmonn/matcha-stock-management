import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { sameDatabase } from './db-guard';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const list = (results: unknown[]) => json(200, { count: results.length, results });

describe.skipIf(!process.env.TEST_DATABASE_URL)('etsy sync', () => {
  let s: typeof import('@/lib/etsy/sync');
  let d: typeof import('@/lib/data');
  let sql: typeof import('@/lib/db').sql;
  let p: string;
  const now = new Date('2026-11-09T12:00:00Z');
  const connected = '2026-10-01T00:00:00Z';
  const ts = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  const receipt = (listing = 555, paid = '2026-11-08T10:00:00Z') => ({
    receipt_id: 900, created_timestamp: ts(paid),
    transactions: [{ transaction_id: 7001, listing_id: listing, title: 'Matcha', quantity: 2, price: { amount: 1400, divisor: 100, currency_code: 'USD' }, paid_timestamp: ts(paid), shop_coupon: 0, buyer_coupon: 0 }],
  });
  const entry = (id: number, at: string, type = 'transaction') => ({ entry_id: id, ledger_type: type, reference_type: 'transaction', reference_id: '7001', amount: -50, currency: 'USD', created_timestamp: ts(at) });

  beforeAll(async () => {
    for (const real of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]) {
      if (sameDatabase(real, process.env.TEST_DATABASE_URL)) {
        throw new Error('TEST_DATABASE_URL points at the same database as DATABASE_URL (or DATABASE_URL_UNPOOLED); the etsy sync tests refuse to run.');
      }
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ETSY_API_KEY = 'key'; process.env.ETSY_SHARED_SECRET = 'secret';
    s = await import('@/lib/etsy/sync');
    d = await import('@/lib/data');
    sql = (await import('@/lib/db')).sql;
  });

  beforeEach(async () => {
    await sql`truncate sales, stock_moves, shipment_lines, shipments, expiry_dates, etsy_ledger, sync_issues, products cascade`;
    await sql`update settings set etsy_shop_id = '123', etsy_connected_at = ${connected}, etsy_status = 'connected', etsy_access_token = 'at', etsy_refresh_token = 'rt', etsy_expires_at = ${new Date(Date.now() + 3600_000).toISOString()} where id = 1`;
    p = await d.saveProduct({ sku: 'M30', name: 'Matcha 30g', grams: 30, packaging: 'bag', store_price: 1400, details: '', etsy_listing_id: '555', low_stock_at: 3 });
    await d.saveShipment({ received_on: '2026-10-01', freight_amount: 0, freight_currency: 'USD', note: '', lines: [{ product_id: p, units: 10, vendor_amount: 1000, vendor_currency: 'USD', expiry_date: '2027-03-31' }] });
  });

  const stock = async () => Number((await sql`select sum(qty_delta) as n from stock_moves where product_id = ${p}`)[0].n);

  test('importReceipt twice records once', async () => {
    expect(await s.importReceipt(receipt())).toBe(1);
    expect(await s.importReceipt(receipt())).toBe(0);
    expect(await sql`select 1 from sales where channel = 'etsy'`).toHaveLength(1);
    expect(await sql`select 1 from stock_moves where kind = 'sale'`).toHaveLength(1);
    expect(await stock()).toBe(8);
  });

  test('importReceipt resolves unknown_listing once linked', async () => {
    await sql`update products set etsy_listing_id = null`;
    expect(await s.importReceipt(receipt())).toBe(0);
    expect((await sql`select resolved_at from sync_issues where kind = 'unknown_listing' and ref = '7001'`)[0].resolved_at).toBeNull();
    await sql`update products set etsy_listing_id = '555'`;
    expect(await s.importReceipt(receipt())).toBe(1);
    expect((await sql`select resolved_at from sync_issues where kind = 'unknown_listing' and ref = '7001'`)[0].resolved_at).not.toBeNull();
  });

  test('importLedger is idempotent across overlapping windows', async () => {
    await s.importReceipt(receipt());
    const f = (async (url: string) => (new URL(url).pathname.endsWith('/ledger-entries') ? list([entry(1, '2026-11-08T11:00:00Z'), entry(2, '2026-11-08T12:00:00Z', 'prolist')]) : json(404, {}))) as unknown as typeof fetch;
    expect(await s.importLedger(now, f)).toBe(2);
    expect(await s.importLedger(now, f)).toBe(0);
    const rows = await sql`select entry_id, category, product_id, reference_type, raw from etsy_ledger order by entry_id`;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ category: 'fee', product_id: p, reference_type: 'transaction' });
    expect(rows[0].raw.entry_id).toBe(1);
    expect(rows[1].category).toBe('ads');
  });

  test('importLedger starts at 1 January of the connection year when empty', async () => {
    const urls: string[] = [];
    const f = (async (url: string) => { urls.push(url); return list([]); }) as unknown as typeof fetch;
    await s.importLedger(now, f);
    expect(new URL(urls[0]).searchParams.get('min_created')).toBe(String(ts('2026-01-01T00:00:00Z')));
    expect(urls.length).toBeGreaterThan(1); // ~10 months split into 30-day chunks
  });

  test('importLedger keeps non-USD charges out of the categories', async () => {
    const f = (async () => list([{ ...entry(5, '2026-11-08T11:00:00Z'), currency: 'EUR' }])) as unknown as typeof fetch;
    await s.importLedger(now, f);
    expect((await sql`select category from etsy_ledger where entry_id = '5'`)[0].category).toBe('uncategorized');
    expect((await sql`select detail from sync_issues where ref = 'ledger-currency'`)[0].detail).toBe("Etsy charges in EUR can't be counted yet.");
  });

  test('checkMismatches resolves fixed mismatches', async () => {
    const f = (quantity: number) => (async () => list([{ listing_id: 555, quantity, has_variations: false, title: 'Matcha' }])) as unknown as typeof fetch;
    expect(await s.checkMismatches(f(5))).toBe(1);
    expect((await sql`select detail, resolved_at from sync_issues where kind = 'mismatch'`)[0]).toMatchObject({ detail: 'M30: Etsy 5, app 10', resolved_at: null });
    expect(await s.checkMismatches(f(10))).toBe(0);
    expect((await sql`select resolved_at from sync_issues where kind = 'mismatch'`)[0].resolved_at).not.toBeNull();
  });

  test('catchUp pulls paid receipts from the window and imports them', async () => {
    const urls: string[] = [];
    const f = (async (url: string) => { urls.push(url); return list([receipt()]); }) as unknown as typeof fetch;
    expect(await s.catchUp(now, f)).toBe(1);
    const q = new URL(urls[0]).searchParams;
    expect(q.get('was_paid')).toBe('true');
    expect(q.get('min_created')).toBe(String(ts('2026-11-02T12:00:00Z')));
  });

  test('runDaily records a failing step and still runs the rest', async () => {
    const f = (async (url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/receipts')) return json(500, {});
      if (path.endsWith('/ledger-entries')) return list([entry(1, '2026-11-08T11:00:00Z')]);
      return list([{ listing_id: 555, quantity: 10, has_variations: false, title: 'Matcha' }]);
    }) as unknown as typeof fetch;
    const lines = await s.runDaily(now, f);
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('catchUp: Etsy 500 on /shops/123/receipts. It will retry tomorrow, or press Sync now in Settings.');
    expect(await sql`select 1 from etsy_ledger`).toHaveLength(1);
    expect(await sql`select 1 from sync_issues where kind = 'etsy_error' and ref = 'catchUp' and resolved_at is null`).toHaveLength(1);
    const ok = (async (url: string) => (new URL(url).pathname.endsWith('/listings') ? list([{ listing_id: 555, quantity: 10, has_variations: false, title: 'Matcha' }]) : list([]))) as unknown as typeof fetch;
    await s.runDaily(now, ok);
    expect(await sql`select 1 from sync_issues where kind = 'etsy_error' and resolved_at is null`).toHaveLength(0);
  });

  test('runDaily does nothing when not connected', async () => {
    await sql`update settings set etsy_status = 'reconnect' where id = 1`;
    expect(await s.runDaily(now, (async () => { throw new Error('no'); }) as unknown as typeof fetch)).toEqual(['Etsy not connected']);
  });

  test('fetchReceipt reads one receipt', async () => {
    let path = '';
    const f = (async (url: string) => { path = new URL(url).pathname; return json(200, receipt()); }) as unknown as typeof fetch;
    expect((await s.fetchReceipt('900', f)).receipt_id).toBe(900);
    expect(path).toBe('/v3/application/shops/123/receipts/900');
  });
});
