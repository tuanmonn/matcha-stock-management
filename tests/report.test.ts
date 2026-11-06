import { test, expect } from 'vitest';
import { buildDashboard } from '@/lib/report';
import type { Snapshot } from '@/lib/data';
import type { Expense, HistoryRow, Sale, StockMove } from '@/lib/types';

const month = { kind: 'month' as const };
const now = new Date('2026-11-10T12:00:00Z');
const mkSale = (id: string, qty: number, sold_at: string): Sale => ({ id, channel: 'store', sold_at, product_id: 'p1', qty, unit_price: 5000, currency: 'USD', etsy_receipt_id: null, etsy_transaction_id: null });
const mkMove = (s: Sale): StockMove => ({ id: `m-${s.id}`, product_id: 'p1', qty_delta: -s.qty, kind: 'sale', ref: s.id, reason: '', at: s.sold_at });

const novSale = mkSale('s-nov', 2, '2026-11-05T15:00:00Z');
const octSale = mkSale('s-oct', 2, '2026-10-05T15:00:00Z');
const snap: Snapshot = {
  products: [{ id: 'p1', sku: 'M100', name: 'Matcha 100g', grams: 100, packaging: 'can', details: '', store_price: 5000, etsy_listing_id: null, low_stock_at: 3, active: true }],
  shipments: [{ id: 'sh1', received_on: '2026-10-01', freight_amount: 2000, freight_currency: 'USD', note: '' }],
  lines: [{ id: 'l1', shipment_id: 'sh1', product_id: 'p1', units: 10, vendor_amount: 10000, vendor_currency: 'USD', expiry_date: '2027-10-01' }],
  sales: [novSale, octSale],
  moves: [{ id: 'm0', product_id: 'p1', qty_delta: 10, kind: 'shipment', ref: 'l1', reason: '', at: '2026-10-01T00:00:00.000Z' }, mkMove(novSale), mkMove(octSale)],
  expenses: [], history: [], expiry: [{ id: 'e1', product_id: 'p1', expiry_date: '2027-10-01', cleared_at: null }],
  rates: { 2026: 25000 }, timeZone: 'America/New_York',
};
const exp: Expense = { id: 'x1', spent_on: '2026-11-02', category: 'gift', amount: 1000, currency: 'USD', note: '' };
const hist = (m: string, units: number, revenue: number, orders: number): HistoryRow => ({ id: 'h1', month: m, product_id: 'p1', channel: 'etsy', units, revenue, currency: 'USD', orders });
const bigSale = mkSale('s-big', 8, '2026-11-06T15:00:00Z');

test('needs time zone', () => expect(buildDashboard({ ...snap, timeZone: null }, now, month)).toEqual({ status: 'needs_time_zone' }));
test('current month figures', () => expect((buildDashboard(snap, now, month) as any).current.shop).toMatchObject({ revenue: 10000, cogs: 2400, profit: 7600, units: 2 }));
test('same days last month', () => expect((buildDashboard(snap, now, month) as any).previous).toMatchObject({ approximate: false, shop: { revenue: 10000 } }));
test('VND without a rate names the year', () => expect(buildDashboard({ ...snap, expenses: [{ ...exp, currency: 'VND' }], rates: {} }, now, month)).toEqual({ status: 'missing_rate', year: 2026 }));
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
