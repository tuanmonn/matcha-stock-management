import { describe, it, expect } from 'vitest';
import { saleIdFor, receiptToSales, categorize, ledgerToRow, mismatches, type EtsyReceipt, type EtsyLedgerEntry } from '@/lib/etsy/map';

const T0 = 1_700_000_000;
const tx = (o: Partial<EtsyReceipt['transactions'][0]> = {}) => ({
  transaction_id: 11, listing_id: 5, title: 'Matcha', sku: null as string | null, quantity: 2,
  price: { amount: 2400, divisor: 100, currency_code: 'USD' }, paid_timestamp: T0, shop_coupon: 0, buyer_coupon: 0, ...o,
});
const receipt = (t = [tx()]): EtsyReceipt => ({ receipt_id: 9, created_timestamp: T0 - 10, transactions: t });
const map = { bySku: new Map<string, string>(), byListing: new Map([['5', 'p1']]) };
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
    const r = receiptToSales(receipt(), { bySku: new Map(), byListing: new Map() }, before);
    expect(r.sales).toEqual([]);
    expect(r.issues).toEqual([{ kind: 'unknown_listing', ref: '11', detail: 'Etsy order for "Matcha" (SKU "none") doesn\'t match a product. Give the Etsy option the same SKU as the app.' }]);
  });
  const skus = { bySku: new Map([['A20', 'pa'], ['A40', 'pb']]), byListing: new Map([['5', 'p1']]) };
  it('matches by SKU before listing', () => {
    const r = receiptToSales(receipt([tx({ sku: ' A40 ' })]), skus, before);
    expect(r.sales[0].product_id).toBe('pb');
  });
  it('two SKUs in one listing book to the right products', () => {
    const r = receiptToSales(receipt([tx({ sku: 'A20' }), tx({ transaction_id: 12, sku: 'A40' })]), { ...skus, byListing: new Map() }, before);
    expect(r.sales.map((x) => x.product_id)).toEqual(['pa', 'pb']);
  });
  it('falls back to a listing linked to exactly one product', () => {
    expect(receiptToSales(receipt([tx({ sku: 'NOPE' })]), skus, before).sales[0].product_id).toBe('p1');
  });
  it('unknown SKU on a shared listing is an issue', () => {
    const r = receiptToSales(receipt([tx({ sku: 'NOPE' })]), { ...skus, byListing: new Map() }, before);
    expect(r.sales).toEqual([]);
    expect(r.issues[0]).toMatchObject({ kind: 'unknown_listing', ref: '11', detail: 'Etsy order for "Matcha" (SKU "NOPE") doesn\'t match a product. Give the Etsy option the same SKU as the app.' });
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

describe('mismatches', () => {
  const p = (sku: string, listing: string | null, stock: number) => ({ id: sku.toLowerCase(), sku, etsy_listing_id: listing, stock });
  const opt = (sku: string | null, quantity: number, extra: { is_deleted?: boolean } = {}) => ({ sku, ...extra, offerings: [{ quantity, is_enabled: true }] });
  const l = (id: number, title: string, products: ReturnType<typeof opt>[]) => ({ listing_id: id, quantity: 0, has_variations: true, title, inventory: { products } });

  it('mismatch compares each listing option with its SKU across listings', () => {
    const out = mismatches([p('A20', '1', 5), p('A40', null, 3)], [
      l(1, 'Single', [opt('A20', 4), opt('A40', 3)]),
      l(2, 'Set', [opt(' A20 ', 7), opt('A40', 3, { is_deleted: true })]),
    ]);
    expect(out).toEqual([{ kind: 'mismatch', ref: 'a20', detail: 'A20: Etsy 4 in "Single", app 5; A20: Etsy 7 in "Set", app 5' }]);
  });
  it('no issue when every option matches', () => {
    expect(mismatches([p('A20', null, 5)], [l(1, 'Single', [opt('A20', 5)]), l(2, 'Set', [opt('A20', 5)])])).toEqual([]);
  });
  it('sums only enabled, non-deleted offerings', () => {
    const o = { sku: 'A20', offerings: [{ quantity: 2, is_enabled: true }, { quantity: 9, is_enabled: false }, { quantity: 9, is_deleted: true, is_enabled: true }] };
    expect(mismatches([p('A20', null, 2)], [l(1, 'S', [o])])).toEqual([]);
  });
  it('flags a linked product whose SKU no listing carries', () => {
    expect(mismatches([p('A20', '1', 0), p('A40', null, 3)], [l(1, 'Single', [opt('ZZ', 1)])])).toEqual([
      { kind: 'mismatch', ref: 'a20', detail: 'A20: no active Etsy listing option has this SKU' },
    ]);
  });
});
