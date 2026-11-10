import { test, expect } from 'vitest';
import { yTicks } from '@/lib/ticks';

test('money ticks: min, zero, max', () => expect(yTicks([-650, 0, 1400], 'profit')).toEqual([
  { value: -650, label: '-$6.50' }, { value: 0, label: '$0.00' }, { value: 1400, label: '$14.00' },
]));
test('units ticks are integers', () => expect(yTicks([0, 3, 12], 'units').map(t => t.label)).toEqual(['0', '12']));
test('all zero gives one tick', () => expect(yTicks([0, 0], 'revenue')).toEqual([{ value: 0, label: '$0.00' }]));
test('an end close to zero is dropped so labels do not overlap', () => expect(yTicks([-189, 0, 6701], 'profit').map(t => t.value)).toEqual([0, 6701]));
