import { requireKey } from '@/lib/access';
import { loadSnapshot, stockOf } from '@/lib/data';
import { sql } from '@/lib/db';
import { dayKey, todayKey } from '@/lib/periods';
import SaleForm from './SaleForm';

export const dynamic = 'force-dynamic';

export default async function SalePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  requireKey(key);
  const s = await loadSnapshot();
  const products = s.products.filter(p => p.active).map(p => ({
    id: p.id, name: p.name, grams: p.grams, store_price: p.store_price, stock: stockOf(s.moves, p.id),
  }));
  const connected = s.etsy.status === 'connected';
  const [c] = connected ? await sql`select etsy_connected_at from settings where id = 1` : [];
  const connectedDay = c?.etsy_connected_at ? dayKey(new Date(c.etsy_connected_at).toISOString(), s.timeZone ?? 'UTC') : null;
  return (
    <>
      <h1>Record a sale</h1>
      <SaleForm keyValue={key} products={products} firstId={crypto.randomUUID()} etsyConnected={connected} connectedDay={connectedDay} today={todayKey(new Date(), s.timeZone)} />
    </>
  );
}
