import { addMonths, daysIn, inWindow, type Window } from './periods';
import { toUsdCents } from './money';
import type { Channel, HistoryRow, Rates } from './types';

/** All money in this module is USD cents. */
export type SaleLine = {
  day: string; channel: Channel; productId: string; orderId: string;
  qty: number; revenue: number; cogs: number; orders?: number; hist?: true;
};
export type CostLine = { day: string; amount: number; kind: 'stock' | 'packaging' | 'gift' | 'fee' | 'ads'; productId?: string };
export type Totals = {
  revenue: number; cogs: number; stock: number; packaging: number; gifts: number; fees: number; ads: number; profit: number;
  margin: number | null; units: number; orders: number;
};
export type DayPoint = { day: string; profit: number; revenue: number; units: number; orders: number };
export type RunPoint = { day: string; total: number; change: number; shipment: boolean };

// Shop profit subtracts everything spent (shipments in full); SKU and channel profit use the cost of units sold.
function totals(sales: SaleLine[], costs: CostLine[], shop = false): Totals {
  const t = { revenue: 0, cogs: 0, stock: 0, packaging: 0, gifts: 0, fees: 0, ads: 0, units: 0 };
  const orders = new Map<string, number>();
  for (const s of sales) {
    t.revenue += s.revenue; t.cogs += s.cogs; t.units += s.qty;
    // shortcut: history rows carry only per-unit cogs, so it stands in for that month's stock spend; upgrade if real monthly shipment totals are entered.
    if (shop && s.hist) t.stock += s.cogs;
    if (!orders.has(s.orderId)) orders.set(s.orderId, s.orders ?? 1);
  }
  for (const c of costs) {
    if (c.kind === 'stock') t.stock += c.amount;
    else if (c.kind === 'packaging') t.packaging += c.amount;
    else if (c.kind === 'gift') t.gifts += c.amount;
    else if (c.kind === 'fee') t.fees += c.amount;
    else t.ads += c.amount;
  }
  const profit = t.revenue - (shop ? t.stock : t.cogs) - t.packaging - t.gifts - t.fees - t.ads;
  return { ...t, profit, margin: t.revenue === 0 ? null : profit / t.revenue, orders: [...orders.values()].reduce((a, b) => a + b, 0) };
}

export function summarize(sales: SaleLine[], costs: CostLine[], w: Window) {
  const ss = sales.filter(s => inWindow(s.day, w));
  const cs = costs.filter(c => inWindow(c.day, w));
  const fees = cs.filter(c => c.kind === 'fee' && c.productId);
  const bySku: Record<string, Totals> = {};
  for (const id of new Set([...ss.map(s => s.productId), ...fees.map(c => c.productId!)])) {
    bySku[id] = totals(ss.filter(s => s.productId === id), fees.filter(c => c.productId === id));
  }
  return {
    shop: totals(ss, cs, true),
    byChannel: {
      etsy: totals(ss.filter(s => s.channel === 'etsy'), fees),
      store: totals(ss.filter(s => s.channel === 'store'), []),
      instagram: totals(ss.filter(s => s.channel === 'instagram'), []),
    } as Record<Channel, Totals>,
    bySku,
  };
}

export function dailySeries(sales: SaleLine[], costs: CostLine[], w: Window): DayPoint[] {
  return daysIn(w).map(day => {
    const t = totals(sales.filter(s => s.day === day), costs.filter(c => c.day === day), true);
    return { day, profit: t.profit, revenue: t.revenue, units: t.units, orders: t.orders };
  });
}

// One point per calendar month touching the window, dated the 1st; rows outside the window stay out.
export function monthlySeries(sales: SaleLine[], costs: CostLine[], w: Window): DayPoint[] {
  const out: DayPoint[] = [];
  for (let m = w.from.slice(0, 7); m <= w.to.slice(0, 7); m = addMonths(`${m}-01`, 1).slice(0, 7)) {
    const inMonth = (d: string) => d.slice(0, 7) === m && inWindow(d, w);
    const t = totals(sales.filter(s => inMonth(s.day)), costs.filter(c => inMonth(c.day)), true);
    out.push({ day: `${m}-01`, profit: t.profit, revenue: t.revenue, units: t.units, orders: t.orders });
  }
  return out;
}

// Cumulative shop profit; a point is marked when a shipment arrived in its day (or month).
export function runningTotal(series: DayPoint[], shipmentDays: string[], monthly: boolean): RunPoint[] {
  let total = 0;
  return series.map(p => ({
    day: p.day, total: (total += p.profit), change: p.profit,
    shipment: shipmentDays.some(d => (monthly ? d.slice(0, 7) === p.day.slice(0, 7) : d === p.day)),
  }));
}

export function historyLines(rows: HistoryRow[], avgCostCents: Record<string, number>, rates: Rates): SaleLine[] {
  return rows.map(r => ({
    day: r.month, channel: r.channel, productId: r.product_id,
    orderId: `hist:${r.month}:${r.product_id}:${r.channel}`,
    qty: r.units, revenue: toUsdCents(r.revenue, r.currency, Number(r.month.slice(0, 4)), rates),
    cogs: r.units * (avgCostCents[r.product_id] ?? 0), orders: r.orders, hist: true,
  }));
}
