import { sql } from '@/lib/db';
import { clearExpiries } from '@/lib/data';
import { etsyGet, getAccessToken } from '@/lib/etsy/client';
import { receiptToSales, ledgerToRow, mismatches, type EtsyReceipt, type EtsyLedgerEntry, type EtsyListing, type IssueRow } from '@/lib/etsy/map';

const DAY = 86_400_000;
const secs = (ms: number) => Math.floor(ms / 1000);

async function settings() {
  const [s] = await sql`select etsy_shop_id, etsy_connected_at, etsy_status from settings where id = 1`;
  return s as { etsy_shop_id: string | null; etsy_connected_at: string | null; etsy_status: string | null };
}

// Etsy list endpoints answer {count, results}; page by offset until a short page.
async function pages<T>(path: string, query: Record<string, string | number | boolean>, f: typeof fetch): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const r = await etsyGet<{ results: T[] }>(path, { ...query, limit: 100, offset }, f);
    out.push(...r.results);
    if (r.results.length < 100) return out;
  }
}

// A listing maps to a product only when exactly one product is linked to it.
const soleListings = (products: { id: string; etsy_listing_id: string | null }[]) => {
  const linked = products.filter((p) => p.etsy_listing_id);
  return new Map<string, string>(linked.filter((p) => linked.filter((q) => q.etsy_listing_id === p.etsy_listing_id).length === 1).map((p) => [p.etsy_listing_id!, p.id]));
};

const upsertIssue = (i: IssueRow) =>
  sql`insert into sync_issues (kind, ref, detail) values (${i.kind}, ${i.ref}, ${i.detail}) on conflict (kind, ref) do nothing`;

export async function importReceipt(receipt: EtsyReceipt): Promise<number> {
  const s = await settings();
  const products = (await sql`select id, sku, etsy_listing_id from products`) as { id: string; sku: string; etsy_listing_id: string | null }[];
  const bySku = new Map<string, string>(products.map((p) => [p.sku, p.id]));
  const { sales, issues } = receiptToSales(receipt, { bySku, byListing: soleListings(products) }, new Date(s.etsy_connected_at!));
  const res = await sql.transaction([
    ...sales.flatMap((x) => [
      sql`insert into sales (id, channel, sold_at, product_id, qty, unit_price, currency, etsy_receipt_id, etsy_transaction_id, discount)
        values (${x.id}, 'etsy', ${x.sold_at}, ${x.product_id}, ${x.qty}, ${x.unit_price}, 'USD', ${x.etsy_receipt_id}, ${x.etsy_transaction_id}, ${x.discount})
        on conflict (id) do nothing returning id`,
      sql`insert into stock_moves (product_id, qty_delta, kind, ref, at) values (${x.product_id}, ${-x.qty}, 'sale', ${x.id}, ${x.sold_at}) on conflict (kind, ref) do nothing`,
    ]),
    clearExpiries(),
    ...issues.map(upsertIssue),
    sql`update sync_issues set resolved_at = now() where kind = 'unknown_listing' and resolved_at is null and ref = any(${sales.map((x) => x.etsy_transaction_id)}::text[])`,
  ]);
  // Each sale contributes two statements (sale insert, stock move); count the sale inserts that returned a row.
  return sales.filter((_, i) => res[i * 2].length > 0).length;
}

export async function fetchReceipt(receiptId: string, f: typeof fetch = fetch): Promise<EtsyReceipt> {
  return etsyGet<EtsyReceipt>(`/shops/${(await settings()).etsy_shop_id}/receipts/${receiptId}`, {}, f);
}

export async function catchUp(now: Date, f: typeof fetch = fetch): Promise<number> {
  const s = await settings();
  const from = Math.max(now.getTime() - 7 * DAY, new Date(s.etsy_connected_at!).getTime() - DAY);
  const receipts = await pages<EtsyReceipt>(`/shops/${s.etsy_shop_id}/receipts`, { was_paid: true, min_created: secs(from) }, f);
  let n = 0;
  for (const r of receipts) n += await importReceipt(r);
  return n;
}

