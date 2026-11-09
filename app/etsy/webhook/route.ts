import { sql } from '@/lib/db';
import { verifyWebhook } from '@/lib/etsy/webhook';
import { fetchReceipt, importReceipt } from '@/lib/etsy/sync';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.text();
  const secret = process.env.ETSY_WEBHOOK_SECRET;
  const id = req.headers.get('webhook-id');
  const ok = secret && verifyWebhook({ id, timestamp: req.headers.get('webhook-timestamp'), signature: req.headers.get('webhook-signature') }, body, secret, Math.floor(Date.now() / 1000));
  if (!ok || !id) return new Response('Unauthorized', { status: 401 });
  try {
    const [s] = await sql`select etsy_status from settings where id = 1`;
    if (s?.etsy_status !== 'connected') return new Response('ok');
    if ((await sql`select 1 from webhook_events where webhook_id = ${id}`).length) return new Response('ok');
    const event = JSON.parse(body) as { event_type?: string; resource_url?: string };
    if (event.event_type === 'order.paid') {
      const receiptId = /\/receipts\/(\d+)/.exec(event.resource_url ?? '')?.[1];
      if (!receiptId) throw new Error('order.paid without a receipt id');
      await importReceipt(await fetchReceipt(receiptId));
    }
    await sql`insert into webhook_events (webhook_id) values (${id}) on conflict do nothing`;
    return new Response('ok');
  } catch (e) {
    console.error('Etsy webhook failed:', (e as Error).message);
    return new Response('Error', { status: 500 });
  }
}
