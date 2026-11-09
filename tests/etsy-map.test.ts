import { describe, it, expect } from 'vitest';
import { saleIdFor, receiptToSales, categorize, ledgerToRow, mismatches, type EtsyReceipt, type EtsyLedgerEntry } from '@/lib/etsy/map';

const T0 = 1_700_000_000;
const tx = (o: Partial<EtsyReceipt['transactions'][0]> = {}) => ({
  transaction_id: 11, listing_id: 5, title: 'Matcha', quantity: 2,
  price: { amount: 2400, divisor: 100, currency_code: 'USD' }, paid_timestamp: T0, shop_coupon: 0, buyer_coupon: 0, ...o,
});
const receipt = (t = [tx()]): EtsyReceipt => ({ receipt_id: 9, created_timestamp: T0 - 10, transactions: t });
const map = new Map([['5', 'p1']]);
const before = new Date((T0 - 100) * 1000);

describe('receiptToSales', () => {
  it('unit price is amount*100/divisor', () => {
    expect(receiptToSales(receipt(), map, before).sales[0].unit_price).toBe(2400);
    const r = receipt([tx({ price: { amount: 24, divisor: 1, currency_code: 'USD' } })]);
    expect(receiptToSales(r, map, before).sales[0].unit_price).toBe(2400);
  });
  it('discount sums shop and buyer coupon', () => {
    const r = receipt([tx({ shop_coupon: 2.5, buyer_coupon: 1 })]);
    const s = receiptToSales(r, map, before).sales[0];
    expect(s.discount).toBe(350);
    expect(s).toMatchObject({ product_id: 'p1', qty: 2, etsy_receipt_id: '9', etsy_transaction_id: '11', sold_at: new Date(T0 * 1000).toISOString() });
  });
  it('skips transactions paid before connection', () => {
    const r = receiptToSales(receipt(), map, new Date((T0 + 1) * 1000));
    expect(r).toEqual({ sales: [], issues: [] });
  });
  it('unknown listing becomes an issue and no sale', () => {
    const r = receiptToSales(receipt(), new Map(), before);
    expect(r.sales).toEqual([]);
    expect(r.issues).toEqual([{ kind: 'unknown_listing', ref: '11', detail: "Etsy listing 5 (Matcha) isn't linked to a product. Link it in Settings." }]);
  });
  it('non-USD becomes an etsy_error issue', () => {
    const r = receiptToSales(receipt([tx({ price: { amount: 1, divisor: 1, currency_code: 'EUR' } })]), map, before);
    expect(r.sales).toEqual([]);
    expect(r.issues[0]).toMatchObject({ kind: 'etsy_error', ref: 'currency:11' });
  });
});

it('saleIdFor is stable and uuid-shaped', () => {
  expect(saleIdFor('1')).toBe(saleIdFor('1'));
  expect(saleIdFor('1')).not.toBe(saleIdFor('2'));
  expect(saleIdFor('1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

it('categorize is case-insensitive and unknown is uncategorized', () => {
  expect(categorize('LISTING')).toBe('fee');
  expect(categorize('Prolist')).toBe('ads');
  expect(categorize('Refund')).toBe('ignore');
  expect(categorize('weird')).toBe('uncategorized');
});

describe('ledgerToRow', () => {
  const e = (o: Partial<EtsyLedgerEntry>): EtsyLedgerEntry => ({
    entry_id: 1, ledger_type: 'transaction', reference_type: 'transaction', reference_id: '11', amount: -30, currency: 'USD', created_timestamp: T0, ...o,
  });
  const link = { byTransaction: new Map([['11', 'pt']]), byListing: new Map([['5', 'pl']]), byReceipt: new Map([['9', ['a', 'a']], ['8', ['a', 'b']]]) };
  it('fee refund reduces fees', () => {
    const r = ledgerToRow(e({ amount: 30 }), link);
    expect(r).toMatchObject({ amount: 30, category: 'fee', entry_id: '1', at: new Date(T0 * 1000).toISOString(), ledger_type: 'transaction' });
  });
  it('links fee to product by transaction, listing, and single-product receipt only', () => {
    expect(ledgerToRow(e({}), link).product_id).toBe('pt');
    expect(ledgerToRow(e({ reference_type: 'listing', reference_id: '5' }), link).product_id).toBe('pl');
    expect(ledgerToRow(e({ reference_type: 'receipt', reference_id: '9' }), link).product_id).toBe('a');
    expect(ledgerToRow(e({ reference_type: 'receipt', reference_id: '8' }), link).product_id).toBeNull();
    expect(ledgerToRow(e({ reference_type: 'other' }), link).product_id).toBeNull();
  });
  it('ads never get a product', () => {
    expect(ledgerToRow(e({ ledger_type: 'prolist' }), link)).toMatchObject({ category: 'ads', product_id: null });
  });
});

it('mismatch cases', () => {
  const p = (id: string, listing: string | null, stock: number) => ({ id, sku: id.toUpperCase(), etsy_listing_id: listing, stock });
  const l = (id: number, quantity: number, has_variations = false) => ({ listing_id: id, quantity, has_variations, title: 't' });
  const out = mismatches(
    [p('a', null, 1), p('b', '1', 3), p('c', '2', 4), p('d', '3', 2), p('e', '3', 2), p('f', '4', 5), p('g', '5', 5)],
    [l(2, 4, true), l(3, 2), l(4, 9), l(5, 5)],
  );
  expect(out.every((i) => i.kind === 'mismatch')).toBe(true);
  expect(out.map((i) => [i.ref, i.detail])).toEqual([
    ['b', "B: listing isn't active on Etsy, app has 3"],
    ['c', "C: Etsy listing has variations; the check can't compare it"],
    ['d', 'D, E share Etsy listing 3'],
    ['f', 'F: Etsy 9, app 5'],
  ]);
  expect(mismatches([p('x', '9', 0)], [])).toEqual([]);
});
