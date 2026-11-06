'use server';
import { revalidatePath } from 'next/cache';
import { requireKey } from '@/lib/access';
import { skuOf, saveSale } from '@/lib/data';
import { parseSale } from '@/lib/forms';
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