export async function importLedger(now: Date, f: typeof fetch = fetch): Promise<number> {
  const s = await settings();
  const [last] = await sql`select max(at) as at from etsy_ledger`;
  const start = last?.at
    ? new Date(last.at).getTime() - 2 * DAY
    : Date.UTC(new Date(s.etsy_connected_at!).getUTCFullYear(), 0, 1);

  const sales = await sql`select etsy_transaction_id, etsy_receipt_id, product_id from sales where etsy_transaction_id is not null`;
  const byTransaction = new Map<string, string>(sales.map((x) => [x.etsy_transaction_id, x.product_id]));
  const byReceipt = new Map<string, string[]>();
  for (const x of sales) byReceipt.set(x.etsy_receipt_id, [...(byReceipt.get(x.etsy_receipt_id) ?? []), x.product_id]);
  const byListing = soleListings((await sql`select id, etsy_listing_id from products`) as { id: string; etsy_listing_id: string | null }[]);

  let added = 0;
  const otherCurrencies = new Set<string>();
  for (let from = start; from < now.getTime(); from += 30 * DAY) {
    const to = Math.min(from + 30 * DAY, now.getTime());
    const entries = await pages<EtsyLedgerEntry>(`/shops/${s.etsy_shop_id}/payment-account/ledger-entries`, { min_created: secs(from), max_created: secs(to) }, f);
    const inserts = entries.map((e) => {
      const row = ledgerToRow(e, { byTransaction, byListing, byReceipt });
      let { category, currency, product_id } = row;
      if (e.currency !== 'USD') {
        otherCurrencies.add(e.currency);
        category = 'uncategorized'; product_id = null;
        // shortcut: the table only allows USD/VND, so other currencies are stored as USD (raw keeps the original); upgrade when a third currency is supported.
        if (e.currency !== 'VND') currency = 'USD';
      }
      return sql`insert into etsy_ledger (entry_id, at, ledger_type, reference_type, reference_id, amount, currency, category, product_id, raw)
        values (${row.entry_id}, ${row.at}, ${row.ledger_type}, ${e.reference_type}, ${e.reference_id}, ${row.amount}, ${currency}, ${category}, ${product_id}, ${JSON.stringify(e)}::jsonb)
        on conflict (entry_id) do nothing returning entry_id`;
    });
    if (inserts.length) added += (await sql.transaction(inserts)).filter((r) => r.length > 0).length;
  }
  for (const c of otherCurrencies) {
    await sql`insert into sync_issues (kind, ref, detail) values ('etsy_error', 'ledger-currency', ${`Etsy charges in ${c} can't be counted yet.`})
      on conflict (kind, ref) do update set detail = excluded.detail, resolved_at = null`;
  }
  return added;
}

export async function listActiveListings(f: typeof fetch = fetch): Promise<EtsyListing[]> {
  const r = await etsyGet<{ results: EtsyListing[] }>(`/shops/${(await settings()).etsy_shop_id}/listings`, { state: 'active', limit: 100, includes: 'Inventory' }, f);
  return r.results;
}

export async function checkMismatches(f: typeof fetch = fetch): Promise<number> {
  const listings = await listActiveListings(f);
  const products = (await sql`select p.id, p.sku, p.etsy_listing_id, coalesce(sum(m.qty_delta), 0)::int as stock
    from products p left join stock_moves m on m.product_id = p.id group by p.id`) as { id: string; sku: string; etsy_listing_id: string | null; stock: number }[];
  const found = mismatches(products, listings);
  await sql.transaction([
    ...found.map((i) => sql`insert into sync_issues (kind, ref, detail) values ('mismatch', ${i.ref}, ${i.detail})
      on conflict (kind, ref) do update set detail = excluded.detail, resolved_at = null`),
    sql`update sync_issues set resolved_at = now() where kind = 'mismatch' and resolved_at is null and ref <> all(${found.map((i) => i.ref)}::text[])`,
  ]);
  return found.length;
}

export async function runDaily(now: Date, f: typeof fetch = fetch): Promise<string[]> {
  if ((await settings()).etsy_status !== 'connected') return ['Etsy not connected'];
  const steps: [string, () => Promise<string>][] = [
    ['token', async () => { await getAccessToken(now, f); return 'ok'; }],
    ['catchUp', async () => `${await catchUp(now, f)} new sales`],
    ['importLedger', async () => `${await importLedger(now, f)} new ledger entries`],
    ['checkMismatches', async () => `${await checkMismatches(f)} mismatches`],
  ];
  const lines: string[] = [];
  for (const [name, run] of steps) {
    try {
      lines.push(`${name}: ${await run()}`);
      await sql`update sync_issues set resolved_at = now() where kind = 'etsy_error' and ref = ${name} and resolved_at is null`;
    } catch (e) {
      const detail = `${name}: ${(e as Error).message}. It will retry tomorrow, or press Sync now in Settings.`;
      lines.push(detail);
      await sql`insert into sync_issues (kind, ref, detail) values ('etsy_error', ${name}, ${detail})
        on conflict (kind, ref) do update set detail = excluded.detail, resolved_at = null`;
    }
  }
  return lines;
}
