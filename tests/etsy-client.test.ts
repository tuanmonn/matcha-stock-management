import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { sameDatabase } from './db-guard';

const b64url = (b: Buffer) => b.toString('base64url');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let c: typeof import('@/lib/etsy/client');
let sql: typeof import('@/lib/db').sql;

beforeAll(async () => {
  // lib/db binds DATABASE_URL on first import: point it at the test branch before anything imports it.
  if (process.env.TEST_DATABASE_URL) {
    for (const real of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]) {
      if (sameDatabase(real, process.env.TEST_DATABASE_URL)) {
        throw new Error('TEST_DATABASE_URL points at the same database as DATABASE_URL (or DATABASE_URL_UNPOOLED); the etsy tests refuse to run.');
      }
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else process.env.DATABASE_URL = 'postgres://u:p@localhost/none';
  process.env.ETSY_API_KEY = 'key'; process.env.ETSY_SHARED_SECRET = 'secret'; process.env.ETSY_REDIRECT_URI = 'https://example.test/etsy/callback';
  c = await import('@/lib/etsy/client');
  sql = (await import('@/lib/db')).sql;
});

describe('etsy client (pure)', () => {
  test('pkce challenge is base64url sha256 of verifier', () => {
    const { verifier, challenge } = c.pkce();
    expect(Buffer.from(verifier, 'base64url')).toHaveLength(32);
    expect(challenge).toBe(b64url(createHash('sha256').update(verifier).digest()));
  });

  test('authorizeUrl has the three read scopes and S256', () => {
    const u = new URL(c.authorizeUrl('st', 'ch'));
    expect(u.origin + u.pathname).toBe('https://www.etsy.com/oauth/connect');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('key');
    expect(u.searchParams.get('redirect_uri')).toBe('https://example.test/etsy/callback');
    expect(u.searchParams.get('scope')).toBe('transactions_r listings_r shops_r');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('code_challenge')).toBe('ch');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('etsy client (database)', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  const setTokens = (access: string, refresh: string, expires: Date) =>
    sql`update settings set etsy_access_token = ${access}, etsy_refresh_token = ${refresh}, etsy_expires_at = ${expires.toISOString()}, etsy_status = 'connected' where id = 1`;
  const row = async () => (await sql`select etsy_access_token, etsy_refresh_token, etsy_expires_at, etsy_status from settings where id = 1`)[0];

  beforeEach(async () => {
    await sql`update settings set etsy_shop_id = null, etsy_user_id = null, etsy_access_token = null, etsy_refresh_token = null, etsy_expires_at = null, etsy_connected_at = null, etsy_status = null, etsy_oauth_state = null, etsy_code_verifier = null, etsy_oauth_started_at = null where id = 1`;
  });

  test('sends x-api-key as key:secret and a bearer token', async () => {
    await setTokens('1.live', 'r1', new Date(Date.now() + 3600_000)); // etsyGet uses the real clock
    let seen: { url: string; headers: Headers } | undefined;
    const f = (async (url: string, init: RequestInit) => { seen = { url, headers: new Headers(init.headers) }; return json(200, { ok: 1 }); }) as unknown as typeof fetch;
    expect(await c.etsyGet('/shops/1', { limit: 5, x: true }, f)).toEqual({ ok: 1 });
    expect(seen!.url).toBe('https://api.etsy.com/v3/application/shops/1?limit=5&x=true');
    expect(seen!.headers.get('x-api-key')).toBe('key:secret');
    expect(seen!.headers.get('authorization')).toBe('Bearer 1.live');
  });

  test('retries once after 429 then throws EtsyError', async () => {
    await setTokens('1.live', 'r1', new Date(Date.now() + 3600_000));
    let calls = 0;
    const f = (async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '0' } }); }) as unknown as typeof fetch;
    await expect(c.etsyGet('/x', {}, f)).rejects.toMatchObject({ name: 'EtsyError', status: 429 });
    expect(calls).toBe(2);
  });

  test('refreshes when under 60 seconds left and saves the new refresh token', async () => {
    await setTokens('1.old', 'r-old', new Date(now.getTime() + 30_000));
    let body = '';
    const f = (async (_u: string, init: RequestInit) => { body = String(init.body); return json(200, { access_token: '1.new', refresh_token: 'r-new', expires_in: 3600, token_type: 'Bearer' }); }) as unknown as typeof fetch;
    expect(await c.getAccessToken(now, f)).toBe('1.new');
    const p = new URLSearchParams(body);
    expect(p.get('grant_type')).toBe('refresh_token'); expect(p.get('refresh_token')).toBe('r-old'); expect(p.get('client_id')).toBe('key');
    const r = await row();
    expect(r.etsy_access_token).toBe('1.new'); expect(r.etsy_refresh_token).toBe('r-new');
    expect(new Date(r.etsy_expires_at).getTime()).toBe(now.getTime() + 3600_000);
  });

  test('returns the stored token while 60 seconds or more are left', async () => {
    await setTokens('1.keep', 'r1', new Date(now.getTime() + 60_000));
    const f = (async () => { throw new Error('no fetch expected'); }) as unknown as typeof fetch;
    expect(await c.getAccessToken(now, f)).toBe('1.keep');
  });

  test('concurrent refresh reuses the saved token', async () => {
    await setTokens('1.old', 'r-old', new Date(now.getTime() + 10_000));
    const f = (async () => {
      await setTokens('1.winner', 'r-winner', new Date(now.getTime() + 3600_000));
      return json(200, { access_token: '1.loser', refresh_token: 'r-loser', expires_in: 3600 });
    }) as unknown as typeof fetch;
    expect(await c.getAccessToken(now, f)).toBe('1.winner');
    expect((await row()).etsy_refresh_token).toBe('r-winner');
  });

  test('invalid_grant marks reconnect', async () => {
    await setTokens('1.old', 'r-old', new Date(now.getTime() + 10_000));
    const f = (async () => json(400, { error: 'invalid_grant', error_description: 'bad' })) as unknown as typeof fetch;
    await expect(c.getAccessToken(now, f)).rejects.toBeInstanceOf(c.EtsyAuthError);
    expect((await row()).etsy_status).toBe('reconnect');
  });
});
