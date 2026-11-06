import { sql } from './db';
import type { Parsed } from './forms';
import type { parseSale, parseShipment, parseCorrection, parseExpense, parseHistory, parseProduct } from './forms';
import type { Expense, ExpiryDate, HistoryRow, Product, Rates, Sale, Shipment, ShipmentLine, StockMove } from './types';

type Ok<F extends (f: FormData) => Parsed<unknown>> = Extract<ReturnType<F>, { ok: true }>['value'];

export type Snapshot = {
  products: Product[]; shipments: Shipment[]; lines: ShipmentLine[]; sales: Sale[]; moves: StockMove[];
  expenses: Expense[]; history: HistoryRow[]; expiry: ExpiryDate[]; rates: Rates; timeZone: string | null;
};

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
// The driver returns bigint/numeric as strings and date as a JS Date, so every select casts to number / text.
const rows = <T>(p: Promise<unknown>) => p as Promise<T[]>;

export async function loadSnapshot(): Promise<Snapshot> {
  const [products, shipments, lines, sales, moves, expenses, history, expiry, fx, settings] = await Promise.all([
    rows<Product>(sql`select * from products order by sku`),
    rows<Shipment>(sql`select id, received_on::text as received_on, freight_amount::float8 as freight_amount, freight_currency, note from shipments order by received_on desc, id`),
    rows<ShipmentLine>(sql`select id, shipment_id, product_id, units, vendor_amount::float8 as vendor_amount, vendor_currency, expiry_date::text as expiry_date from shipment_lines`),
    rows<Sale>(sql`select id, channel, to_char(sold_at at time zone 'UTC', ${sql.unsafe(ISO)}) as sold_at, product_id, qty, unit_price::float8 as unit_price, currency, etsy_receipt_id, etsy_transaction_id from sales order by sold_at desc`),
    rows<StockMove>(sql`select id, product_id, qty_delta, kind, ref, reason, to_char(at at time zone 'UTC', ${sql.unsafe(ISO)}) as at from stock_moves order by at desc`),
    rows<Expense>(sql`select id, spent_on::text as spent_on, category, amount::float8 as amount, currency, note from expenses order by spent_on desc`),
    rows<HistoryRow>(sql`select id, month::text as month, product_id, channel, units, revenue::float8 as revenue, currency, orders from monthly_history order by month desc`),
    rows<ExpiryDate>(sql`select id, product_id, expiry_date::text as expiry_date, to_char(cleared_at at time zone 'UTC', ${sql.unsafe(ISO)}) as cleared_at from expiry_dates order by expiry_date`),
    rows<{ year: number; vnd_per_usd: number }>(sql`select year, vnd_per_usd::float8 as vnd_per_usd from fx_rates`),
    rows<{ time_zone: string | null }>(sql`select time_zone from settings where id = 1`),
  ]);
  return {
    products, shipments, lines, sales, moves, expenses, history, expiry,
    rates: Object.fromEntries(fx.map(r => [r.year, r.vnd_per_usd])),
    timeZone: settings[0]?.time_zone ?? null,
  };
}

export const stockOf = (moves: StockMove[], productId: string): number =>
  moves.reduce((n, m) => (m.product_id === productId ? n + m.qty_delta : n), 0);

// Stock at or below zero means those units are gone, so their expiry dates stop warning.
const clearExpiries = () => sql`update expiry_dates set cleared_at = now() where cleared_at is null and product_id in (select product_id from stock_moves group by product_id having sum(qty_delta) <= 0)`;

export async function saveSale(v: Ok<typeof parseSale>, now: Date): Promise<void> {
  const soldAt = v.sold_on ? `${v.sold_on}T12:00:00Z` : now.toISOString();
  await sql.transaction([
    sql`insert into sales (id, channel, sold_at, product_id, qty, unit_price, currency) values (${v.id}, ${v.channel}, ${soldAt}, ${v.product_id}, ${v.qty}, ${v.unit_price}, 'USD') on conflict (id) do nothing`,
    sql`insert into stock_moves (product_id, qty_delta, kind, ref, at) values (${v.product_id}, ${-v.qty}, 'sale', ${v.id}, ${soldAt}) on conflict (kind, ref) do nothing`,
    clearExpiries(),
  ]);
}

export async function deleteSale(id: string): Promise<void> {
  await sql.transaction([
    sql`delete from stock_moves where kind = 'sale' and ref = ${id}`,
    sql`delete from sales where id = ${id}`,
  ]);
}

