import type { Currency, Payer } from './types';
import type { Range } from './periods';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

class Fail extends Error {}
const fail = (msg: string): never => { throw new Fail(msg); };
const wrap = <T>(fn: () => T): Parsed<T> => {
  try { return { ok: true, value: fn() }; } catch (e) { if (e instanceof Fail) return { ok: false, error: e.message }; throw e; }
};

const str = (f: FormData, k: string): string => String(f.get(k) ?? '').trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const day = (s: string, label: string): string => (isDay(s) ? s : fail(`${label} must be a date.`));
const required = (s: string, label: string): string => s || fail(`${label} is required.`);
const oneOf = <T extends string>(s: string, opts: readonly T[], label: string): T =>
  (opts as readonly string[]).includes(s) ? (s as T) : fail(`${label} is not valid.`);

function int(s: string, label: string, min: number): number {
  const clean = s.replace(/[,\s]/g, '');
  if (!/^-?\d+$/.test(clean) || Number(clean) < min) return fail(`${label} must be ${min} or more.`);
  return Number(clean);
}

/** USD text becomes cents (max 2 decimals); VND text must be a whole number. */
function amount(s: string, currency: Currency, label: string, min: number): number {
  const clean = s.replace(/[,\s]/g, '');
  let n: number;
  if (currency === 'USD') {
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
    if (!m) return fail(`${label} must be an amount like 12.50.`);
    n = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  } else {
    if (!/^\d+$/.test(clean)) return fail(`${label} must be a whole number of dong.`);
    n = Number(clean);
  }
  return n < min ? fail(`${label} must be ${min === 0 ? '0 or more' : 'above 0'}.`) : n;
}

const payer = (f: FormData): Payer => oneOf(str(f, 'paid_by') || 'my', ['my', 'ngoc'] as const, 'Paid by');
const currency = (f: FormData, k: string): Currency => oneOf(str(f, k) || 'USD', ['USD', 'VND'], 'Currency');

/** Etsy orders paid before the connection day are never imported, so those may be entered by hand. */
export function manualEtsyBlocked(channel: string, status: string | null, soldOn: string | null, connectedDay: string | null): string | null {
  if (channel !== 'etsy' || status !== 'connected') return null;
  if (soldOn && connectedDay && soldOn < connectedDay) return null;
  return connectedDay
    ? `Etsy orders from ${connectedDay} on are added automatically. Only earlier Etsy orders can be entered here.`
    : 'Etsy is connected, so Etsy orders are added automatically.';
}

export function parseSale(f: FormData) {
  return wrap(() => {
    const id = str(f, 'id');
    if (!UUID.test(id)) fail('Sale id is not valid.');
    const channel = oneOf(str(f, 'channel'), ['etsy', 'store'] as const, 'Channel');
    const product_id = required(str(f, 'product_id'), 'Product');
    const qty = int(str(f, 'qty'), 'Quantity', 1);
    const unit_price = amount(str(f, 'price'), 'USD', 'Price', 0);
    const sold = str(f, 'sold_on');
    return { id, channel, product_id, qty, unit_price, sold_on: sold ? day(sold, 'Sale date') : null };
  });
}

export function parseShipment(f: FormData) {
  return wrap(() => {
    const received_on = day(str(f, 'received_on'), 'Received date');
    const freight_currency = currency(f, 'freight_currency');
    const freight_amount = amount(str(f, 'freight'), freight_currency, 'Freight', 0);
    const ids = f.getAll('line_product_id[]').map(String);
    if (ids.length === 0) fail('Add at least one product line.');
    const at = (k: string, i: number) => String(f.getAll(k)[i] ?? '').trim();
    const lines = ids.map((pid, i) => {
      const vendor_currency = oneOf(at('line_vendor_currency[]', i) || 'USD', ['USD', 'VND'] as const, 'Currency');
      return {
        product_id: required(pid.trim(), 'Product'),
        units: int(at('line_units[]', i), 'Units', 1),
        vendor_amount: amount(at('line_vendor[]', i), vendor_currency, 'Vendor cost', 0),
        vendor_currency,
        expiry_date: day(at('line_expiry[]', i), 'Expiry date'),
      };
    });
    return { paid_by: payer(f), received_on, freight_amount, freight_currency, note: str(f, 'note'), lines };
  });
}

