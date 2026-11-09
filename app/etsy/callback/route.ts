import { timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';
import { exchangeCode, etsyGet } from '@/lib/etsy/client';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404 });

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const state = q.get('state');
  const code = q.get('code');
  const [s] = await sql`select etsy_oauth_state, etsy_code_verifier, etsy_oauth_started_at from settings where id = 1`;
  const stored = s?.etsy_oauth_state as string | null | undefined;
  if (q.has('error') || !state || !code || !stored || !s.etsy_code_verifier || !s.etsy_oauth_started_at) return notFound();
  if (state.length !== stored.length || !timingSafeEqual(Buffer.from(state), Buffer.from(stored))) return notFound();
  if (Date.now() - new Date(s.etsy_oauth_started_at).getTime() > 10 * 60_000) return notFound();

  try {
    const t = await exchangeCode(code, s.etsy_code_verifier);
    const expires = new Date(Date.now() + t.expires_in * 1000).toISOString();
    // Saved first: etsyGet reads the new access token from settings. State is cleared now so the code is one-time.
    // Status stays as it was until the shop id is saved, so a failed /users/me never leaves "connected" without a shop.
    await sql`update settings set etsy_access_token = ${t.access_token}, etsy_refresh_token = ${t.refresh_token}, etsy_expires_at = ${expires},
      etsy_oauth_state = null, etsy_code_verifier = null, etsy_oauth_started_at = null where id = 1`;
    const me = await etsyGet<{ user_id: number; shop_id: number }>('/users/me', {});
    await sql`update settings set etsy_user_id = ${String(me.user_id)}, etsy_shop_id = ${String(me.shop_id)},
      etsy_status = 'connected', etsy_connected_at = coalesce(etsy_connected_at, now()) where id = 1`;
    return Response.redirect(new URL(`/${process.env.APP_KEY}/settings`, req.url), 303);
  } catch (e) {
    console.error('Etsy connect failed:', (e as Error).name);
    return new Response("Couldn't connect to Etsy. Go back to Settings and try again.", { status: 500 });
  }
}
