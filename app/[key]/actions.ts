'use server';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { pkce, authorizeUrl } from '@/lib/etsy/client';
import { runDaily } from '@/lib/etsy/sync';
import { requireKey } from '@/lib/access';
import { skuOf, saveSale, saveProduct, setRate, setTimeZone, saveShipment, deleteShipment, saveCorrection, clearExpiry, deleteSale, saveExpense, deleteExpense, saveHistory, deleteHistory } from '@/lib/data';
import { parseSale, parseProduct, parseRate, parseTimeZone, parseShipment, parseCorrection, dropBlankLines, parseExpense, parseHistory, manualEtsyBlocked } from '@/lib/forms';
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
  const [{ etsy_status }] = await sql`select etsy_status from settings where id = 1`;
  const blocked = manualEtsyBlocked(p.value.channel, etsy_status);
  if (blocked) return { error: blocked };
  let inserted = true;
  const r = await attempt(key, async () => {
    inserted = await saveSale(p.value, new Date());
    return `Saved: ${(await skuOf(p.value.product_id)) ?? 'item'} × ${p.value.qty}`;
  });
  // Same id as an earlier save whose reply was lost: nothing new was recorded, so don't say it was.
  return r?.saved && !inserted ? { error: 'Already saved. If this is a different sale, tap Save again.' } : r;
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

export async function connectEtsyAction(key: string): Promise<void> {
  requireKey(key);
  const { verifier, challenge } = pkce();
  const state = randomBytes(32).toString('base64url');
  await sql`update settings set etsy_oauth_state = ${state}, etsy_code_verifier = ${verifier}, etsy_oauth_started_at = now() where id = 1`;
  redirect(authorizeUrl(state, challenge));
}

export async function syncNowAction(key: string, _prev: State): Promise<State> {
  requireKey(key);
  return attempt(key, async () => (await runDaily(new Date())).join('. '));
}

export async function dismissIssueAction(key: string, id: string): Promise<void> {
  requireKey(key);
  await sql`update sync_issues set resolved_at = now() where id = ${id}`;
  revalidatePath(`/${key}`, 'layout');
}
