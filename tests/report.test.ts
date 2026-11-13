import { test, expect } from 'vitest';
import { buildDashboard } from '@/lib/report';
import type { Snapshot } from '@/lib/data';
import type { Expense, HistoryRow, LedgerRow, Sale, StockMove } from '@/lib/types';

const month = { kind: 'month' as const };
const now = new Date('2026-11-10T12:00:00Z');
const mkSale = (id: string, qty: number, sold_at: string): Sale => ({ id, channel: 'store', sold_at, product_id: 'p1', qty, unit_price: 5000, discount: 0, currency: 'USD', etsy_receipt_id: null, etsy_transaction_id: null });
const mkMove = (s: Sale): StockMove => ({ id: `m-${s.id}`, product_id: 'p1', qty_delta: -s.qty, kind: 'sale', ref: s.id, reason: '', at: s.sold_at });

const novSale = mkSale('s-nov', 2, '2026-11-05T15:00:00Z');
const octSale = mkSale('s-oct', 2, '2026-10-05T15:00:00Z');
const snap: Snapshot = {
  products: [{ id: 'p1', sku: 'M100', name: 'Matcha 100g', grams: 100, packaging: 'can', details: '', store_price: 5000, etsy_listing_id: null, low_stock_at: 3, active: true }],
  shipments: [{ id: 'sh1', paid_by: 'my' as const, freight_paid_by: 'my' as const, received_on: '2026-10-01', freight_amount: 2000, freight_currency: 'USD', note: '' }],
  lines: [{ id: 'l1', shipment_id: 'sh1', product_id: 'p1', units: 10, vendor_amount: 10000, vendor_currency: 'USD', expiry_date: '2027-10-01' }],
  sales: [novSale, octSale],
  moves: [{ id: 'm0', product_id: 'p1', qty_delta: 10, kind: 'shipment', ref: 'l1', reason: '', at: '2026-10-01T00:00:00.000Z' }, mkMove(novSale), mkMove(octSale)],
  expenses: [], history: [], expiry: [{ id: 'e1', product_id: 'p1', expiry_date: '2027-10-01', cleared_at: null }],
  rates: { 2026: 25000 }, timeZone: 'America/New_York',
  ledger: [], issues: [], transfers: [], etsy: { status: null },
};
const exp: Expense = { id: 'x1', paid_by: 'my', spent_on: '2026-11-02', category: 'gift', amount: 1000, currency: 'USD', note: '' };
const hist = (m: string, units: number, revenue: number, orders: number): HistoryRow => ({ id: 'h1', month: m, product_id: 'p1', channel: 'etsy', units, revenue, currency: 'USD', orders });
const bigSale = mkSale('s-big', 8, '2026-11-06T15:00:00Z');

test('needs time zone', () => expect(buildDashboard({ ...snap, timeZone: null }, now, month)).toEqual({ status: 'needs_time_zone' }));
test('current month figures', () => expect((buildDashboard(snap, now, month) as any).current.shop).toMatchObject({ revenue: 10000, cogs: 2400, profit: 7600, units: 2 }));
test('same days last month', () => expect((buildDashboard(snap, now, month) as any).previous).toMatchObject({ approximate: false, shop: { revenue: 10000 } }));
test('VND without a rate names the year', () => expect(buildDashboard({ ...snap, expenses: [{ ...exp, currency: 'VND' }], rates: {} }, now, month)).toMatchObject({ status: 'missing_rate', year: 2026 }));
test('a missing rate still carries stock and warnings', () => {
  const expired = [{ id: 'e1', product_id: 'p1', expiry_date: '2026-11-01', cleared_at: null }];
  const d = buildDashboard({ ...snap, expiry: expired, expenses: [{ ...exp, currency: 'VND' }], rates: {} }, now, month) as any;
  expect(d).toMatchObject({ status: 'missing_rate', year: 2026 });
  expect(d.warnings).toContainEqual({ productId: 'p1', kind: 'expiry', level: 'expired', expiryDate: '2026-11-01' });
  expect(d.stock[0]).toMatchObject({ productId: 'p1', stock: 6 });
});
test('expense lowers profit', () => expect((buildDashboard({ ...snap, expenses: [exp] }, now, month) as any).current.shop).toMatchObject({ expenses: 1000, profit: 6600 }));
test('history replaces last month and is marked approximate', () => expect((buildDashboard({ ...snap, history: [hist('2026-10-01', 4, 20000, 3)] }, now, month) as any).previous).toMatchObject({ approximate: true, shop: { revenue: 20000, orders: 3 } }));
test('stock and warnings', () => {
  // The plan's snapshot carries only the sale; stock is the sum of moves, so its move goes in too.
  const d = buildDashboard({ ...snap, sales: [...snap.sales, bigSale], moves: [...snap.moves, mkMove(bigSale)] }, now, month) as any;
  expect(d.stock[0].stock).toBe(-2);
  expect(d.warnings).toContainEqual({ productId: 'p1', kind: 'negative_stock', stock: -2 });
});
test('selling past zero still gets a cost', () => {
  const d = buildDashboard({ ...snap, sales: [...snap.sales, bigSale], moves: [...snap.moves, mkMove(bigSale)] }, now, month) as any;
  expect(d.current.shop.cogs).toBe(2400 + 8 * 1200);
});
test('expired product shows as expired', () => {
  const d = buildDashboard({ ...snap, expiry: [{ id: 'e1', product_id: 'p1', expiry_date: '2026-11-01', cleared_at: null }] }, now, month) as any;
  expect(d.warnings).toContainEqual({ productId: 'p1', kind: 'expiry', level: 'expired', expiryDate: '2026-11-01' });
});
test('week range and daily series', () => { const d = buildDashboard(snap, now, { kind: 'week' }) as any; expect(d.windows.current).toEqual({ from: '2026-11-09', to: '2026-11-10' }); expect(d.series.current).toHaveLength(2); });

