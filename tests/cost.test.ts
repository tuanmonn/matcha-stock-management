import { test, expect } from 'vitest';
import { replayCost } from '@/lib/cost';

const r = (at: string, units: number, landedUsdCents: number) => ({ at, type: 'receive' as const, units, landedUsdCents });
const s = (at: string, saleId: string, qty: number) => ({ at, type: 'sale' as const, saleId, qty });
test('averages across shipments', () => {
  const out = replayCost([r('2026-01-01', 10, 10000), s('2026-01-02', 'a', 2), r('2026-01-03', 10, 20000), s('2026-01-04', 'b', 3)]);
  expect(out.cogs).toEqual({ a: 2000, b: 4667 }); expect(out.avgCostCents).toBe(1556); expect(out.negativeAt).toBeNull();
});
test('order of input does not matter', () => expect(replayCost([s('2026-01-02', 'a', 2), r('2026-01-01', 10, 10000)]).cogs).toEqual({ a: 2000 }));
test('selling past zero uses last average and flags', () => {
  const out = replayCost([r('2026-01-01', 3, 3000), s('2026-01-02', 'a', 5)]);
  expect(out.cogs.a).toBe(5000); expect(out.negativeAt).toBe('2026-01-02');
});
test('sale with no shipment ever costs zero and flags', () => expect(replayCost([s('2026-01-02', 'a', 1)])).toEqual({ cogs: { a: 0 }, avgCostCents: 0, negativeAt: '2026-01-02' }));
test('positive adjust adds units at average', () => expect(replayCost([r('2026-01-01', 10, 10000), { at: '2026-01-02', type: 'adjust', qty: 5 }, s('2026-01-03', 'a', 15)]).cogs.a).toBe(15000));
