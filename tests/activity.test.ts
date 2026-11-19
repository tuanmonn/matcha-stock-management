import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { sameDatabase } from './db-guard';

describe.skipIf(!process.env.TEST_DATABASE_URL)('activity', () => {
  let a: typeof import('@/lib/activity');
  let sql: typeof import('@/lib/db').sql;
  let p: string;

  beforeAll(async () => {
    for (const real of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]) {
      if (sameDatabase(real, process.env.TEST_DATABASE_URL)) {
        throw new Error('TEST_DATABASE_URL points at the same database as DATABASE_URL (or DATABASE_URL_UNPOOLED); the activity tests refuse to run.');
      }
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    a = await import('@/lib/activity');
    sql = (await import('@/lib/db')).sql;
  });

  beforeEach(async () => {
    await sql`truncate sales, stock_moves, etsy_ledger, sync_runs, expenses, shipment_lines, shipments, transfers, expiry_dates, products cascade`;
    await sql`update settings set time_zone = 'America/Chicago'`;
    [{ id: p }] = (await sql`insert into products (sku, name, grams, packaging, store_price, details, low_stock_at) values ('M30', 'Matcha 30g', 30, 'bag', 1400, '', 3) returning id`) as { id: string }[];
  });

  test('lists recorded rows newest first and skips ignored and unknown-time rows', async () => {
    await sql`insert into sales (id, channel, sold_at, product_id, qty, unit_price, currency, recorded_at) values (${crypto.randomUUID()}, 'store', '2026-11-17T18:00:00Z', ${p}, 2, 4150, 'USD', '2026-11-19T10:00:00Z')`;
    await sql`insert into sales (id, channel, sold_at, product_id, qty, unit_price, currency) values (${crypto.randomUUID()}, 'store', '2026-10-01T18:00:00Z', ${p}, 1, 1400, 'USD')`;
    await sql`update sales set recorded_at = null where unit_price = 1400`;
    await sql`insert into stock_moves (product_id, qty_delta, kind, ref, reason, at, recorded_at) values (${p}, 3, 'correction', 'c1', 'found 3', '2026-11-19T09:00:00Z', '2026-11-19T09:00:00Z')`;
    await sql`insert into etsy_ledger (entry_id, at, ledger_type, amount, currency, category, recorded_at) values ('e1', '2026-11-19T06:00:00Z', 'renew_expired', -135, 'USD', 'fee', '2026-11-19T11:00:00Z')`;
    await sql`insert into etsy_ledger (entry_id, at, ledger_type, amount, currency, category, recorded_at) values ('e2', '2026-11-19T06:00:00Z', 'PAYMENT_GROSS', 500, 'USD', 'ignore', '2026-11-19T12:00:00Z')`;
    await sql`insert into sync_runs (at, source, summary) values ('2026-11-19T12:30:00Z', 'manual', 'catchUp: 0 new sales')`;

    const rows = await a.loadActivity();
    expect(rows.map((r) => r.who)).toEqual(['Sync now', 'Etsy', 'Store', 'Stock']);
    expect(rows[1].text).toBe('Fee (renew_expired): −$1.35');
    expect(rows[2].text).toBe('Sale: 2 × Matcha 30g at $41.50 (sold on 17 Nov)');
    expect(rows[3].text).toBe('Correction: Matcha 30g +3 (found 3)');
    expect(await a.lastSync()).toEqual({ at: '2026-11-19T12:30:00.000Z', summary: 'catchUp: 0 new sales' });
  });
});
