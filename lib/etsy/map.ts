import { createHash } from 'node:crypto';
import type { LedgerRow, Currency } from '@/lib/types';

export type EtsyTransaction = {
  transaction_id: number; listing_id: number; title: string; sku: string | null; quantity: number;
  price: { amount: number; divisor: number; currency_code: string };
  paid_timestamp: number | null; shop_coupon: number; buyer_coupon: number;
};
export type EtsyReceipt = { receipt_id: number; created_timestamp: number; transactions: EtsyTransaction[] };
export type EtsyLedgerEntry = {
  entry_id: number; ledger_type: string; reference_type: string; reference_id: string;
  amount: number; currency: string; created_timestamp: number;
};
export type EtsyListing = { listing_id: number; quantity: number; has_variations: boolean; title: string; state?: string;
  inventory?: { products: { sku: string | null; is_deleted?: boolean; offerings: { quantity: number; is_enabled?: boolean; is_deleted?: boolean }[] }[] };
};

export type EtsySaleRow = {
  id: string; product_id: string; sold_at: string; qty: number; unit_price: number; discount: number;
  etsy_receipt_id: string; etsy_transaction_id: string;
};
export type IssueRow = { kind: 'mismatch' | 'unknown_listing' | 'etsy_error'; ref: string; detail: string };

export function saleIdFor(transactionId: string): string {
  const h = createHash('sha256').update('etsy-transaction:' + transactionId).digest('hex').slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function receiptToSales(receipt: EtsyReceipt, link: { bySku: Map<string, string>; byListing: Map<string, string> }, connectedAt: Date) {
  const sales: EtsySaleRow[] = [];
  const issues: IssueRow[] = [];
  for (const t of receipt.transactions) {
    const paid = (t.paid_timestamp ?? receipt.created_timestamp) * 1000;
    if (paid < connectedAt.getTime()) continue;
    const id = String(t.transaction_id);
    const product_id = link.bySku.get((t.sku ?? '').trim()) ?? link.byListing.get(String(t.listing_id));
    if (!product_id) {
      issues.push({ kind: 'unknown_listing', ref: id, detail: `Etsy order for "${t.title}" (SKU "${t.sku?.trim() || 'none'}") doesn't match a product. Give the Etsy option the same SKU as the app.` });
    } else if (t.price.currency_code !== 'USD') {
      issues.push({ kind: 'etsy_error', ref: `currency:${id}`, detail: `Transaction ${id} is priced in ${t.price.currency_code}; only USD is supported.` });
    } else {
      sales.push({
        id: saleIdFor(id), product_id, sold_at: new Date(paid).toISOString(), qty: t.quantity,
        unit_price: Math.round((t.price.amount * 100) / t.price.divisor),
        discount: Math.round((t.shop_coupon + t.buyer_coupon) * 100),
        etsy_receipt_id: String(receipt.receipt_id), etsy_transaction_id: id,
      });
    }
  }
  return { sales, issues };
}

const FEE = ['listing', 'transaction', 'transaction_quantity', 'renew_sold', 'renew_sold_auto', 'renew_expired', 'payment_processing_fee', 'processing_fee', 'vat_seller_services', 'shipping_transaction', 'tax_seller_services', 'buyer_fee', 'listing_refund', 'transaction_quantity_refund', 'seller_onboarding_fee'];
const ADS = ['prolist', 'offsite_ads_fee', 'etsy_ads'];
const IGNORE = ['payment', 'sale', 'disbursement', 'disburse', 'disburse2', 'refund', 'shipping_label', 'shipping_labels', 'sales_tax', 'tax', 'payment_gross', 'seller_onboarding_fee_payment'];

export function categorize(ledgerType: string): LedgerRow['category'] {
  const t = ledgerType.toLowerCase();
  return FEE.includes(t) ? 'fee' : ADS.includes(t) ? 'ads' : IGNORE.includes(t) ? 'ignore' : 'uncategorized';
}

export function ledgerToRow(
  e: EtsyLedgerEntry,
  link: { byTransaction: Map<string, string>; byListing: Map<string, string>; byReceipt: Map<string, string[]> },
): LedgerRow {
  const category = categorize(e.ledger_type);
  let product_id: string | null = null;
  if (category === 'fee') {
    if (e.reference_type === 'transaction') product_id = link.byTransaction.get(e.reference_id) ?? null;
    else if (e.reference_type === 'listing') product_id = link.byListing.get(e.reference_id) ?? null;
    else if (e.reference_type === 'receipt') {
      const ids = link.byReceipt.get(e.reference_id);
      if (ids?.length && ids.every((x) => x === ids[0])) product_id = ids[0];
    }
  }
  return {
    entry_id: String(e.entry_id), at: new Date(e.created_timestamp * 1000).toISOString(), category,
    amount: e.amount, currency: e.currency as Currency, product_id, ledger_type: e.ledger_type,
  };
}

export function mismatches(
  products: { id: string; sku: string; etsy_listing_id: string | null; stock: number }[],
  listings: EtsyListing[],
): IssueRow[] {
  const bySku = new Map<string, { title: string; qty: number }[]>();
  for (const l of listings) {
    for (const o of l.inventory?.products ?? []) {
      if (o.is_deleted || !o.sku?.trim()) continue;
      const qty = o.offerings.filter((x) => x.is_enabled && !x.is_deleted).reduce((n, x) => n + x.quantity, 0);
      const k = o.sku.trim();
      bySku.set(k, [...(bySku.get(k) ?? []), { title: l.title, qty }]);
    }
  }
  const out: IssueRow[] = [];
  for (const p of products) {
    const entries = bySku.get(p.sku);
    if (!entries) {
      if (p.etsy_listing_id) out.push({ kind: 'mismatch', ref: p.id, detail: `${p.sku}: no active Etsy listing option has this SKU` });
      continue;
    }
    const bad = entries.filter((e) => e.qty !== p.stock);
    if (bad.length) out.push({ kind: 'mismatch', ref: p.id, detail: bad.map((e) => `${p.sku}: Etsy ${e.qty} in "${e.title}", app ${p.stock}`).join('; ') });
  }
  return out;
}
