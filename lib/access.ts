import { timingSafeEqual } from 'node:crypto';
import { notFound } from 'next/navigation';

export function requireKey(key: string): void {
  const want = process.env.APP_KEY;
  if (!want) notFound();
  const a = Buffer.from(key);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) notFound();
}
