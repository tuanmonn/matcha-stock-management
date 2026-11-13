import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { sameDatabase } from './db-guard';

// Integration tests: run only against a throwaway Neon branch (TEST_DATABASE_URL).
describe.skipIf(!process.env.TEST_DATABASE_URL)('data layer', () => {
  let d: typeof import('@/lib/data');
  let sql: typeof import('@/lib/db').sql;
  let p: string;
  let sale: { id: string; channel: 'store'; product_id: string; qty: number; unit_price: number; sold_on: null };
  const now = new Date('2026-11-05T15:00:00Z');
  const shipment = (units: number) => ({
    paid_by: 'my' as const, freight_paid_by: 'my' as const, received_on: '2026-10-01', freight_amount: 2000, freight_currency: 'USD' as const, note: '',
    lines: [{ product_id: p, units, vendor_amount: 10000, vendor_currency: 'USD' as const, expiry_date: '2027-03-31' }],
  });

  beforeAll(async () => {
    // These tests truncate every table: never let them touch the real database.
    for (const real of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]) {
      if (sameDatabase(real, process.env.TEST_DATABASE_URL)) {
        throw new Error('TEST_DATABASE_URL points at the same database as DATABASE_URL (or DATABASE_URL_UNPOOLED); the data tests refuse to run.');
      }
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    d = await import('@/lib/data');
    sql = (await import('@/lib/db')).sql;
  });

  beforeEach(async () => {
    await sql`truncate sales, stock_moves, shipment_lines, shipments, expenses, transfers, monthly_history, expiry_dates, fx_rates, products cascade`;
    await sql`update settings set time_zone = null`;
    p = await d.saveProduct({ sku: 'M30', name: 'Matcha 30g', grams: 30, packaging: 'bag', store_price: 1400, details: '', etsy_listing_id: null, low_stock_at: 3 });
    await d.saveShipment(shipment(10));
    sale = { id: crypto.randomUUID(), channel: 'store', product_id: p, qty: 2, unit_price: 1400, sold_on: null };
  });

  test('same sale id twice records one sale', async () => { await d.saveSale(sale, now); await d.saveSale(sale, now); const s = await d.loadSnapshot(); expect(s.sales).toHaveLength(1); expect(d.stockOf(s.moves, p)).toBe(10 - 2); });
  test('saveSale says whether the sale was new', async () => { expect(await d.saveSale(sale, now)).toBe(true); expect(await d.saveSale(sale, now)).toBe(false); });
  test('a back-dated sale lands on that day in the store time zone', async () => {
    const { dayKey } = await import('@/lib/periods');
    await d.saveSale({ ...sale, sold_on: '2026-11-05' }, now);
    expect(dayKey((await d.loadSnapshot()).sales[0].sold_at, 'America/New_York')).toBe('2026-11-05');
  });
  test('payer and transfers round-trip', async () => {
    await d.saveShipment({ ...shipment(5), paid_by: 'ngoc' });
    await d.saveTransfer({ sent_on: '2026-11-06', amount: 75050, note: 'first' });
    const s = await d.loadSnapshot();
    expect(s.shipments[0].paid_by).toBe('ngoc');
    expect(s.transfers).toEqual([{ id: expect.any(String), sent_on: '2026-11-06', amount: 75050, note: 'first' }]);
    await d.deleteTransfer(s.transfers[0].id);
    expect((await d.loadSnapshot()).transfers).toHaveLength(0);
  });
  test('deleting a sale restores stock', async () => { await d.saveSale(sale, now); await d.deleteSale(sale.id); expect(d.stockOf((await d.loadSnapshot()).moves, p)).toBe(10); });
  test('deleting a shipment removes its stock', async () => { const id = await d.saveShipment(shipment(5)); expect(d.stockOf((await d.loadSnapshot()).moves, p)).toBe(15); await d.deleteShipment(id); expect(d.stockOf((await d.loadSnapshot()).moves, p)).toBe(10); });
  test('expiry clears when stock reaches zero', async () => { await d.saveSale({ ...sale, qty: 10 }, now); expect((await d.loadSnapshot()).expiry.every(e => e.cleared_at)).toBe(true); });
  test('a re-appearing expiry date is uncleared by the next shipment', async () => {
    await d.saveSale({ ...sale, qty: 10 }, now);
    expect((await d.loadSnapshot()).expiry[0].cleared_at).not.toBeNull();
    await d.saveShipment(shipment(5));
    const e = (await d.loadSnapshot()).expiry;
    expect(e).toHaveLength(1); expect(e[0].cleared_at).toBeNull();
  });
  test('deleting the sale that emptied stock restores the expiry warning', async () => {
    await d.saveSale({ ...sale, qty: 10 }, now); await d.deleteSale(sale.id);
    const s = await d.loadSnapshot();
    expect(d.stockOf(s.moves, p)).toBe(10); expect(s.expiry[0].cleared_at).toBeNull();
  });
  test('a date cleared by hand stays cleared after an unrelated delete', async () => {
    await d.clearExpiry((await d.loadSnapshot()).expiry[0].id);
    await d.saveSale(sale, now); await d.deleteSale(sale.id);
    expect((await d.loadSnapshot()).expiry[0].cleared_at).not.toBeNull();
  });
  test('selling past zero is allowed', async () => { await d.saveSale({ ...sale, qty: 12 }, now); expect(d.stockOf((await d.loadSnapshot()).moves, p)).toBe(-2); });
  test('rows come back as numbers and day strings', async () => {
    await d.saveSale(sale, now); await d.setRate(2026, 25000);
    const s = await d.loadSnapshot();
    expect(s.sales[0]).toMatchObject({ unit_price: 1400, sold_at: '2026-11-05T15:00:00.000Z' });
    expect(s.shipments[0]).toMatchObject({ received_on: '2026-10-01', freight_amount: 2000 });
    expect(s.rates).toEqual({ 2026: 25000 });
  });
});
