import { describe, test, expect } from 'vitest';
import { sameDatabase } from './db-guard';

const url = (host: string) => `postgres://u:p@${host}/neondb?sslmode=require`;

describe('sameDatabase', () => {
  test('same host is the same', () => {
    expect(sameDatabase(url('ep-a-1.us-east-2.aws.neon.tech'), url('ep-a-1.us-east-2.aws.neon.tech'))).toBe(true);
  });
  test('pooled vs unpooled host of one endpoint is the same', () => {
    expect(sameDatabase(url('ep-a-1-pooler.us-east-2.aws.neon.tech'), url('ep-a-1.us-east-2.aws.neon.tech'))).toBe(true);
  });
  test('different endpoints differ', () => {
    expect(sameDatabase(url('ep-a-1.us-east-2.aws.neon.tech'), url('ep-b-2-pooler.us-east-2.aws.neon.tech'))).toBe(false);
  });
  test('a missing URL is not the same', () => {
    expect(sameDatabase(undefined, url('ep-a-1.x.neon.tech'))).toBe(false);
    expect(sameDatabase(url('ep-a-1.x.neon.tech'), '')).toBe(false);
  });
});
