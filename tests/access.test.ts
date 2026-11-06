import { test, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));

import { requireKey } from '@/lib/access';

test('accepts the right key', () => { process.env.APP_KEY = 'k'.repeat(32); expect(() => requireKey('k'.repeat(32))).not.toThrow(); });
test('rejects a wrong key of the same length', () => { process.env.APP_KEY = 'k'.repeat(32); expect(() => requireKey('x'.repeat(32))).toThrow('NOT_FOUND'); });
test('rejects a key of a different length', () => { process.env.APP_KEY = 'k'.repeat(32); expect(() => requireKey('k')).toThrow('NOT_FOUND'); });
test('rejects everything when APP_KEY is unset', () => { delete process.env.APP_KEY; expect(() => requireKey('')).toThrow('NOT_FOUND'); });
