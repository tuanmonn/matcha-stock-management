import { test, expect } from 'vitest';
import { parseSale, parseShipment, parseCorrection, parseExpense, parseHistory, parseProduct, parseRange, parseRate, parseTimeZone } from '@/lib/forms';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

test('valid store sale', () => expect(parseSale(fd({ id: uuid, channel: 'store', product_id: 'p1', qty: '2', price: '12.50' }))).toEqual({ ok: true, value: { id: uuid, channel: 'store', product_id: 'p1', qty: 2, unit_price: 1250, sold_on: null } }));
test('quantity 0 rejected', () => expect(parseSale(fd({ id: uuid, channel: 'store', product_id: 'p1', qty: '0', price: '1' }))).toEqual({ ok: false, error: 'Quantity must be 1 or more.' }));
test('3 decimals rejected', () => expect(parseSale(fd({ id: uuid, channel: 'store', product_id: 'p1', qty: '1', price: '1.234' })).ok).toBe(false));
test('bad sale id rejected', () => expect(parseSale(fd({ id: 'nope', channel: 'store', product_id: 'p1', qty: '1', price: '1' })).ok).toBe(false));
test('sold_on kept when valid', () => expect(parseSale(fd({ id: uuid, channel: 'etsy', product_id: 'p1', qty: '1', price: '0', sold_on: '2026-11-05' }))).toMatchObject({ ok: true, value: { sold_on: '2026-11-05', unit_price: 0 } }));
test('VND with separators', () => expect(parseExpense(fd({ spent_on: '2026-11-06', category: 'gift', amount: '1,250,000', currency: 'VND' }))).toMatchObject({ ok: true, value: { amount: 1250000 } }));
test('VND rejects decimals', () => expect(parseExpense(fd({ spent_on: '2026-11-06', category: 'gift', amount: '10.5', currency: 'VND' })).ok).toBe(false));
test('expense amount must be above 0', () => expect(parseExpense(fd({ spent_on: '2026-11-06', category: 'gift', amount: '0', currency: 'USD' })).ok).toBe(false));
test('correction needs reason', () => expect(parseCorrection(fd({ product_id: 'p1', delta: '-1', reason: ' ' })).ok).toBe(false));
test('correction delta cannot be 0', () => expect(parseCorrection(fd({ product_id: 'p1', delta: '0', reason: 'x' })).ok).toBe(false));
test('correction ok', () => expect(parseCorrection(fd({ product_id: 'p1', delta: '-1', reason: 'damaged' }))).toEqual({ ok: true, value: { product_id: 'p1', delta: -1, reason: 'damaged' } }));
test('shipment needs a line', () => expect(parseShipment(fd({ received_on: '2026-11-06', freight: '100', freight_currency: 'USD' })).ok).toBe(false));
test('shipment parses lines', () => expect(parseShipment(fd({
  received_on: '2026-11-06', freight: '200.00', freight_currency: 'USD',
  'line_product_id[]': ['p1', 'p2'], 'line_units[]': ['10', '5'], 'line_vendor[]': ['100', '1,000,000'],
  'line_vendor_currency[]': ['USD', 'VND'], 'line_expiry[]': ['2027-03-31', '2027-04-30'],
}))).toEqual({ ok: true, value: {
  received_on: '2026-11-06', freight_amount: 20000, freight_currency: 'USD', note: '',
  lines: [
    { product_id: 'p1', units: 10, vendor_amount: 10000, vendor_currency: 'USD', expiry_date: '2027-03-31' },
    { product_id: 'p2', units: 5, vendor_amount: 1000000, vendor_currency: 'VND', expiry_date: '2027-04-30' },
  ] } }));
test('shipment line units must be 1 or more', () => expect(parseShipment(fd({
  received_on: '2026-11-06', freight: '1', freight_currency: 'USD',
  'line_product_id[]': ['p1'], 'line_units[]': ['0'], 'line_vendor[]': ['1'], 'line_vendor_currency[]': ['USD'], 'line_expiry[]': ['2027-03-31'],
})).ok).toBe(false));
test('history month becomes first of month', () => expect(parseHistory(fd({ month: '2026-10', product_id: 'p1', channel: 'etsy', units: '4', revenue: '200', currency: 'USD', orders: '3' }))).toEqual({ ok: true, value: { month: '2026-10-01', product_id: 'p1', channel: 'etsy', units: 4, revenue: 20000, currency: 'USD', orders: 3 } }));
test('history rejects a bad month', () => expect(parseHistory(fd({ month: '2026-13', product_id: 'p1', channel: 'etsy', units: '4', revenue: '200', currency: 'USD', orders: '3' })).ok).toBe(false));
test('product with defaults', () => expect(parseProduct(fd({ sku: 'M30', name: 'Matcha 30g', grams: '30', packaging: 'bag', store_price: '14.00' }))).toEqual({ ok: true, value: { sku: 'M30', name: 'Matcha 30g', grams: 30, packaging: 'bag', store_price: 1400, details: '', etsy_listing_id: null, low_stock_at: 3 } }));
test('product grams must be above 0', () => expect(parseProduct(fd({ sku: 'M30', name: 'x', grams: '0', packaging: 'bag', store_price: '1' })).ok).toBe(false));
test('rate parsed', () => expect(parseRate(fd({ year: '2026', vnd_per_usd: '25,400' }))).toEqual({ ok: true, value: { year: 2026, vnd_per_usd: 25400 } }));
test('rate must be above 0', () => expect(parseRate(fd({ year: '2026', vnd_per_usd: '0' })).ok).toBe(false));
test('time zone must be a listed US zone', () => { expect(parseTimeZone(fd({ time_zone: 'America/Chicago' })).ok).toBe(true); expect(parseTimeZone(fd({ time_zone: 'Asia/Ho_Chi_Minh' })).ok).toBe(false); });
test('custom range parsed', () => expect(parseRange({ range: 'custom', from: '2026-10-01', to: '2026-10-15' })).toEqual({ kind: 'custom', from: '2026-10-01', to: '2026-10-15' }));
test('week parsed', () => expect(parseRange({ range: 'week' })).toEqual({ kind: 'week' }));
test('backwards range falls back to month', () => expect(parseRange({ range: 'custom', from: '2026-11-10', to: '2026-11-01' })).toEqual({ kind: 'month' }));
test('range over 366 days falls back to month', () => expect(parseRange({ range: 'custom', from: '2025-01-01', to: '2026-11-01' })).toEqual({ kind: 'month' }));
test('unknown range falls back to month', () => expect(parseRange({ range: 'year' })).toEqual({ kind: 'month' }));
