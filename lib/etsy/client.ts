import { createHash, randomBytes } from 'node:crypto';
import { sql } from '@/lib/db';

const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const API = 'https://api.etsy.com/v3/application';

export type Tokens = { access_token: string; refresh_token: string; expires_in: number };
export class EtsyError extends Error {
  constructor(public status: number, path: string) { super(`Etsy ${status} on ${path}`); this.name = 'EtsyError'; }
}
export class EtsyAuthError extends Error { constructor(m = 'Etsy needs to be reconnected') { super(m); this.name = 'EtsyAuthError'; } }

export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function authorizeUrl(state: string, challenge: string) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: process.env.ETSY_API_KEY!, redirect_uri: process.env.ETSY_REDIRECT_URI!,
    scope: 'transactions_r listings_r shops_r', state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  return `https://www.etsy.com/oauth/connect?${q}`;
}

const tokenPost = (params: Record<string, string>, f: typeof fetch) =>
  f(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.ETSY_API_KEY!, ...params }) });

export async function exchangeCode(code: string, verifier: string, f: typeof fetch = fetch): Promise<Tokens> {
  const r = await tokenPost({ grant_type: 'authorization_code', redirect_uri: process.env.ETSY_REDIRECT_URI!, code, code_verifier: verifier }, f);
  if (!r.ok) throw new EtsyError(r.status, 'token');
  return r.json();
}

export async function getAccessToken(now: Date, f: typeof fetch = fetch): Promise<string> {
  const [s] = await sql`select etsy_access_token, etsy_refresh_token, etsy_expires_at from settings where id = 1`;
  if (!s?.etsy_refresh_token) throw new EtsyAuthError();
  if (s.etsy_access_token && new Date(s.etsy_expires_at).getTime() - now.getTime() >= 60_000) return s.etsy_access_token;

  const r = await tokenPost({ grant_type: 'refresh_token', refresh_token: s.etsy_refresh_token }, f);
  if (r.status === 400 && (await r.json().catch(() => null))?.error === 'invalid_grant') {
    // Only if our token is still the stored one; otherwise a concurrent refresh rotated it and the connection is fine.
    const marked = await sql`update settings set etsy_status = 'reconnect' where id = 1 and etsy_refresh_token = ${s.etsy_refresh_token} returning id`;
    if (marked.length) throw new EtsyAuthError();
    return (await sql`select etsy_access_token from settings where id = 1`)[0].etsy_access_token;
  }
  if (!r.ok) throw new EtsyError(r.status, 'token');
  const t: Tokens = await r.json();
  const expires = new Date(now.getTime() + t.expires_in * 1000).toISOString();
  // Compare-and-set on the old refresh token: refresh tokens are single-use, so only one process may save.
  const won = await sql`update settings set etsy_access_token = ${t.access_token}, etsy_refresh_token = ${t.refresh_token}, etsy_expires_at = ${expires}, etsy_status = 'connected'
    where id = 1 and etsy_refresh_token = ${s.etsy_refresh_token} returning id`;
  if (won.length) return t.access_token;
  const [cur] = await sql`select etsy_access_token from settings where id = 1`;
  return cur.etsy_access_token;
}

export async function etsyGet<T>(path: string, query: Record<string, string | number | boolean>, f: typeof fetch = fetch): Promise<T> {
  const url = `${API}${path}?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`;
  const go = async () => f(url, { headers: { 'x-api-key': `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`, authorization: `Bearer ${await getAccessToken(new Date(), f)}` } });
  let r = await go();
  if (r.status === 429) {
    const wait = Math.min(Number(r.headers.get('retry-after')) || 1, 10);
    await new Promise((res) => setTimeout(res, wait * 1000));
    r = await go();
  }
  if (!r.ok) throw new EtsyError(r.status, path);
  return r.json();
}
