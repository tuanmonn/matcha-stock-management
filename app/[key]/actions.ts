'use server';
import { revalidatePath } from 'next/cache';
import { requireKey } from '@/lib/access';
import { skuOf, saveSale, saveProduct, setRate, setTimeZone, saveShipment, deleteShipment, saveCorrection, clearExpiry, deleteSale, saveExpense, deleteExpense, saveHistory, deleteHistory } from '@/lib/data';
import { parseSale, parseProduct, parseRate, parseTimeZone, parseShipment, parseCorrection, dropBlankLines, parseExpense, parseHistory } from '@/lib/forms';
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

export async function saveShipmentAction(key: string, _prev: State, f: FormData): Promise<State> {
  requireKey(key);
  const p = parseShipment(dropBlankLines(f));
  if (!p.ok) return { error: p.error };
  return attempt(key, async () => { await saveShipment(p.value); });
}

export async function deleteShipmentAction(key: string, id: string): Promise<void> {
  requireKey(key);
  await deleteShipment(id);
  revalidatePath(`/${key}`, 'layout');
}

export async function saveCorrectionAction(key: string, _prev: State, f: FormData): Promise<State> {
  requireKey(key);
  const p = parseCorrection(f);
  if (!p.ok) return { error: p.error };
  return attempt(key, async () => { await saveCorrection(p.value, new Date()); });
}

export async function deleteSaleAction(key: string, id: string): Promise<void> {
  requireKey(key);
  await deleteSale(id);
  revalidatePath(`/${key}`, 'layout');
}

export async function saveExpenseAction(key: string, _prev: State, f: FormData): Promise<State> {
  requireKey(key);
  const p = parseExpense(f);
  if (!p.ok) return { error: p.error };
  return attempt(key, async () => { await saveExpense(p.value); });
}

export async function deleteExpenseAction(key: string, id: string): Promise<void> {
  requireKey(key);
  await deleteExpense(id);
  revalidatePath(`/${key}`, 'layout');
}

export async function saveHistoryAction(key: string, _prev: State, f: FormData): Promise<State> {
  requireKey(key);
  const p = parseHistory(f);
  if (!p.ok) return { error: p.error };
  return attempt(key, async () => { await saveHistory(p.value); });
}

export async function deleteHistoryAction(key: string, id: string): Promise<void> {
  requireKey(key);
  await deleteHistory(id);
  revalidatePath(`/${key}`, 'layout');
}

export async function clearExpiryAction(key: string, id: string): Promise<void> {
  requireKey(key);
  await clearExpiry(id);
  revalidatePath(`/${key}`, 'layout');
}
