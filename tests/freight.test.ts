import { test, expect } from 'vitest';
import { allocateFreight } from '@/lib/freight';

test('splits by weight, last takes remainder', () => expect(allocateFreight(20000, [{ grams: 100, units: 20 }, { grams: 30, units: 20 }])).toEqual([15384, 4616]));
test('always sums to total', () => { const r = allocateFreight(10001, [{ grams: 30, units: 7 }, { grams: 100, units: 3 }, { grams: 50, units: 11 }]); expect(r.reduce((a, b) => a + b, 0)).toBe(10001); });
test('single line takes everything', () => expect(allocateFreight(999, [{ grams: 30, units: 1 }])).toEqual([999]));
test('no lines', () => expect(allocateFreight(500, [])).toEqual([]));
