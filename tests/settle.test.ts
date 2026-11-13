import { test, expect } from 'vitest';
import { settle } from '@/lib/settle';
import type { Snapshot } from '@/lib/data';

// Revenue $1,000; My paid $600 for a shipment, Ngoc paid a $100 expense.
const base = {
  products: [], moves: [], expiry: [], issues: [], etsy: { status: null }, history: [], ledger: [], transfers: [],
  rates: { 2026: 25000 }, timeZone: 'America/Chicago',
  sales: [{ id: 's', channel: 'store', sold_at: '2026-11-05T15:00:00Z', product_id: 'p', qty: 10, unit_price: 10000, discount: 0, currency: 'USD', etsy_receipt_id: null, etsy_transaction_id: null }],
  shipments: [{ id: 'sh', paid_by: 'my', freight_paid_by: 'my', received_on: '2026-10-01', freight_amount: 10000, freight_currency: 'USD', note: '' }],
  lines: [{ id: 'l', shipment_id: 'sh', product_id: 'p', units: 10, vendor_amount: 50000, vendor_currency: 'USD', expiry_date: '2027-01-01' }],
  expenses: [{ id: 'x', paid_by: 'ngoc', spent_on: '2026-10-02', category: 'packaging', amount: 10000, currency: 'USD', note: '' }],
} as unknown as Snapshot;

test('profit split 50/50 on top of what each paid', () => {
  const r = settle(base, 'America/Chicago', 2026);
  expect(r).toMatchObject({ moneyIn: 100000, paid: { my: 60000, ngoc: 10000 }, profit: 30000 });
  expect(r.payout).toEqual({ my: 75000, ngoc: 25000, ngocOwesVnd: 18_750_000 });
});
test('transfers already sent (VND) lower what Ngoc still owes', () => {
  const r = settle({ ...base, transfers: [{ id: 't', sent_on: '2026-11-06', amount: 10_000_000, note: '' }] }, 'America/Chicago', 2026);
  expect(r.payout?.ngocOwesVnd).toBe(8_750_000);
});
test('no profit means no payout', () => {
  const r = settle({ ...base, sales: [] }, 'America/Chicago', 2026);
  expect(r.profit).toBe(-70000);
  expect(r.payout).toBeNull();
});
test('Etsy fees reduce money in; ignored entries do not', () => {
  const led = (category: string, amount: number) => ({ entry_id: category, at: '2026-11-05T15:00:00Z', category, amount, currency: 'USD', product_id: null, ledger_type: 'x' });
  const r = settle({ ...base, ledger: [led('fee', -2000), led('ignore', -9999)] } as Snapshot, 'America/Chicago', 2026);
  expect(r.moneyIn).toBe(98000);
});
test('odd cent rounds up for My', () => {
  const r = settle({ ...base, expenses: [{ ...base.expenses[0], amount: 10001 }] }, 'America/Chicago', 2026);
  expect(r.profit).toBe(29999);
  expect(r.payout).toMatchObject({ my: 60000 + 15000, ngoc: 10001 + 14999 });
});
test('freight can be paid by someone other than the matcha payer', () => {
  const r = settle({ ...base, shipments: [{ ...base.shipments[0], freight_paid_by: 'ngoc' }] } as Snapshot, 'America/Chicago', 2026);
  expect(r.paid).toEqual({ my: 50000, ngoc: 20000 });
});
