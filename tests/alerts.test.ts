import { test, expect } from 'vitest';
import { warnings } from '@/lib/alerts';

const item = (o = {}) => ({ productId: 'p1', stock: 10, lowStockAt: 3, earliestExpiry: '2027-03-31' as string | null, ...o });
test('3 months', () => expect(warnings([item()], '2026-12-31')).toEqual([{ productId: 'p1', kind: 'expiry', level: '3m', expiryDate: '2027-03-31' }]));
test('day before 3 months: none', () => expect(warnings([item()], '2026-12-30')).toEqual([]));
test('1 month uses clamped date', () => expect(warnings([item()], '2027-02-28')[0]).toMatchObject({ level: '1m' }));
test('expired', () => expect(warnings([item()], '2027-03-31')[0]).toMatchObject({ level: 'expired' }));
test('past expiry date is still expired', () => expect(warnings([item()], '2027-06-01')[0]).toMatchObject({ level: 'expired' }));
test('low stock at threshold', () => expect(warnings([item({ stock: 3, earliestExpiry: null })], '2026-11-06')).toEqual([{ productId: 'p1', kind: 'low_stock', stock: 3 }]));
test('negative stock', () => expect(warnings([item({ stock: -1, earliestExpiry: null })], '2026-11-06')[0]).toMatchObject({ kind: 'negative_stock' }));
