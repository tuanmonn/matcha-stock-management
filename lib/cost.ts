export type CostEvent = { at: string } & (
  | { type: 'receive'; units: number; landedUsdCents: number }
  | { type: 'sale'; saleId: string; qty: number }
  | { type: 'adjust'; qty: number }
);

export function replayCost(events: CostEvent[]): { cogs: Record<string, number>; avgCostCents: number; negativeAt: string | null } {
  // Array.sort is stable, so events sharing a time keep their input order.
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const cogs: Record<string, number> = {};
  let units = 0, cost = 0, lastAvg = 0;
  let negativeAt: string | null = null;

  // Removes q units from the pool; any shortfall costs lastAvg. Returns what they cost.
  const take = (q: number, at: string): number => {
    const fromPool = Math.min(q, units);
    const poolCost = units > 0 ? fromPool * (cost / units) : 0;
    const shortfall = q - fromPool;
    if (shortfall > 0 && negativeAt === null) negativeAt = at;
    units -= fromPool;
    cost = units === 0 ? 0 : cost - poolCost;
    return poolCost + shortfall * lastAvg;
  };

  for (const e of sorted) {
    if (e.type === 'receive') {
      units += e.units; cost += e.landedUsdCents; lastAvg = cost / units;
    } else if (e.type === 'sale') {
      cogs[e.saleId] = Math.round(take(e.qty, e.at));
    } else if (e.qty > 0) {
      units += e.qty; cost += e.qty * lastAvg;
    } else {
      take(-e.qty, e.at);
    }
  }
  return { cogs, avgCostCents: Math.round(lastAvg), negativeAt };
}
