import { sql } from '@/lib/db';

const api = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

async function post(method: string, body: object, f: typeof fetch) {
  const r = await f(api(method), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }); // a slow Telegram must not hold up the Etsy webhook
  if (!r.ok) throw new Error(`Telegram ${method} failed (${r.status})`);
  return r;
}

/** Silent no-op until the bot token and chat id both exist. */
export async function sendTelegram(text: string, f: typeof fetch = fetch): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const [s] = await sql`select telegram_chat_id from settings where id = 1`;
  if (!s?.telegram_chat_id) return;
  await post('sendMessage', { chat_id: s.telegram_chat_id, text }, f);
}

/** A Telegram failure must never break or roll back an import. */
export async function notifySafely(text: string, f: typeof fetch = fetch): Promise<void> {
  try { await sendTelegram(text, f); } catch { console.error('Telegram failed'); }
}

/** Saves the chat of the newest message sent to the bot, then sends a confirmation. */
export async function linkTelegram(f: typeof fetch = fetch): Promise<string> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return 'Add TELEGRAM_BOT_TOKEN first.';
  const r = await post('getUpdates', {}, f);
  const updates = ((await r.json()) as { result: { message?: { chat: { id: number } } }[] }).result.filter((u) => u.message);
  const chat = updates.at(-1)?.message?.chat.id;
  if (chat === undefined) return 'Send your bot any message in Telegram, then press again.';
  await sql`update settings set telegram_chat_id = ${String(chat)} where id = 1`;
  await sendTelegram("✅ Matcha app connected. You'll get a message for each Etsy sale.", f);
  return 'Linked. A test message was sent.';
}