/** Shipment rows left without units are dropped, so the form can offer spare rows. */
export function dropBlankLines(f: FormData): FormData {
  const out = new FormData();
  const lineKeys = ['line_product_id[]', 'line_units[]', 'line_vendor[]', 'line_vendor_currency[]', 'line_expiry[]'];
  const units = f.getAll('line_units[]').map(v => String(v).trim());
  for (const [k, v] of f.entries()) if (!lineKeys.includes(k)) out.append(k, v);
  for (const k of lineKeys) f.getAll(k).forEach((v, i) => { if (units[i]) out.append(k, v); });
  return out;
}

export function parseCorrection(f: FormData) {
  return wrap(() => {
    const delta = int(str(f, 'delta'), 'Change', -1_000_000);
    if (delta === 0) fail('Change cannot be 0.');
    return { product_id: required(str(f, 'product_id'), 'Product'), delta, reason: required(str(f, 'reason'), 'Reason') };
  });
}

export function parseExpense(f: FormData) {
  return wrap(() => {
    const cur = currency(f, 'currency');
    return {
      paid_by: payer(f),
      spent_on: day(str(f, 'spent_on'), 'Date'),
      category: oneOf(str(f, 'category'), ['packaging', 'gift'] as const, 'Category'),
      amount: amount(str(f, 'amount'), cur, 'Amount', 1),
      currency: cur,
      note: str(f, 'note'),
    };
  });
}

export function parseTransfer(f: FormData) {
  return wrap(() => ({
    sent_on: day(str(f, 'sent_on'), 'Date'),
    amount: amount(str(f, 'amount'), 'USD', 'Amount', 1),
    note: str(f, 'note'),
  }));
}

export function parseHistory(f: FormData) {
  return wrap(() => {
    const month = str(f, 'month');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('Month must look like 2026-10.');
    const cur = currency(f, 'currency');
    return {
      month: `${month}-01`,
      product_id: required(str(f, 'product_id'), 'Product'),
      channel: oneOf(str(f, 'channel'), ['etsy', 'store'] as const, 'Channel'),
      units: int(str(f, 'units'), 'Units', 0),
      revenue: amount(str(f, 'revenue'), cur, 'Revenue', 0),
      currency: cur,
      orders: int(str(f, 'orders'), 'Orders', 0),
    };
  });
}

export function parseProduct(f: FormData) {
  return wrap(() => ({
    sku: required(str(f, 'sku'), 'SKU'),
    name: required(str(f, 'name'), 'Name'),
    grams: int(str(f, 'grams'), 'Grams', 1),
    packaging: oneOf(str(f, 'packaging'), ['can', 'bag'] as const, 'Packaging'),
    store_price: amount(str(f, 'store_price'), 'USD', 'Store price', 0),
    details: str(f, 'details'),
    etsy_listing_id: str(f, 'etsy_listing_id') || null,
    low_stock_at: str(f, 'low_stock_at') ? int(str(f, 'low_stock_at'), 'Low stock level', 0) : 3,
  }));
}

export const US_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'] as const;

export function parseRate(f: FormData) {
  return wrap(() => {
    const year = int(str(f, 'year'), 'Year', 2000);
    const rate = Number(str(f, 'vnd_per_usd').replace(/[,\s]/g, ''));
    if (!Number.isFinite(rate) || rate <= 0) fail('Rate must be above 0.');
    return { year, vnd_per_usd: rate };
  });
}

export const parseTimeZone = (f: FormData) => wrap(() => oneOf(str(f, 'time_zone'), US_ZONES, 'Time zone'));

export function parseRange(q: { range?: string; from?: string; to?: string }): Range {
  if (q.range === 'week') return { kind: 'week' };
  if (q.range === 'all') return { kind: 'all' };
  if (q.range === 'custom' && q.from && q.to && isDay(q.from) && isDay(q.to) && q.from <= q.to) {
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 + 1;
    if (days <= 366) return { kind: 'custom', from: q.from, to: q.to };
  }
  return { kind: 'month' };
}
