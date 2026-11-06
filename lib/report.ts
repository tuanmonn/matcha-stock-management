import { stockOf, type Snapshot } from './data';
import { MissingRateError, toUsdCents } from './money';
import { allocateFreight } from './freight';
import { replayCost, type CostEvent } from './cost';
import { dayKey, inWindow, rangeWindows, type Range, type Window } from './periods';
import { dailySeries, historyLines, summarize, type CostLine, type DayPoint, type SaleLine } from './profit';
import { warnings, type Warning } from './alerts';

type Summary = ReturnType<typeof summarize> & { approximate: boolean };

export type Dashboard =
  | { status: 'needs_time_zone' }
  | { status: 'missing_rate'; year: number }
  | {
    status: 'ok'; today: string; windows: { current: Window; previous: Window };
    current: Summary; previous: Summary;
    series: { current: DayPoint[]; previous: DayPoint[] };
    stock: { productId: string; stock: number; avgCostCents: number; earliestExpiry: string | null }[];
    warnings: Warning[];
  };

const yearOf = (day: string): number => Number(day.slice(0, 4));

export function buildDashboard(s: Snapshot, now: Date, range: Range): Dashboard {
  const tz = s.timeZone;
  if (!tz) return { status: 'needs_time_zone' };
  const today = dayKey(now.toISOString(), tz);
  const windows = rangeWindows(range, today);
  try {
    return build(s, tz, today, windows);
  } catch (e) {
    if (e instanceof MissingRateError) return { status: 'missing_rate', year: e.year };
    throw e;
  }
}

function build(s: Snapshot, tz: string, today: string, windows: { current: Window; previous: Window }): Dashboard {
  const gramsOf = new Map(s.products.map(p => [p.id, p.grams]));
  const shipmentOf = new Map(s.shipments.map(sh => [sh.id, sh]));

  // 1. Landed cost per shipment line: vendor cost plus its weight share of freight, both at the shipment's year.
  const landed = new Map<string, number>();
  for (const sh of s.shipments) {
    const lines = s.lines.filter(l => l.shipment_id === sh.id);
    const shares = allocateFreight(sh.freight_amount, lines.map(l => ({ grams: gramsOf.get(l.product_id) ?? 1, units: l.units })));
    const year = yearOf(sh.received_on);
    lines.forEach((l, i) => landed.set(l.id,
      toUsdCents(l.vendor_amount, l.vendor_currency, year, s.rates) + toUsdCents(shares[i], sh.freight_currency, year, s.rates)));
  }

  // 2. Cost events, replayed per product.
  const events = new Map<string, CostEvent[]>();
  const push = (pid: string, e: CostEvent) => { (events.get(pid) ?? events.set(pid, []).get(pid)!).push(e); };
  for (const l of s.lines) {
    const sh = shipmentOf.get(l.shipment_id);
    if (sh) push(l.product_id, { at: sh.received_on, type: 'receive', units: l.units, landedUsdCents: landed.get(l.id)! });
  }
  for (const m of s.moves) {
    if (m.kind === 'sale') push(m.product_id, { at: m.at, type: 'sale', saleId: m.ref, qty: -m.qty_delta });
    else if (m.kind === 'correction') push(m.product_id, { at: m.at, type: 'adjust', qty: m.qty_delta });
  }
  const cogs: Record<string, number> = {};
  const avg: Record<string, number> = {};
  for (const p of s.products) {
    const r = replayCost(events.get(p.id) ?? []);
    Object.assign(cogs, r.cogs);
    avg[p.id] = r.avgCostCents;
  }

  // Only what falls inside a window is converted, so an unrelated old VND entry can't block the report.
  const inEither = (d: string) => inWindow(d, windows.current) || inWindow(d, windows.previous);

  // 5. Months with past totals use only those rows; their live sales are dropped.
  const historyMonths = new Set(s.history.map(h => h.month.slice(0, 7)));

  // 3. Sale lines.
  const saleLines: SaleLine[] = [];
  for (const sale of s.sales) {
    const day = dayKey(sale.sold_at, tz);
    if (historyMonths.has(day.slice(0, 7)) || !inEither(day)) continue;
    saleLines.push({
      day, channel: sale.channel, productId: sale.product_id, orderId: sale.etsy_receipt_id ?? sale.id, qty: sale.qty,
      revenue: toUsdCents(sale.qty * sale.unit_price, sale.currency, yearOf(day), s.rates), cogs: cogs[sale.id] ?? 0,
    });
  }

  // 4. Expenses.
  const costs: CostLine[] = s.expenses.filter(x => inEither(x.spent_on)).map(x => ({
    day: x.spent_on, amount: toUsdCents(x.amount, x.currency, yearOf(x.spent_on), s.rates), kind: 'expense' as const,
  }));

  const side = (w: Window): Summary => {
    const lastDay = (m: string) => new Date(Date.UTC(yearOf(m), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const touched = [...historyMonths].filter(m => `${m}-01` <= w.to && lastDay(m) >= w.from);
    const rows = s.history.filter(h => touched.includes(h.month.slice(0, 7)));
    const lines = historyLines(rows, avg, s.rates).map(l => ({ ...l, day: w.from }));
    return { ...summarize([...saleLines, ...lines], costs, w), approximate: touched.length > 0 };
  };

  const earliest = (pid: string) => s.expiry.filter(e => e.product_id === pid && !e.cleared_at).map(e => e.expiry_date).sort()[0] ?? null;
  const stock = s.products.map(p => ({ productId: p.id, stock: stockOf(s.moves, p.id), avgCostCents: avg[p.id], earliestExpiry: earliest(p.id) }));
  const lowAt = new Map(s.products.map(p => [p.id, p.low_stock_at]));

  return {
    status: 'ok', today, windows,
    current: side(windows.current), previous: side(windows.previous),
    series: { current: dailySeries(saleLines, costs, windows.current), previous: dailySeries(saleLines, costs, windows.previous) },
    stock,
    warnings: warnings(stock.map(x => ({ ...x, lowStockAt: lowAt.get(x.productId) ?? 3 })), today),
  };
}
