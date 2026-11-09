import { describe, test, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhook } from '@/lib/etsy/webhook';

const raw = Buffer.from('0123456789abcdef0123456789abcdef');
const secret = `whsec_${raw.toString('base64')}`;
const now = 1_800_000_000;
const body = '{"event_type":"order.paid"}';
const sign = (id: string, ts: number, b: string) => createHmac('sha256', raw).update(`${id}.${ts}.${b}`).digest('base64');
const hdr = (sig: string, ts = now) => ({ id: 'msg_1', timestamp: String(ts), signature: sig });

describe('verifyWebhook', () => {
  test('accepts a valid signature', () => {
    expect(verifyWebhook(hdr(`v1,${sign('msg_1', now, body)}`), body, secret, now)).toBe(true);
  });
  test('accepts when one of several v1 signatures matches', () => {
    expect(verifyWebhook(hdr(`v1,AAAA v1,${sign('msg_1', now, body)}`), body, secret, now)).toBe(true);
  });
  test('rejects a tampered body', () => {
    expect(verifyWebhook(hdr(`v1,${sign('msg_1', now, body)}`), body + ' ', secret, now)).toBe(false);
  });
  test('rejects a timestamp 301 seconds old', () => {
    const ts = now - 301;
    expect(verifyWebhook(hdr(`v1,${sign('msg_1', ts, body)}`, ts), body, secret, now)).toBe(false);
  });
  test('rejects missing headers', () => {
    expect(verifyWebhook({ id: null, timestamp: String(now), signature: 'v1,x' }, body, secret, now)).toBe(false);
    expect(verifyWebhook({ id: 'msg_1', timestamp: null, signature: 'v1,x' }, body, secret, now)).toBe(false);
    expect(verifyWebhook({ id: 'msg_1', timestamp: String(now), signature: null }, body, secret, now)).toBe(false);
  });
});
