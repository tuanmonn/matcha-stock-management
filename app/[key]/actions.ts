'use server';
import { revalidatePath } from 'next/cache';
import { requireKey } from '@/lib/access';
import { skuOf, saveSale, saveProduct, setRate, setTimeZone } from '@/lib/data';
import { parseSale, parseProduct, parseRate, parseTimeZone } from '@/lib/forms';
import type { State } from './ui';

const SAVE_FAILED = 'Could not save. Check the values and try again.';

/** Runs a database write, turning a database failure into a short message instead of a crash. */
async function attempt(key: string, write: () => Promise<string | void>): Promise<State> {
  try {
    const saved = await write();
    revalidatePath(`/${key}`, 'layout');
    return { saved: saved || 'Saved.' };
  } catch (e) {
    console.error(e);
    return { error: SAVE_FAILED };
  }
}

export async function recordSale(key: string, _prev: State, f: FormData): Promise<State> {
  requireKey(key);
  const p = parseSale(f);
  if (!p.ok) return { error: p.error };
  return attempt(key, async () => {
    await saveSale(p.value, new Date());
    return `Saved: ${(await skuOf(p.value.product_id)) ?? 'item'} × ${p.value.qty}`;
  });
}

/** `id` is '' when adding a new product. */
export async function saveProductAction(key: string, id: string, _prev: State, f: FormData): Promise<State> {
  requireKey(key);
  const p = parseProduct(f);
  if (!p.ok) return { error: p.error };
  return attempt(key, async () => { await saveProduct(p.value, id || undefined); });
}

export async function setRateAction(key: string, _prev: State, f: FormData): Promise<State> {
  requireKey(key);
  const p = parseRate(f);
  if (!p.ok) return { error: p.error };
  return attempt(key, () => setRate(p.value.year, p.value.vnd_per_usd));
}

export async function setTimeZoneAction(key: string, _prev: State, f: FormData): Promise<State> {
  requireKey(key);
  const p = parseTimeZone(f);
  if (!p.ok) return { error: p.error };
  return attempt(key, () => setTimeZone(p.value));
}
