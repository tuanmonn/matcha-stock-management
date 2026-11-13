import { toUsdCents } from './money';
import type { Snapshot } from './data';

const yearOf = (day: string): number => Number(day.slice(0, 4));

/** USD cents. Cash view: every dollar paid for stock counts when paid, not when sold. Throws MissingRateError like the dashboard. */
export function settle(s: Snapshot, tz: string) {
  const usd = (n: number, c: 'USD' | 'VND', day: string) => toUsdCents(n, c, yearOf(day), s.rates);
  const day = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

  // Same rule as the dashboard: a month with past totals uses those rows, not live sales.
  const historyMonths = new Set(s.history.map(h => h.month.slice(0, 7)));
  let moneyIn = 0;
  for (const x of s.sales) {
    const d = day(x.sold_at);
    if (!historyMonths.has(d.slice(0, 7))) moneyIn += usd(x.qty * x.unit_price - x.discount, x.currency, d);
  }
  for (const h of s.history) moneyIn += usd(h.revenue, h.currency, h.month);
  // Ledger amounts are negative for charges; refunds are positive. Etsy takes these before paying Ngoc.
  for (const l of s.ledger) if (l.category !== 'ignore') moneyIn += usd(l.amount, l.currency, day(l.at));

  const paid = { my: 0, ngoc: 0 };
  for (const sh of s.shipments) {
    paid[sh.paid_by] += usd(sh.freight_amount, sh.freight_currency, sh.received_on);
    for (const l of s.lines) if (l.shipment_id === sh.id) paid[sh.paid_by] += usd(l.vendor_amount, l.vendor_currency, sh.received_on);
  }
  for (const x of s.expenses) paid[x.paid_by] += usd(x.amount, x.currency, x.spent_on);

  const profit = moneyIn - paid.my - paid.ngoc;
  const sent = s.transfers.reduce((n, t) => n + t.amount, 0);
  if (profit <= 0) return { moneyIn, paid, profit, sent, payout: null };
  const mine = Math.round(profit / 2);
  const myPayout = paid.my + mine;
  return { moneyIn, paid, profit, sent, payout: { my: myPayout, ngoc: paid.ngoc + profit - mine, ngocOwes: myPayout - sent } };
}