const led = (entry_id: string, category: LedgerRow['category'], amount: number, product_id: string | null = null): LedgerRow =>
  ({ entry_id, at: '2026-11-05T15:00:00Z', category, amount, currency: 'USD', product_id, ledger_type: 'x' });
const shop = (ledger: LedgerRow[]) => (buildDashboard({ ...snap, ledger }, now, month) as any);
test('discount lowers revenue', () => {
  const d = buildDashboard({ ...snap, sales: [{ ...novSale, discount: 1500 }, octSale] }, now, month) as any;
  expect(d.current.shop.revenue).toBe(8500);
});
test('fee and ads ledger rows count as costs and a refund lowers them', () => {
  const d = shop([led('a', 'fee', -300), led('b', 'ads', -200), led('c', 'fee', 100)]);
  expect(d.current.shop).toMatchObject({ fees: 200, ads: 200, profit: 7600 - 400 });
});
test("fee with product counts in that SKU's profit, ads don't", () => {
  const d = shop([led('a', 'fee', -300, 'p1'), led('b', 'ads', -200, 'p1')]);
  expect(d.current.bySku.p1.profit).toBe(7600 - 300);
});
test('uncategorized ledger total is reported and not counted in profit', () => {
  const d = shop([led('a', 'uncategorized', -450), led('b', 'ignore', -999)]);
  expect(d.uncategorizedFeesCents).toBe(450);
  expect(d.current.shop.profit).toBe(7600);
});

const all = { kind: 'all' as const };
test('lifetime starts at an early ledger fee, before the first sale', () => {
  const d = buildDashboard({ ...snap, ledger: [{ ...led('early', 'fee', -300), at: '2026-09-24T15:00:00Z' }] }, now, all) as any;
  expect(d.lifetime).toMatchObject({ since: '2026-09-24', shop: { revenue: 20000, fees: 300, profit: 20000 - 4800 - 300 } });
  expect(d.windows).toEqual({ current: { from: '2026-09-24', to: '2026-11-10' }, previous: null });
  expect(d.previous).toBeNull();
  expect(d.series.previous).toEqual([]);
});
test('lifetime includes history months and expenses, and is approximate', () => {
  const d = buildDashboard({ ...snap, history: [hist('2026-08-01', 4, 20000, 3)], expenses: [exp] }, now, month) as any;
  expect(d.lifetime).toMatchObject({ since: '2026-08-01', approximate: true, shop: { revenue: 20000 + 10000 + 10000, expenses: 1000, orders: 3 + 1 + 1 } });
});
test('no activity gives no lifetime', () => expect((buildDashboard({ ...snap, sales: [], moves: [] }, now, all) as any).lifetime).toBeNull());
test('all time buckets by month, history month included', () => {
  const d = buildDashboard({ ...snap, history: [hist('2026-09-01', 4, 20000, 3)] }, now, all) as any;
  expect(d.series.bucket).toBe('month');
  expect(d.series.current.map((p: any) => [p.day, p.revenue])).toEqual([['2026-09-01', 20000], ['2026-10-01', 10000], ['2026-11-01', 10000]]);
});
test('month and week stay daily, long custom ranges go monthly', () => {
  expect((buildDashboard(snap, now, month) as any).series.bucket).toBe('day');
  expect((buildDashboard(snap, now, { kind: 'custom', from: '2026-08-01', to: '2026-11-10' }) as any).series.bucket).toBe('month');
});
