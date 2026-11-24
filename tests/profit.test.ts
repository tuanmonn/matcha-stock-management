import { test, expect } from 'vitest';
import { summarize, dailySeries, monthlySeries, historyLines, runningTotal, type SaleLine } from '@/lib/profit';
import type { HistoryRow } from '@/lib/types';

const w = { from: '2026-11-01', to: '2026-11-30' };
const sale = (o: Partial<SaleLine>): SaleLine => ({ day: '2026-11-05', channel: 'store', productId: 'p1', orderId: 'o1', qty: 1, revenue: 5000, cogs: 2000, ...o });
test('shop profit subtracts all money spent, not cost of units sold', () => {
  const out = summarize([sale({}), sale({ orderId: 'o2', channel: 'etsy', revenue: 6000 })], [{ day: '2026-11-03', amount: 1000, kind: 'gift' }, { day: '2026-11-02', amount: 3000, kind: 'stock' }], w);
  expect(out.shop).toMatchObject({ revenue: 11000, cogs: 4000, stock: 3000, gifts: 1000, profit: 7000, units: 2, orders: 2 }); expect(out.shop.margin).toBeCloseTo(7000 / 11000);
});
test('a shipment counts in full even when nothing sold', () => expect(summarize([], [{ day: '2026-11-02', amount: 9000, kind: 'stock' }], w).shop.profit).toBe(-9000));
test('channel and sku profit stay on cost of units sold', () => {
  const out = summarize([sale({ channel: 'etsy' })], [{ day: '2026-11-02', amount: 9000, kind: 'stock' }, { day: '2026-11-03', amount: 700, kind: 'packaging' }], w);
  expect(out.byChannel.etsy.profit).toBe(3000); expect(out.bySku.p1.profit).toBe(3000);
});
test('sku profit ignores shared expenses', () => expect(summarize([sale({})], [{ day: '2026-11-03', amount: 1000, kind: 'gift' }], w).bySku.p1.profit).toBe(3000));
test('outside window ignored', () => expect(summarize([sale({ day: '2026-10-31' })], [], w).shop.revenue).toBe(0));
test('no revenue gives null margin', () => expect(summarize([], [], w).shop.margin).toBeNull());
test('daily series covers every day and adds up', () => {
  const sales = [sale({ day: '2026-11-02' }), sale({ orderId: 'o2', day: '2026-11-04' })]; const costs = [{ day: '2026-11-03', amount: 1000, kind: 'gift' as const }];
  const days = dailySeries(sales, costs, { from: '2026-11-01', to: '2026-11-04' });
  expect(days.map(p => p.profit)).toEqual([0, 5000, -1000, 5000]);
  expect(days.reduce((a, p) => a + p.profit, 0)).toBe(summarize(sales, costs, { from: '2026-11-01', to: '2026-11-04' }).shop.profit);
});
test('history rows use current average cost and their own order count', () => {
  const lines = historyLines([{ month: '2026-10-01', product_id: 'p1', channel: 'etsy', units: 4, revenue: 20000, currency: 'USD', orders: 3 } as HistoryRow], { p1: 1500 }, {});
  const out = summarize(lines, [], { from: '2026-10-01', to: '2026-10-31' });
  expect(out.shop).toMatchObject({ revenue: 20000, cogs: 6000, stock: 6000, profit: 14000, units: 4, orders: 3 });
});
test('fees with a product count against that sku and etsy only', () => {
  const out = summarize([sale({ channel: 'etsy' })], [{ day: '2026-11-05', amount: 500, kind: 'fee', productId: 'p1' }], w);
  expect(out.bySku.p1.profit).toBe(2500); expect(out.byChannel.etsy.profit).toBe(2500); expect(out.byChannel.store.profit).toBe(0);
});
test('monthly series has a bar per month, window-clipped', () => {
  const m = monthlySeries([sale({ day: '2026-10-20' }), sale({ orderId: 'o2', day: '2026-11-02' }), sale({ orderId: 'o3', day: '2026-09-01' })], [{ day: '2026-11-03', amount: 1000, kind: 'gift' }], { from: '2026-10-15', to: '2026-11-10' });
  expect(m.map(p => [p.day, p.profit])).toEqual([['2026-10-01', 5000], ['2026-11-01', 4000]]);
});
test('running total accumulates and marks shipment days', () => {
  const days = dailySeries([sale({ day: '2026-11-02' })], [{ day: '2026-11-03', amount: 9000, kind: 'stock' }], { from: '2026-11-01', to: '2026-11-04' });
  const run = runningTotal(days, ['2026-11-03'], false);
  expect(run.map(p => p.total)).toEqual([0, 5000, -4000, -4000]);
  expect(run.map(p => p.shipment)).toEqual([false, false, true, false]);
  expect(runningTotal(days.slice(0, 1), ['2026-11-20'], true)[0].shipment).toBe(true);
});
