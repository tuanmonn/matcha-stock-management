export type Currency = 'USD' | 'VND';
/** year -> VND per USD */
export type Rates = Record<number, number>;

export type Product = {
  id: string; sku: string; name: string; grams: number; packaging: 'can' | 'bag'; details: string;
  store_price: number; etsy_listing_id: string | null; low_stock_at: number; active: boolean;
};
export type Shipment = { id: string; received_on: string; freight_amount: number; freight_currency: Currency; note: string };
export type ShipmentLine = {
  id: string; shipment_id: string; product_id: string; units: number;
  vendor_amount: number; vendor_currency: Currency; expiry_date: string;
};
export type Sale = {
  id: string; channel: 'etsy' | 'store'; sold_at: string; product_id: string; qty: number;
  unit_price: number; discount: number; currency: Currency; etsy_receipt_id: string | null; etsy_transaction_id: string | null;
};
export type StockMove = {
  id: string; product_id: string; qty_delta: number; kind: 'shipment' | 'sale' | 'correction';
  ref: string; reason: string; at: string;
};
export type Expense = { id: string; spent_on: string; category: 'packaging' | 'gift'; amount: number; currency: Currency; note: string };
export type HistoryRow = {
  id: string; month: string; product_id: string; channel: 'etsy' | 'store'; units: number;
  revenue: number; currency: Currency; orders: number;
};
export type ExpiryDate = { id: string; product_id: string; expiry_date: string; cleared_at: string | null };
export type LedgerRow = {
  entry_id: string; at: string; category: 'fee' | 'ads' | 'ignore' | 'uncategorized'; amount: number;
  currency: Currency; product_id: string | null; ledger_type: string;
};
export type SyncIssue = { id: string; kind: 'mismatch' | 'unknown_listing' | 'etsy_error'; ref: string; detail: string; created_at: string };
