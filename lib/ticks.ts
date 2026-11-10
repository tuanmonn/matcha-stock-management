import { formatUsd } from './money';

/** Y-axis labels for a chart: the lowest value, zero and the highest value shown (zero is always included, repeats dropped,
 *  and an end within 8% of the range from zero is dropped so its label doesn't overlap zero's). */
export function yTicks(values: number[], measure: 'profit' | 'revenue' | 'units'): { value: number; label: string }[] {
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const vs = [...new Set([lo, 0, hi])].filter(v => v === 0 || Math.abs(v) >= (hi - lo) * 0.08);
  return vs.map(value => ({ value, label: measure === 'units' ? String(value) : formatUsd(value) }));
}
