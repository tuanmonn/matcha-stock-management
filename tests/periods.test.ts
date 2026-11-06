import { test, expect } from 'vitest';
import { todayKey, dayKey, monthWindows, addMonths, rangeWindows, daysIn, inWindow } from '@/lib/periods';

test('day key respects time zone', () => expect(dayKey('2026-11-01T03:00:00Z', 'America/New_York')).toBe('2026-10-31'));
test('mid month', () => expect(monthWindows('2026-11-10')).toEqual({ current: { from: '2026-11-01', to: '2026-11-10' }, previous: { from: '2026-10-01', to: '2026-10-10' } }));
test('31 March caps at February end', () => expect(monthWindows('2027-03-31').previous).toEqual({ from: '2027-02-01', to: '2027-02-28' }));
test('leap year', () => expect(monthWindows('2028-03-31').previous.to).toBe('2028-02-29'));
test('first day of month', () => expect(monthWindows('2026-11-01').previous).toEqual({ from: '2026-10-01', to: '2026-10-01' }));
test('January looks back to December', () => expect(monthWindows('2027-01-15').previous).toEqual({ from: '2026-12-01', to: '2026-12-15' }));
test('addMonths clamps', () => { expect(addMonths('2027-03-31', -1)).toBe('2027-02-28'); expect(addMonths('2027-05-31', -3)).toBe('2027-02-28'); });
test('week from Monday', () => expect(rangeWindows({ kind: 'week' }, '2026-11-06')).toEqual({ current: { from: '2026-11-02', to: '2026-11-06' }, previous: { from: '2026-10-26', to: '2026-10-30' } }));
test('week on a Monday', () => expect(rangeWindows({ kind: 'week' }, '2026-11-02').previous).toEqual({ from: '2026-10-26', to: '2026-10-26' }));
test('week on a Sunday', () => expect(rangeWindows({ kind: 'week' }, '2026-11-08').current).toEqual({ from: '2026-11-02', to: '2026-11-08' }));
test('custom range compares with the days before', () => expect(rangeWindows({ kind: 'custom', from: '2026-10-01', to: '2026-10-15' }, '2026-11-06').previous).toEqual({ from: '2026-09-16', to: '2026-09-30' }));
test('custom range across new year', () => expect(rangeWindows({ kind: 'custom', from: '2027-01-01', to: '2027-01-10' }, '2027-01-20').previous).toEqual({ from: '2026-12-22', to: '2026-12-31' }));
test('daysIn lists each day', () => expect(daysIn({ from: '2026-10-30', to: '2026-11-02' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']));
test('inWindow is inclusive', () => { const w = { from: '2026-11-01', to: '2026-11-03' }; expect([inWindow('2026-10-31', w), inWindow('2026-11-01', w), inWindow('2026-11-03', w), inWindow('2026-11-04', w)]).toEqual([false, true, true, false]); });

test('todayKey uses the store time zone, UTC when unset', () => {
  const now = new Date('2026-11-06T02:00:00Z');
  expect(todayKey(now, 'America/New_York')).toBe('2026-11-05');
  expect(todayKey(now, null)).toBe('2026-11-06');
});
