import { formatUsd } from './money';

/** Y-axis labels for a chart: the lowest value, zero and the highest value shown (zero is always included, repeats dropped). */
export function yTicks(values: number[], measure: 'profit' | 'revenue' | 'units'): { value: number; label: string }[] {
  const vs = [...new Set([Math.min(0, ...values), 0, Math.max(0, ...values)])];
  return vs.map(value => ({ value, label: measure === 'units' ? String(value) : formatUsd(value) }));
}
