export type Window = { from: string; to: string };
export type Range = { kind: 'week' } | { kind: 'month' } | { kind: 'all' } | { kind: 'custom'; from: string; to: string };

const DAY_MS = 86_400_000;
const ms = (day: string): number => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fmt = (t: number): string => new Date(t).toISOString().slice(0, 10);
const shift = (day: string, n: number): string => fmt(ms(day) + n * DAY_MS);
const lastDayOf = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based

export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export const todayKey = (now: Date, timeZone: string | null): string => dayKey(now.toISOString(), timeZone ?? 'UTC');

export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12), nm = (idx % 12) + 1;
  const nd = Math.min(d, lastDayOf(ny, nm));
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export function monthWindows(today: string): { current: Window; previous: Window } {
  const first = `${today.slice(0, 7)}-01`;
  return { current: { from: first, to: today }, previous: { from: addMonths(first, -1), to: addMonths(today, -1) } };
}

export const inWindow = (day: string, w: Window): boolean => day >= w.from && day <= w.to;

// `since` is the first day with any activity; All time has no previous window.
export function rangeWindows(r: Range, today: string, since?: string | null): { current: Window; previous: Window | null } {
  if (r.kind === 'all') return { current: { from: since ?? today, to: today }, previous: null };
  if (r.kind === 'month') return monthWindows(today);
  if (r.kind === 'week') {
    const sinceMonday = (new Date(ms(today)).getUTCDay() + 6) % 7;
    const from = shift(today, -sinceMonday);
    return { current: { from, to: today }, previous: { from: shift(from, -7), to: shift(today, -7) } };
  }
  const len = (ms(r.to) - ms(r.from)) / DAY_MS + 1;
  const to = shift(r.from, -1);
  return { current: { from: r.from, to: r.to }, previous: { from: shift(to, -(len - 1)), to } };
}

export function daysIn(w: Window): string[] {
  const out: string[] = [];
  for (let t = ms(w.from); t <= ms(w.to); t += DAY_MS) out.push(fmt(t));
  return out;
}
