import { requireKey } from '@/lib/access';
import { loadSnapshot, stockOf } from '@/lib/data';
import SaleForm from './SaleForm';

export const dynamic = 'force-dynamic';

export default async function SalePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const s = await loadSnapshot();
  const products = s.products.filter(p => p.active).map(p => ({
    id: p.id, name: p.name, grams: p.grams, store_price: p.store_price, stock: stockOf(s.moves, p.id),
  }));
  return (
    <>
      <h1>Record a sale</h1>
      <SaleForm keyValue={key} products={products} firstId={crypto.randomUUID()} />
    </>
  );
}
