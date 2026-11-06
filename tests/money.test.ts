import { test, expect } from 'vitest';
import { toUsdCents, usdCentsToVnd, formatUsd, formatVnd, MissingRateError } from '@/lib/money';

const rates = { 2026: 25000 };
test('USD passes through', () => expect(toUsdCents(1234, 'USD', 2026, {})).toBe(1234));
test('VND converts at the year rate', () => expect(toUsdCents(1_250_000, 'VND', 2026, rates)).toBe(5000));
test('cents to VND', () => expect(usdCentsToVnd(5000, 2026, rates)).toBe(1_250_000));
test('missing year names the year', () => {
  expect(() => toUsdCents(1, 'VND', 2027, rates)).toThrow(MissingRateError);
  try { toUsdCents(1, 'VND', 2027, rates); } catch (e) { expect((e as MissingRateError).year).toBe(2027); }
});
test('formats', () => { expect(formatUsd(123456)).toBe('$1,234.56'); expect(formatVnd(1234567)).toMatch(/1\.234\.567/); });
