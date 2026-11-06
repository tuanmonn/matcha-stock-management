import type { Currency, Rates } from './types';

export class MissingRateError extends Error {
  year: number;
  constructor(year: number) {
    super(`No exchange rate for ${year}`);
    this.year = year;
  }
}

function rateFor(year: number, rates: Rates): number {
  const r = rates[year];
  if (!r) throw new MissingRateError(year);
  return r;
}

export function toUsdCents(amount: number, currency: Currency, year: number, rates: Rates): number {
  if (currency === 'USD') return amount;
  return Math.round(amount / rateFor(year, rates) * 100);
}

export function usdCentsToVnd(cents: number, year: number, rates: Rates): number {
  return Math.round(cents / 100 * rateFor(year, rates));
}

export const formatUsd = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export const formatVnd = (vnd: number): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(vnd);
