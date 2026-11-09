import { timingSafeEqual } from 'node:crypto';
import { runDaily } from '@/lib/etsy/sync';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const want = process.env.CRON_SECRET ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`) : null;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  if (!want || got.length !== want.length || !timingSafeEqual(got, want)) return new Response('Unauthorized', { status: 401 });
  return Response.json(await runDaily(new Date()));
}