export async function saveShipment(v: Ok<typeof parseShipment>): Promise<string> {
  const id = crypto.randomUUID();
  const lines = v.lines.map(l => ({ ...l, id: crypto.randomUUID() }));
  await sql.transaction([
    sql`insert into shipments (id, received_on, freight_amount, freight_currency, note) values (${id}, ${v.received_on}, ${v.freight_amount}, ${v.freight_currency}, ${v.note})`,
    ...lines.flatMap(l => [
      sql`insert into shipment_lines (id, shipment_id, product_id, units, vendor_amount, vendor_currency, expiry_date) values (${l.id}, ${id}, ${l.product_id}, ${l.units}, ${l.vendor_amount}, ${l.vendor_currency}, ${l.expiry_date})`,
      sql`insert into stock_moves (product_id, qty_delta, kind, ref, at) values (${l.product_id}, ${l.units}, 'shipment', ${l.id}, ${v.received_on}::date::timestamptz)`,
      sql`insert into expiry_dates (product_id, expiry_date) values (${l.product_id}, ${l.expiry_date}) on conflict do nothing`,
    ]),
    clearExpiries(),
  ]);
  return id;
}

export async function deleteShipment(id: string): Promise<void> {
  await sql.transaction([
    sql`delete from stock_moves where kind = 'shipment' and ref in (select id::text from shipment_lines where shipment_id = ${id})`,
    // Drop expiry dates only this shipment brought in; another shipment may share the same date.
    sql`delete from expiry_dates e where exists (select 1 from shipment_lines l where l.shipment_id = ${id} and l.product_id = e.product_id and l.expiry_date = e.expiry_date) and not exists (select 1 from shipment_lines o where o.shipment_id <> ${id} and o.product_id = e.product_id and o.expiry_date = e.expiry_date)`,
    sql`delete from shipments where id = ${id}`,
  ]);
}

export async function saveCorrection(v: Ok<typeof parseCorrection>, now: Date): Promise<void> {
  await sql.transaction([
    sql`insert into stock_moves (product_id, qty_delta, kind, ref, reason, at) values (${v.product_id}, ${v.delta}, 'correction', ${crypto.randomUUID()}, ${v.reason}, ${now.toISOString()})`,
    clearExpiries(),
  ]);
}

export async function saveExpense(v: Ok<typeof parseExpense>): Promise<void> {
  await sql.transaction([sql`insert into expenses (spent_on, category, amount, currency, note) values (${v.spent_on}, ${v.category}, ${v.amount}, ${v.currency}, ${v.note})`]);
}
export async function deleteExpense(id: string): Promise<void> {
  await sql.transaction([sql`delete from expenses where id = ${id}`]);
}

export async function saveHistory(v: Ok<typeof parseHistory>): Promise<void> {
  await sql.transaction([sql`insert into monthly_history (month, product_id, channel, units, revenue, currency, orders) values (${v.month}, ${v.product_id}, ${v.channel}, ${v.units}, ${v.revenue}, ${v.currency}, ${v.orders}) on conflict (month, product_id, channel) do update set units = excluded.units, revenue = excluded.revenue, currency = excluded.currency, orders = excluded.orders`]);
}
export async function deleteHistory(id: string): Promise<void> {
  await sql.transaction([sql`delete from monthly_history where id = ${id}`]);
}

export async function saveProduct(v: Ok<typeof parseProduct>, id?: string): Promise<string> {
  const pid = id ?? crypto.randomUUID();
  await sql.transaction([id
    ? sql`update products set sku = ${v.sku}, name = ${v.name}, grams = ${v.grams}, packaging = ${v.packaging}, details = ${v.details}, store_price = ${v.store_price}, etsy_listing_id = ${v.etsy_listing_id}, low_stock_at = ${v.low_stock_at} where id = ${id}`
    : sql`insert into products (id, sku, name, grams, packaging, details, store_price, etsy_listing_id, low_stock_at) values (${pid}, ${v.sku}, ${v.name}, ${v.grams}, ${v.packaging}, ${v.details}, ${v.store_price}, ${v.etsy_listing_id}, ${v.low_stock_at})`]);
  return pid;
}

export async function setRate(year: number, vndPerUsd: number): Promise<void> {
  await sql.transaction([sql`insert into fx_rates (year, vnd_per_usd) values (${year}, ${vndPerUsd}) on conflict (year) do update set vnd_per_usd = excluded.vnd_per_usd`]);
}
export async function setTimeZone(tz: string): Promise<void> {
  await sql.transaction([sql`update settings set time_zone = ${tz} where id = 1`]);
}
export async function clearExpiry(id: string): Promise<void> {
  await sql.transaction([sql`update expiry_dates set cleared_at = now() where id = ${id}`]);
}
