import { createHmac, timingSafeEqual } from 'node:crypto';

type Headers = { id: string | null; timestamp: string | null; signature: string | null };

export function verifyWebhook(h: Headers, rawBody: string, secret: string, nowSec: number): boolean {
  if (!h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const want = createHmac('sha256', key).update(`${h.id}.${h.timestamp}.${rawBody}`).digest();
  return h.signature.split(' ').some((part) => {
    const [v, sig] = part.split(',');
    const got = Buffer.from(sig ?? '', 'base64');
    return v === 'v1' && got.length === want.length && timingSafeEqual(got, want);
  });
}
