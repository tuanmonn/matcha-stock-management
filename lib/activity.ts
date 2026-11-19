import { sql } from '@/lib/db';
import { dayKey } from '@/lib/periods';
import { formatUsd, formatVnd } from '@/lib/money';

export type Activity = { at: string; who: string; text: string };

const CHANNEL: Record<string, string> = { etsy: 'Etsy', store: 'Store', instagram: 'Instagram' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const iso = (t: string | Date) => new Date(t).toISOString();
const money = (n: number, c: string) => (c === 'USD' ? formatUsd(n) : formatVnd(n));

// Newest first; rows saved before recorded_at existed (null) are left out.
export async function loadActivity(limit = 150): Promise<Activity[]> {
  const [[st], runs, sales, moves, ledger, expenses, shipments, transfers] = await Promise.all([
    sql`select time_zone from settings where id = 1`,
    sql`select at, source, summary from sync_runs order by at desc limit ${limit}`,
    sql`select s.recorded_at, s.sold_at, s.channel, s.qty, s.unit_price, p.name from sales s join products p on p.id = s.product_id where s.recorded_at is not null order by s.recorded_at desc limit ${limit}`,
    sql`select m.recorded_at, m.qty_delta, m.reason, p.name from stock_moves m join products p on p.id = m.product_id where m.kind = 'correction' and m.recorded_at is not null order by m.recorded_at desc limit ${limit}`,
    sql`select recorded_at, ledger_type, category, amount from etsy_ledger where category <> 'ignore' and recorded_at is not null order by recorded_at desc limit ${limit}`,
    sql`select recorded_at, category, amount, currency, note from expenses where recorded_at is not null order by recorded_at desc limit ${limit}`,
    sql`select s.recorded_at, s.received_on, (select count(*) from shipment_lines l where l.shipment_id = s.id)::int as n from shipments s where s.recorded_at is not null order by s.recorded_at desc limit ${limit}`,
    sql`select recorded_at, amount, sent_on from transfers where recorded_at is not null order by recorded_at desc limit ${limit}`,
  ]);
  const tz = (st?.time_zone as string | null) ?? 'UTC';
  const rows: Activity[] = [
    ...runs.map((r) => ({ at: iso(r.at), who: r.source === 'manual' ? 'Sync now' : 'Etsy sync', text: r.summary })),
    ...sales.map((r) => {
      const sold = dayKey(iso(r.sold_at), tz);
      const late = sold !== dayKey(iso(r.recorded_at), tz) ? ` (sold on ${dm(sold)})` : '';
      return { at: iso(r.recorded_at), who: CHANNEL[r.channel] ?? r.channel, text: `Sale: ${r.qty} × ${r.name} at ${formatUsd(Number(r.unit_price))}${late}` };
    }),
    ...moves.map((r) => ({ at: iso(r.recorded_at), who: 'Stock', text: `Correction: ${r.name} ${r.qty_delta > 0 ? '+' : ''}${r.qty_delta} (${r.reason})` })),
    ...ledger.map((r) => ({ at: iso(r.recorded_at), who: 'Etsy', text: `${{ ads: 'Ads charge', fee: 'Fee' }[r.category as string] ?? 'Uncategorized charge'} (${r.ledger_type}): ${formatUsd(Number(r.amount)).replace('-', '−')}` })),
    ...expenses.map((r) => ({ at: iso(r.recorded_at), who: 'Expense', text: `${r.category} ${money(Number(r.amount), r.currency)}${r.note ? ` (${r.note})` : ''}` })),
    ...shipments.map((r) => ({ at: iso(r.recorded_at), who: 'Shipment', text: `Received on ${dm(String(r.received_on).slice(0, 10))}, ${r.n} ${r.n === 1 ? 'line' : 'lines'}` })),
    ...transfers.map((r) => ({ at: iso(r.recorded_at), who: 'Transfer', text: `${formatVnd(Number(r.amount))} sent on ${dm(String(r.sent_on).slice(0, 10))}` })),
  ];
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export async function lastSync(): Promise<{ at: string; summary: string } | null> {
  const [r] = await sql`select at, summary from sync_runs order by at desc limit 1`;
  return r ? { at: iso(r.at), summary: r.summary } : null;
}
