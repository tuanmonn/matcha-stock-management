import { addMonths } from './periods';

export type Warning =
  | { productId: string; kind: 'expiry'; level: '3m' | '2m' | '1m' | 'expired'; expiryDate: string }
  | { productId: string; kind: 'low_stock' | 'negative_stock'; stock: number };

type Item = { productId: string; stock: number; lowStockAt: number; earliestExpiry: string | null };

export function warnings(items: Item[], today: string): Warning[] {
  const out: Warning[] = [];
  for (const it of items) {
    const exp = it.earliestExpiry;
    if (exp) {
      const level = today >= exp ? 'expired'
        : today >= addMonths(exp, -1) ? '1m'
        : today >= addMonths(exp, -2) ? '2m'
        : today >= addMonths(exp, -3) ? '3m' : null;
      if (level) out.push({ productId: it.productId, kind: 'expiry', level, expiryDate: exp });
    }
    if (it.stock < 0) out.push({ productId: it.productId, kind: 'negative_stock', stock: it.stock });
    else if (it.stock <= it.lowStockAt) out.push({ productId: it.productId, kind: 'low_stock', stock: it.stock });
  }
  return out;
}
