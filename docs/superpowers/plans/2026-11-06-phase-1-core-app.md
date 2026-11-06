# Phase 1 Core App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phase 1 of the matcha stock and profit app: products, shipments, store and manual Etsy sales, corrections, expenses, past monthly totals, reports, in-app warnings and export, behind a private link. There is no Etsy connection in this phase.

**Architecture:** A Next.js App Router app on Vercel's free plan, backed by Neon Postgres through plain SQL. All money and date logic lives in small pure modules under `lib/`, with Vitest tests. Pages are thin: they load a snapshot of the database, call the pure modules, and render. Writes go through server actions that check the private key first.

**Tech Stack:** Node 24, Next.js (latest stable from `create-next-app`) with TypeScript, `@neondatabase/serverless`, Vitest, and one plain CSS file.

**Spec:** `docs/superpowers/specs/2026-11-06-matcha-stock-profit-app-design.md`. Requirements: `REQUIREMENTS.md`.

## Global Constraints

- **Dependencies:** runtime is only `next`, `react`, `react-dom` and `@neondatabase/serverless`. Dev is only `typescript`, `@types/*` and `vitest`. "No ORM, UI library, chart library or auth library."
- **Money:** "stored as an integer amount plus a currency (`USD` cents or whole `VND`). Conversion happens only in reports."
- **Private link:** "Every page lives under `/{APP_KEY}/…`… Any other path returns 404." Every server action calls `requireKey(key)` as its first line.
- **Headers:** every response sends `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
- **Etsy:** the app never writes to Etsy. This phase makes no Etsy calls at all.
- **Exchange rates:** "every amount converts to USD and VND using its own year's rate from `fx_rates`. If a year has no rate, the report says so and doesn't guess."
- **Days and months:** set by `settings.time_zone`, which is an IANA name such as `America/New_York`. Until it's set, reports show "Set the store's time zone in Settings" instead of numbers.
- **Stock:** stock is the sum of `stock_moves`, never stored separately.
- **Weeks:** a week starts on Monday.
- **Thresholds:** low stock at `low_stock_at` (default 3). Expiry warnings start at 3, 2 and 1 calendar months before the expiry date.
- **Phone screen:** large tap targets (at least 48px), and no sideways scrolling at 375px width.
- **Field names:** TypeScript row types use the database's snake_case column names as-is. There is no mapping layer.
- **Next.js:** in current Next.js, page and route `params` is a Promise, so `await` it before reading `key`.

## Review Focus

1. **Double-tapping Save on the phone:** this records one sale, not two. The form carries a sale id created at page render, and the insert does nothing on conflict (Task 10).
2. **Entering a sale, expense, shipment or past month by mistake:** it can be deleted, and stock and reports go back to how they were (Task 10, and the delete buttons in Tasks 13–15).
3. **A year with no exchange rate:** reports name the missing year instead of showing NaN or crashing (Tasks 3 and 16).
4. **A product already past its expiry date:** it shows as "Expired", not as no warning (Task 8).
5. **Selling more than the app thinks is in stock:** the sale saves, stock goes negative with a warning, and cost of goods sold still gets a value (Tasks 5 and 16).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/access.ts` | `requireKey` for the private link |
| `lib/types.ts` | Row types matching `db/schema.sql` |
| `lib/money.ts` | Currency conversion and formatting |
| `lib/freight.ts` | Freight split by weight |
| `lib/cost.ts` | Weighted-average cost replay |
| `lib/periods.ts` | Day keys in the store's time zone, and date-range windows |
| `lib/profit.ts` | Profit summaries, including for past monthly totals |
| `lib/alerts.ts` | Expiry and low-stock warnings |
| `lib/forms.ts` | Parsing and validating form input |
| `lib/report.ts` | Dashboard: turns a database snapshot into report figures |
| `lib/db.ts` | Neon client |
| `lib/data.ts` | All SQL: `loadSnapshot` and the write functions |
| `db/schema.sql`, `scripts/migrate.mjs` | Schema and migration runner |
| `app/[key]/layout.tsx` | Key check and navigation |
| `app/[key]/page.tsx` | Dashboard |
| `app/[key]/Chart.tsx` | Daily line chart (client component) |
| `app/[key]/sale/page.tsx` | Phone sale screen |
| `app/[key]/stock/page.tsx` | Stock, corrections and expiry dates |
| `app/[key]/shipments/page.tsx` | Shipments |
| `app/[key]/sales/page.tsx` | Sales list, expenses and past totals |
| `app/[key]/settings/page.tsx` | Products, rates and time zone |
| `app/[key]/actions.ts` | Every server action |
| `app/[key]/export/route.ts` | JSON export |
| `app/globals.css` | Plain styles |
| `tests/*.test.ts` | Vitest tests |

---

### Task 1: Project setup and private link

**Files:**
- Create: the project from `create-next-app`, then `lib/access.ts`, `app/[key]/layout.tsx`, `app/[key]/page.tsx` (placeholder), `vitest.config.ts` (with the `@` alias pointing at the project root), `.env.example`, `tests/access.test.ts`
- Modify: `next.config.ts` (headers), `app/globals.css` (replace with plain styles), `app/page.tsx` (delete it, so `/` returns 404)

**Interfaces:**
- Produces: `requireKey(key: string): void`, which calls Next's `notFound()` unless `key` equals `process.env.APP_KEY`. It compares with `crypto.timingSafeEqual` after a length check, and an empty or unset `APP_KEY` always fails.

- [ ] **Step 1: Scaffold.** In the project root, run `npx create-next-app@latest . --ts --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*"`, then `npm i @neondatabase/serverless` and `npm i -D vitest`, then `git init`. Expected: `npm run dev` serves the starter page.
- [ ] **Step 2: Write the failing test** in `tests/access.test.ts`. Mock `next/navigation`'s `notFound` to throw `new Error('NOT_FOUND')`.

```ts
test('accepts the right key', () => { process.env.APP_KEY = 'k'.repeat(32); expect(() => requireKey('k'.repeat(32))).not.toThrow(); });
test('rejects a wrong key of the same length', () => { process.env.APP_KEY = 'k'.repeat(32); expect(() => requireKey('x'.repeat(32))).toThrow('NOT_FOUND'); });
test('rejects a key of a different length', () => { process.env.APP_KEY = 'k'.repeat(32); expect(() => requireKey('k')).toThrow('NOT_FOUND'); });
test('rejects everything when APP_KEY is unset', () => { delete process.env.APP_KEY; expect(() => requireKey('')).toThrow('NOT_FOUND'); });
```

- [ ] **Step 3: Run** `npx vitest run tests/access.test.ts`. Expected: FAIL, because `requireKey` is not defined.
- [ ] **Step 4: Implement** `requireKey` in `lib/access.ts`. In `next.config.ts`, add `headers()` returning both headers for `source: '/:path*'`. The layout calls `requireKey(params.key)` and renders a nav with links to the dashboard, Sale, Stock, Shipments, Sales and Settings. `.env.example` lists `APP_KEY=` and `DATABASE_URL=`.
- [ ] **Step 5: Run** the test again. Expected: PASS. Then manually: with `APP_KEY` set in `.env.local`, `/{APP_KEY}` renders the nav, while `/wrong` and `/` return 404, and `curl -I` shows both headers.
- [ ] **Step 6: Commit** with `git add -A && git commit -m "feat: project setup and private link"`.

### Task 2: Database schema and client

**Files:**
- Create: `db/schema.sql`, `scripts/migrate.mjs`, `lib/db.ts`

**Interfaces:**
- Produces: `sql`, the Neon tagged-template client from `neon(process.env.DATABASE_URL!)`, exported from `lib/db.ts`. Also `npm run migrate`, which runs `scripts/migrate.mjs` to execute `db/schema.sql`. Every statement uses `create … if not exists`, so it's safe to re-run.

**Before this task:** you create a free Neon project and two branches, `main` and `test`. Put the `main` connection string in `.env.local` as `DATABASE_URL` and the `test` one as `TEST_DATABASE_URL`.

- [ ] **Step 1: Write `db/schema.sql`** with these tables and constraints, all with `id uuid primary key default gen_random_uuid()` unless noted:
  - **products:** `sku text unique not null`, `name text not null`, `grams int not null check (grams > 0)`, `packaging text not null check (packaging in ('can','bag'))`, `details text not null default ''`, `store_price int not null check (store_price >= 0)` (USD cents), `etsy_listing_id text`, `low_stock_at int not null default 3`, `active boolean not null default true`.
  - **shipments:** `received_on date not null`, `freight_amount bigint not null check (freight_amount >= 0)`, `freight_currency text not null check (freight_currency in ('USD','VND'))`, `note text not null default ''`.
  - **shipment_lines:** `shipment_id uuid not null references shipments on delete cascade`, `product_id uuid not null references products`, `units int not null check (units > 0)`, `vendor_amount bigint not null check (vendor_amount >= 0)`, `vendor_currency text not null check (vendor_currency in ('USD','VND'))`, `expiry_date date not null`.
  - **sales:** `id uuid primary key` (supplied by the form, with no default), `channel text not null check (channel in ('etsy','store'))`, `sold_at timestamptz not null`, `product_id uuid not null references products`, `qty int not null check (qty > 0)`, `unit_price bigint not null check (unit_price >= 0)`, `currency text not null check (currency in ('USD','VND'))`, `etsy_receipt_id text`, `etsy_transaction_id text unique`.
  - **stock_moves:** `product_id uuid not null references products`, `qty_delta int not null check (qty_delta <> 0)`, `kind text not null check (kind in ('shipment','sale','correction'))`, `ref text not null`, `reason text not null default ''`, `at timestamptz not null`, `unique (kind, ref)`.
  - **expenses:** `spent_on date not null`, `category text not null check (category in ('packaging','gift'))`, `amount bigint not null check (amount > 0)`, `currency text not null check (currency in ('USD','VND'))`, `note text not null default ''`.
  - **monthly_history:** `month date not null` (the first of the month), `product_id uuid not null references products`, `channel text not null check (channel in ('etsy','store'))`, `units int not null check (units >= 0)`, `revenue bigint not null check (revenue >= 0)`, `currency text not null check (currency in ('USD','VND'))`, `orders int not null check (orders >= 0)`, `unique (month, product_id, channel)`.
  - **expiry_dates:** `product_id uuid not null references products`, `expiry_date date not null`, `cleared_at timestamptz`, `unique (product_id, expiry_date)`.
  - **fx_rates:** `year int primary key`, `vnd_per_usd numeric not null check (vnd_per_usd > 0)`.
  - **settings:** `id int primary key default 1 check (id = 1)`, `time_zone text`, then `insert into settings (id) values (1) on conflict do nothing`.

  Phase 1 leaves out the Etsy, alert and issue tables. Their phases add them.
- [ ] **Step 2: Run** `npm run migrate`, twice, against `DATABASE_URL` and then `TEST_DATABASE_URL`. Expected: no errors either time. In the Neon SQL editor, `select count(*) from settings` returns 1.
- [ ] **Step 3: Commit** with `git commit -am "feat: database schema"` (add the new files first).

### Task 3: Row types, money and exchange rates

**Files:**
- Create: `lib/types.ts`, `lib/money.ts`, `tests/money.test.ts`

**Interfaces:**
- Produces, in `lib/types.ts`: `Currency = 'USD'|'VND'`, `Rates = Record<number, number>` (year → VND per USD), and one row type per table (`Product`, `Shipment`, `ShipmentLine`, `Sale`, `StockMove`, `Expense`, `HistoryRow`, `ExpiryDate`). Field names and kinds come from Task 2: dates as `'YYYY-MM-DD'` strings, timestamps as ISO strings, and bigint amounts as `number`.
- Produces, in `lib/money.ts`:
  - `class MissingRateError extends Error { year: number }`
  - `toUsdCents(amount: number, currency: Currency, year: number, rates: Rates): number`: USD passes through, and VND converts as `Math.round(amount / rate * 100)`. It throws `MissingRateError` only when it needs a rate that's missing.
  - `usdCentsToVnd(cents: number, year: number, rates: Rates): number`: `Math.round(cents / 100 * rate)`.
  - `formatUsd(cents: number): string` returns `'$1,234.56'`, and `formatVnd(vnd: number): string` returns `'1.234.567 ₫'`. Both use `Intl.NumberFormat` (`en-US` for USD, `vi-VN` for VND).

- [ ] **Step 1: Write the failing tests.**

```ts
const rates = { 2026: 25000 };
test('USD passes through', () => expect(toUsdCents(1234, 'USD', 2026, {})).toBe(1234));
test('VND converts at the year rate', () => expect(toUsdCents(1_250_000, 'VND', 2026, rates)).toBe(5000));
test('cents to VND', () => expect(usdCentsToVnd(5000, 2026, rates)).toBe(1_250_000));
test('missing year names the year', () => { expect(() => toUsdCents(1, 'VND', 2027, rates)).toThrow(MissingRateError); try { toUsdCents(1, 'VND', 2027, rates) } catch (e) { expect((e as MissingRateError).year).toBe(2027) } });
test('formats', () => { expect(formatUsd(123456)).toBe('$1,234.56'); expect(formatVnd(1234567)).toMatch(/1\.234\.567/); });
```

- [ ] **Step 2: Run** `npx vitest run tests/money.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** the tests again. Expected: PASS.
- [ ] **Step 5: Commit** with `feat: money and exchange rates`.

### Task 4: Freight split by weight

**Files:**
- Create: `lib/freight.ts`, `tests/freight.test.ts`

**Interfaces:**
- Produces: `allocateFreight(total: number, lines: { grams: number; units: number }[]): number[]`. It returns one integer per line, in order. Every line but the last gets `Math.floor(total * w / W)`, where `w = grams * units` and `W` is the sum of the weights. The last line gets `total` minus the others. With no lines, it returns `[]`.

- [ ] **Step 1: Write the failing tests.**

```ts
test('splits by weight, last takes remainder', () => expect(allocateFreight(20000, [{ grams: 100, units: 20 }, { grams: 30, units: 20 }])).toEqual([15384, 4616]));
test('always sums to total', () => { const r = allocateFreight(10001, [{ grams: 30, units: 7 }, { grams: 100, units: 3 }, { grams: 50, units: 11 }]); expect(r.reduce((a, b) => a + b, 0)).toBe(10001); });
test('single line takes everything', () => expect(allocateFreight(999, [{ grams: 30, units: 1 }])).toEqual([999]));
test('no lines', () => expect(allocateFreight(500, [])).toEqual([]));
```

- [ ] **Step 2: Run** `npx vitest run tests/freight.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `allocateFreight`.
- [ ] **Step 4: Run** the tests again. Expected: PASS.
- [ ] **Step 5: Commit** with `feat: freight split by weight`.

### Task 5: Weighted-average cost replay

**Files:**
- Create: `lib/cost.ts`, `tests/cost.test.ts`

**Interfaces:**
- Produces: `type CostEvent = { at: string } & ({ type: 'receive'; units: number; landedUsdCents: number } | { type: 'sale'; saleId: string; qty: number } | { type: 'adjust'; qty: number })`.
- Produces: `replayCost(events: CostEvent[]): { cogs: Record<string, number>; avgCostCents: number; negativeAt: string | null }`. It sorts by `at` without reordering events that share an `at`, then follows the algorithm below. `negativeAt` is the time of the first sale that ran out of stock.

The algorithm, which the signature doesn't determine:
- **Receive:** `units += u; cost += landed; lastAvg = cost / units`.
- **Sale of `q`:** take `min(q, units)` at `cost / units` from the pool, plus any shortfall at `lastAvg`. Record `cogs[saleId] = Math.round(taken)`, then reduce the pool, never below `0/0`. A shortfall sets `negativeAt` if it isn't already set.
- **Adjust:** a positive `q` adds `q` units at `lastAvg`. A negative `q` removes them like a sale, without recording cost of goods sold.
- **Result:** `avgCostCents = Math.round(lastAvg)`, with `lastAvg` starting at 0.

- [ ] **Step 1: Write the failing tests.**

```ts
const r = (at: string, units: number, landedUsdCents: number) => ({ at, type: 'receive' as const, units, landedUsdCents });
const s = (at: string, saleId: string, qty: number) => ({ at, type: 'sale' as const, saleId, qty });
test('averages across shipments', () => {
  const out = replayCost([r('2026-01-01', 10, 10000), s('2026-01-02', 'a', 2), r('2026-01-03', 10, 20000), s('2026-01-04', 'b', 3)]);
  expect(out.cogs).toEqual({ a: 2000, b: 4667 }); expect(out.avgCostCents).toBe(1556); expect(out.negativeAt).toBeNull();
});
test('order of input does not matter', () => expect(replayCost([s('2026-01-02', 'a', 2), r('2026-01-01', 10, 10000)]).cogs).toEqual({ a: 2000 }));
test('selling past zero uses last average and flags', () => {
  const out = replayCost([r('2026-01-01', 3, 3000), s('2026-01-02', 'a', 5)]);
  expect(out.cogs.a).toBe(5000); expect(out.negativeAt).toBe('2026-01-02');
});
test('sale with no shipment ever costs zero and flags', () => expect(replayCost([s('2026-01-02', 'a', 1)])).toEqual({ cogs: { a: 0 }, avgCostCents: 0, negativeAt: '2026-01-02' }));
test('positive adjust adds units at average', () => expect(replayCost([r('2026-01-01', 10, 10000), { at: '2026-01-02', type: 'adjust', qty: 5 }, s('2026-01-03', 'a', 15)]).cogs.a).toBe(15000));
```

- [ ] **Step 2: Run** `npx vitest run tests/cost.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `replayCost`.
- [ ] **Step 4: Run** the tests again. Expected: PASS.
- [ ] **Step 5: Commit** with `feat: weighted average cost replay`.

### Task 6: Day keys and date ranges

**Files:**
- Create: `lib/periods.ts`, `tests/periods.test.ts`

**Interfaces:**
- Produces:
  - `dayKey(iso: string, timeZone: string): string`: returns `'YYYY-MM-DD'`, using `Intl.DateTimeFormat('en-CA', { timeZone })`.
  - `type Window = { from: string; to: string }`, where both bounds are inclusive day keys.
  - `monthWindows(today: string): { current: Window; previous: Window }`: current runs from the first of the month to today. Previous runs from the first of last month to the same day of the month, capped at that month's last day.
  - `addMonths(day: string, n: number): string`: clamps to the end of the month, so `addMonths('2027-03-31', -1)` gives `'2027-02-28'`.
  - `inWindow(day: string, w: Window): boolean`.
  - `type Range = { kind: 'week' } | { kind: 'month' } | { kind: 'custom'; from: string; to: string }`.
  - `rangeWindows(r: Range, today: string): { current: Window; previous: Window }`: `month` is `monthWindows(today)`. `week` runs from Monday of this week to today, against the same days last week. `custom` is `{ from, to }`, against the same number of days ending the day before `from`.
  - `daysIn(w: Window): string[]`: every day key from `from` to `to`, in order.

- [ ] **Step 1: Write the failing tests.**

```ts
test('day key respects time zone', () => expect(dayKey('2026-11-01T03:00:00Z', 'America/New_York')).toBe('2026-10-31'));
test('mid month', () => expect(monthWindows('2026-11-10')).toEqual({ current: { from: '2026-11-01', to: '2026-11-10' }, previous: { from: '2026-10-01', to: '2026-10-10' } }));
test('31 March caps at February end', () => expect(monthWindows('2027-03-31').previous).toEqual({ from: '2027-02-01', to: '2027-02-28' }));
test('leap year', () => expect(monthWindows('2028-03-31').previous.to).toBe('2028-02-29'));
test('first day of month', () => expect(monthWindows('2026-11-01').previous).toEqual({ from: '2026-10-01', to: '2026-10-01' }));
test('January looks back to December', () => expect(monthWindows('2027-01-15').previous).toEqual({ from: '2026-12-01', to: '2026-12-15' }));
test('addMonths clamps', () => { expect(addMonths('2027-03-31', -1)).toBe('2027-02-28'); expect(addMonths('2027-05-31', -3)).toBe('2027-02-28'); });
test('week from Monday', () => expect(rangeWindows({ kind: 'week' }, '2026-11-06')).toEqual({ current: { from: '2026-11-02', to: '2026-11-06' }, previous: { from: '2026-10-26', to: '2026-10-30' } }));
test('week on a Monday', () => expect(rangeWindows({ kind: 'week' }, '2026-11-02').previous).toEqual({ from: '2026-10-26', to: '2026-10-26' }));
test('week on a Sunday', () => expect(rangeWindows({ kind: 'week' }, '2026-11-08').current).toEqual({ from: '2026-11-02', to: '2026-11-08' }));
test('custom range compares with the days before', () => expect(rangeWindows({ kind: 'custom', from: '2026-10-01', to: '2026-10-15' }, '2026-11-06').previous).toEqual({ from: '2026-09-16', to: '2026-09-30' }));
test('custom range across new year', () => expect(rangeWindows({ kind: 'custom', from: '2027-01-01', to: '2027-01-10' }, '2027-01-20').previous).toEqual({ from: '2026-12-22', to: '2026-12-31' }));
test('daysIn lists each day', () => expect(daysIn({ from: '2026-10-30', to: '2026-11-02' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']));
```

- [ ] **Step 2: Run** `npx vitest run tests/periods.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `lib/periods.ts` with string and `Date.UTC` arithmetic only. There is no date library.
- [ ] **Step 4: Run** the tests again. Expected: PASS.
- [ ] **Step 5: Commit** with `feat: day keys and date ranges`.

### Task 7: Profit summaries

**Files:**
- Create: `lib/profit.ts`, `tests/profit.test.ts`

**Interfaces:**
- Consumes: `Window`, `inWindow` and `daysIn` from Task 6.
- Produces:
  - `type SaleLine = { day: string; channel: 'etsy'|'store'; productId: string; orderId: string; qty: number; revenue: number; cogs: number; orders?: number }`. All money in this module is USD cents.
  - `type CostLine = { day: string; amount: number; kind: 'expense'|'fee'|'ads'; productId?: string }`. In phase 1, every cost line has kind `expense`.
  - `type Totals = { revenue: number; cogs: number; expenses: number; fees: number; ads: number; profit: number; margin: number | null; units: number; orders: number }`.
  - `summarize(sales: SaleLine[], costs: CostLine[], w: Window): { shop: Totals; byChannel: Record<'etsy'|'store', Totals>; bySku: Record<string, Totals> }`.
  - `type DayPoint = { day: string; profit: number; revenue: number; units: number }` and `dailySeries(sales: SaleLine[], costs: CostLine[], w: Window): DayPoint[]`: one point per day of `daysIn(w)`, including days with no sales. A day's profit is its revenue minus its cost of goods sold and every cost line on that day.

  How it adds up:
  - **Shop:** subtracts every cost.
  - **Channel and SKU:** subtract only fees whose line has a `productId`, and for channels only from `etsy`. Their expenses and ads are 0.
  - **Margin:** `profit / revenue`, or `null` when revenue is 0.
  - **Orders:** count distinct `orderId`s.
  - `historyLines(rows: HistoryRow[], avgCostCents: Record<string, number>, rates: Rates): SaleLine[]`: makes one line per row. It sets `day` to the row's month, `qty` to its units and `revenue` to `toUsdCents(...)`, and `cogs = units × avg`. It sets `orderId` to `` `hist:${month}:${product_id}:${channel}` `` and `orders` to the row's order count, so `summarize` counts that number of orders instead of 1.

- [ ] **Step 1: Write the failing tests** with `w = { from: '2026-11-01', to: '2026-11-30' }`.

```ts
const sale = (o: Partial<SaleLine>): SaleLine => ({ day: '2026-11-05', channel: 'store', productId: 'p1', orderId: 'o1', qty: 1, revenue: 5000, cogs: 2000, ...o });
test('shop profit subtracts all costs', () => {
  const out = summarize([sale({}), sale({ orderId: 'o2', channel: 'etsy', revenue: 6000 })], [{ day: '2026-11-03', amount: 1000, kind: 'expense' }], w);
  expect(out.shop).toMatchObject({ revenue: 11000, cogs: 4000, expenses: 1000, profit: 6000, units: 2, orders: 2 }); expect(out.shop.margin).toBeCloseTo(6000 / 11000);
});
test('sku profit ignores shared expenses', () => expect(summarize([sale({})], [{ day: '2026-11-03', amount: 1000, kind: 'expense' }], w).bySku.p1.profit).toBe(3000));
test('outside window ignored', () => expect(summarize([sale({ day: '2026-10-31' })], [], w).shop.revenue).toBe(0));
test('no revenue gives null margin', () => expect(summarize([], [], w).shop.margin).toBeNull());
test('daily series covers every day and adds up', () => {
  const sales = [sale({ day: '2026-11-02' }), sale({ orderId: 'o2', day: '2026-11-04' })]; const costs = [{ day: '2026-11-03', amount: 1000, kind: 'expense' as const }];
  const days = dailySeries(sales, costs, { from: '2026-11-01', to: '2026-11-04' });
  expect(days.map(p => p.profit)).toEqual([0, 3000, -1000, 3000]);
  expect(days.reduce((a, p) => a + p.profit, 0)).toBe(summarize(sales, costs, { from: '2026-11-01', to: '2026-11-04' }).shop.profit);
});
test('history rows use current average cost and their own order count', () => {
  const lines = historyLines([{ month: '2026-10-01', product_id: 'p1', channel: 'etsy', units: 4, revenue: 20000, currency: 'USD', orders: 3 } as HistoryRow], { p1: 1500 }, {});
  const out = summarize(lines, [], { from: '2026-10-01', to: '2026-10-31' });
  expect(out.shop).toMatchObject({ revenue: 20000, cogs: 6000, units: 4, orders: 3 });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/profit.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `lib/profit.ts`. `SaleLine` has an optional `orders?: number`, and `summarize` counts `orders ?? 1` once per distinct `orderId`.
- [ ] **Step 4: Run** the tests again. Expected: PASS.
- [ ] **Step 5: Commit** with `feat: profit summaries`.

### Task 8: Expiry and low-stock warnings

**Files:**
- Create: `lib/alerts.ts`, `tests/alerts.test.ts`

**Interfaces:**
- Consumes: `addMonths` from Task 6.
- Produces: `type Warning = { productId: string; kind: 'expiry'; level: '3m'|'2m'|'1m'|'expired'; expiryDate: string } | { productId: string; kind: 'low_stock' | 'negative_stock'; stock: number }`.
- Produces: `warnings(items: { productId: string; stock: number; lowStockAt: number; earliestExpiry: string | null }[], today: string): Warning[]`.

  How it decides:
  - **Expiry level:** the strongest that applies. `expired` when today is on or after the expiry date. `1m` when today is on or after `addMonths(expiry, -1)`, then `2m`, then `3m`. Otherwise there's no expiry warning.
  - **Stock:** `negative_stock` when stock is below 0, otherwise `low_stock` when stock is at or below `lowStockAt`.

- [ ] **Step 1: Write the failing tests.**

```ts
const item = (o = {}) => ({ productId: 'p1', stock: 10, lowStockAt: 3, earliestExpiry: '2027-03-31', ...o });
test('3 months', () => expect(warnings([item()], '2026-12-31')).toEqual([{ productId: 'p1', kind: 'expiry', level: '3m', expiryDate: '2027-03-31' }]));
test('day before 3 months: none', () => expect(warnings([item()], '2026-12-30')).toEqual([]));
test('1 month uses clamped date', () => expect(warnings([item()], '2027-02-28')[0]).toMatchObject({ level: '1m' }));
test('expired', () => expect(warnings([item()], '2027-03-31')[0]).toMatchObject({ level: 'expired' }));
test('low stock at threshold', () => expect(warnings([item({ stock: 3, earliestExpiry: null })], '2026-11-06')).toEqual([{ productId: 'p1', kind: 'low_stock', stock: 3 }]));
test('negative stock', () => expect(warnings([item({ stock: -1, earliestExpiry: null })], '2026-11-06')[0]).toMatchObject({ kind: 'negative_stock' }));
```

- [ ] **Step 2: Run** `npx vitest run tests/alerts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `warnings`.
- [ ] **Step 4: Run** the tests again. Expected: PASS.
- [ ] **Step 5: Commit** with `feat: expiry and stock warnings`.

### Task 9: Form parsing

**Files:**
- Create: `lib/forms.ts`, `tests/forms.test.ts`

**Interfaces:**
- Consumes: `Range` from Task 6.
- Produces `type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }` and these parsers, each taking `FormData`:
  - `parseSale(f)`: requires `id` (uuid), `channel` (etsy/store), `product_id` and `qty` (an integer of at least 1). `price` is a USD amount like `"12.50"`, converted to cents, and must be 0 or more. `sold_on` is an optional day key, defaulting to `null`, which the caller turns into now.
  - `parseShipment(f)`: requires `received_on` and `freight` with `freight_currency`, plus repeated `line_product_id[]`, `line_units[]`, `line_vendor[]`, `line_vendor_currency[]` and `line_expiry[]`. There must be at least one line, and units must be at least 1.
  - `parseCorrection(f)`: requires `product_id`, a non-zero integer `delta` and a non-empty `reason`.
  - `parseExpense(f)`: requires `spent_on`, `category` (packaging/gift), and `amount` above 0 with `currency`.
  - `parseHistory(f)`: requires `month` (`YYYY-MM`), `product_id`, `channel`, and `units`, `revenue` and `orders`, each 0 or more.
  - `parseProduct(f)`: requires `sku`, `name`, `grams` above 0, `packaging` (can/bag) and `store_price`. `details`, `etsy_listing_id` and `low_stock_at` (default 3) are optional.
  - `parseRange(q: { range?: string; from?: string; to?: string }): Range` reads the dashboard's query string. Anything invalid, including `from` after `to` or a custom range over 366 days, falls back to `{ kind: 'month' }`.

  Amount rules: USD amounts are parsed from decimal text into cents, with at most 2 decimals. VND amounts are whole numbers. Commas and spaces are stripped. Error text is one short sentence naming the field, such as `"Quantity must be 1 or more."`

- [ ] **Step 1: Write the failing tests**, each building a `FormData` from an object.

```ts
test('valid store sale', () => expect(parseSale(fd({ id: uuid, channel: 'store', product_id: 'p1', qty: '2', price: '12.50' }))).toEqual({ ok: true, value: { id: uuid, channel: 'store', product_id: 'p1', qty: 2, unit_price: 1250, sold_on: null } }));
test('quantity 0 rejected', () => expect(parseSale(fd({ id: uuid, channel: 'store', product_id: 'p1', qty: '0', price: '1' }))).toEqual({ ok: false, error: 'Quantity must be 1 or more.' }));
test('3 decimals rejected', () => expect(parseSale(fd({ id: uuid, channel: 'store', product_id: 'p1', qty: '1', price: '1.234' })).ok).toBe(false));
test('VND with separators', () => expect(parseExpense(fd({ spent_on: '2026-11-06', category: 'gift', amount: '1,250,000', currency: 'VND' }))).toMatchObject({ ok: true, value: { amount: 1250000 } }));
test('correction needs reason', () => expect(parseCorrection(fd({ product_id: 'p1', delta: '-1', reason: ' ' })).ok).toBe(false));
test('shipment needs a line', () => expect(parseShipment(fd({ received_on: '2026-11-06', freight: '100', freight_currency: 'USD' })).ok).toBe(false));
test('custom range parsed', () => expect(parseRange({ range: 'custom', from: '2026-10-01', to: '2026-10-15' })).toEqual({ kind: 'custom', from: '2026-10-01', to: '2026-10-15' }));
test('backwards range falls back to month', () => expect(parseRange({ range: 'custom', from: '2026-11-10', to: '2026-11-01' })).toEqual({ kind: 'month' }));
test('unknown range falls back to month', () => expect(parseRange({ range: 'year' })).toEqual({ kind: 'month' }));
```

- [ ] **Step 2: Run** `npx vitest run tests/forms.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the parsers.
- [ ] **Step 4: Run** the tests again. Expected: PASS.
- [ ] **Step 5: Commit** with `feat: form parsing`.

### Task 10: Data layer

**Files:**
- Create: `lib/data.ts`, `tests/data.test.ts`

**Interfaces:**
- Consumes: `sql` (Task 2), the row types (Task 3), `allocateFreight` (Task 4), and the parsed values (Task 9).
- Produces `type Snapshot = { products: Product[]; shipments: Shipment[]; lines: ShipmentLine[]; sales: Sale[]; moves: StockMove[]; expenses: Expense[]; history: HistoryRow[]; expiry: ExpiryDate[]; rates: Rates; timeZone: string | null }` and:
  - `loadSnapshot(): Promise<Snapshot>`: one `select *` per table, run in parallel.
  - `stockOf(moves: StockMove[], productId: string): number`, a pure sum.
  - Each of these writes runs as one `sql.transaction([...])`:
    - `saveSale(v, now: Date)`: inserts the sale (currency `'USD'`) with `on conflict (id) do nothing`, plus a stock move (`kind 'sale'`, `ref = id`, `qty_delta = -qty`, `at = sold_at`) with `on conflict (kind, ref) do nothing`. `sold_at` is `now`, or noon UTC on `sold_on`.
    - `deleteSale(id)`: deletes the move, then the sale.
    - `saveShipment(v)`: inserts the shipment, its lines, one move per line (`kind 'shipment'`, `ref = line id`, `at = received_on`), and expiry dates with `on conflict do nothing`.
    - `deleteShipment(id)`: deletes the moves whose ref is in its line ids, then the shipment. The lines go with it through the cascade.
    - `saveCorrection(v, now)`: `ref` is a new uuid.
    - `saveExpense(v)` and `deleteExpense(id)`.
    - `saveHistory(v)`: upserts on `(month, product_id, channel)`. `deleteHistory(id)` deletes a row.
    - `saveProduct(v, id?)`: inserts, or updates when `id` is given.
    - `setRate(year, vndPerUsd)`, `setTimeZone(tz)` and `clearExpiry(id)`.
  - After any write that creates moves, the same transaction ends with `update expiry_dates set cleared_at = now() where cleared_at is null and product_id in (select product_id from stock_moves group by product_id having sum(qty_delta) <= 0)`.

- [ ] **Step 1: Write the failing integration tests.** They run only when `TEST_DATABASE_URL` is set (`describe.skipIf(!process.env.TEST_DATABASE_URL)`), point `DATABASE_URL` at it, and truncate every table in `beforeEach`.

```ts
test('same sale id twice records one sale', async () => { await saveSale(sale, now); await saveSale(sale, now); const s = await loadSnapshot(); expect(s.sales).toHaveLength(1); expect(stockOf(s.moves, p)).toBe(10 - 2); });
test('deleting a sale restores stock', async () => { await saveSale(sale, now); await deleteSale(sale.id); expect(stockOf((await loadSnapshot()).moves, p)).toBe(10); });
test('deleting a shipment removes its stock', async () => { const id = await saveShipment(ship2); await deleteShipment(id); expect(stockOf((await loadSnapshot()).moves, p)).toBe(10); });
test('expiry clears when stock reaches zero', async () => { await saveSale({ ...sale, qty: 10 }, now); expect((await loadSnapshot()).expiry.every(e => e.cleared_at)).toBe(true); });
test('selling past zero is allowed', async () => { await saveSale({ ...sale, qty: 12 }, now); expect(stockOf((await loadSnapshot()).moves, p)).toBe(-2); });
```

  Each test's setup creates one product and a 10-unit shipment.
- [ ] **Step 2: Run** `TEST_DATABASE_URL=… npx vitest run tests/data.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `lib/data.ts`. `saveShipment` returns the shipment id and computes no costs, because costs are derived at report time.
- [ ] **Step 4: Run** the tests again. Expected: PASS. Then run `npx vitest run` without the variable. Expected: data tests skipped, everything else passing.
- [ ] **Step 5: Commit** with `feat: data layer`.

### Task 11: Dashboard calculations

**Files:**
- Create: `lib/report.ts`, `tests/report.test.ts`

**Interfaces:**
- Consumes: `Snapshot` and `stockOf` (Task 10), `toUsdCents` and `MissingRateError` (Task 3), `allocateFreight` (4), `replayCost` and `CostEvent` (5), `dayKey`, `rangeWindows` and `Range` (6), `summarize`, `historyLines`, `dailySeries` and `DayPoint` (7), and `warnings` (8).
- Produces `buildDashboard(s: Snapshot, now: Date, range: Range): Dashboard`, with `Dashboard` as one of:
  - `{ status: 'needs_time_zone' }`
  - `{ status: 'missing_rate'; year: number }`
  - `{ status: 'ok'; today: string; windows: { current: Window; previous: Window }; current: Summary & { approximate: boolean }; previous: Summary & { approximate: boolean }; series: { current: DayPoint[]; previous: DayPoint[] }; stock: { productId: string; stock: number; avgCostCents: number; earliestExpiry: string | null }[]; warnings: Warning[] }`

  `Summary` is the return type of `summarize`.

  How it builds the figures:
  1. **Landed cost:** each shipment line costs `toUsdCents(vendor) + toUsdCents(its allocateFreight share)` at the shipment's year.
  2. **Cost events:** each line gives a `receive` event, each sale move a `sale` event (keyed by the sale id) and each correction an `adjust` event. `replayCost` runs per product.
  3. **Sale lines:** each sale becomes a `SaleLine`, with `day = dayKey(sold_at, tz)`, `orderId = etsy_receipt_id ?? id`, revenue `qty × unit_price` converted at its year, and cost from the replay.
  4. **Expenses:** each becomes a `CostLine` of kind `expense`.
  5. **History:** a month with `history` rows uses only those rows, and its live sales are dropped so nothing counts twice. A window that touches such a month includes that month's whole total (as lines dated `window.from`) and sets `approximate: true` on that side. The daily series leaves history out.
  6. **Errors:** a `MissingRateError` anywhere returns `missing_rate`.

- [ ] **Step 1: Write the failing tests** with a fixture snapshot: one product of 100g, and one 10-unit shipment on `'2026-10-01'` with a USD 10000 vendor amount and USD 2000 freight. Add a store sale of 2 at 5000 on `2026-11-05T15:00:00Z` and one on `2026-10-05T15:00:00Z`, with `tz = 'America/New_York'`, `now = 2026-11-10T12:00:00Z` and `month = { kind: 'month' }`.

```ts
test('needs time zone', () => expect(buildDashboard({ ...snap, timeZone: null }, now, month)).toEqual({ status: 'needs_time_zone' }));
test('current month figures', () => expect((buildDashboard(snap, now, month) as any).current.shop).toMatchObject({ revenue: 10000, cogs: 2400, profit: 7600, units: 2 }));
test('same days last month', () => expect((buildDashboard(snap, now, month) as any).previous).toMatchObject({ approximate: false, shop: { revenue: 10000 } }));
test('VND without a rate names the year', () => expect(buildDashboard({ ...snap, expenses: [{ ...exp, currency: 'VND', spent_on: '2026-11-02' }], rates: {} }, now, month)).toEqual({ status: 'missing_rate', year: 2026 }));
test('history replaces last month and is marked approximate', () => expect((buildDashboard({ ...snap, history: [hist('2026-10-01', 4, 20000, 3)] }, now, month) as any).previous).toMatchObject({ approximate: true, shop: { revenue: 20000, orders: 3 } }));
test('stock and warnings', () => { const d = buildDashboard({ ...snap, sales: [...snap.sales, bigSale(8)] }, now, month) as any; expect(d.stock[0].stock).toBe(-2); expect(d.warnings).toContainEqual({ productId: 'p1', kind: 'negative_stock', stock: -2 }); });
test('week range and daily series', () => { const d = buildDashboard(snap, now, { kind: 'week' }) as any; expect(d.windows.current).toEqual({ from: '2026-11-09', to: '2026-11-10' }); expect(d.series.current).toHaveLength(2); });
```

- [ ] **Step 2: Run** `npx vitest run tests/report.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `buildDashboard`.
- [ ] **Step 4: Run** the full suite with `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat: dashboard calculations`.

### Task 12: Phone sale screen

**Files:**
- Create: `app/[key]/sale/page.tsx`, `app/[key]/actions.ts` (with `recordSale`)
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `requireKey`, `loadSnapshot`, `stockOf`, `parseSale`, `saveSale` and `formatUsd`.
- Produces: `recordSale(key: string, prev: { error?: string; saved?: string } | null, f: FormData)`. It's a server action for `useActionState`, and it returns `{ saved: '<sku> × <qty>' }` or `{ error }`, then calls `revalidatePath`.

- [ ] **Step 1: Build the page.**
  - **Layout:** one large button per active product, showing name, size and stock left. Tapping one selects it as a radio input styled as a button.
  - **Fields:** a quantity stepper (default 1) and a price field prefilled with the product's `store_price` and editable. A channel toggle defaults to Store, with Etsy as the other option.
  - **Saving:** a hidden `id` holds `crypto.randomUUID()` from render. Use `useActionState` with a small client component. After a save, show "Saved: …" and give the form a new `id`.
  - **Styling:** no sideways scroll at 375px, and tap targets of at least 48px.
- [ ] **Step 2: Verify in a phone-width browser.**
  - **Basic save:** record a sale. Expected: the success line appears, and stock on the button drops by the quantity.
  - **Double-tap:** tap Save twice quickly. Expected: one new sale in Neon (`select count(*) from sales`).
  - **Validation:** enter quantity 0. Expected: "Quantity must be 1 or more." with nothing saved.
- [ ] **Step 3: Commit** with `feat: phone sale screen`.

### Task 13: Settings: products, rates and time zone

**Files:**
- Create: `app/[key]/settings/page.tsx`
- Modify: `app/[key]/actions.ts` (add `saveProductAction`, `setRateAction` and `setTimeZoneAction`)

**Interfaces:**
- Consumes: `parseProduct`, `saveProduct`, `setRate` and `setTimeZone`.

- [ ] **Step 1: Build the page.**
  - **Products:** a table with an edit form per row, plus an empty "Add product" row.
  - **Rates:** a list of yearly rates, with a form taking year and VND per USD.
  - **Time zone:** a select of US zones (`America/New_York`, `America/Chicago`, `America/Denver`, `America/Phoenix`, `America/Los_Angeles`, `America/Anchorage`, `Pacific/Honolulu`).
  - **Export:** a link to `/{key}/export`.
- [ ] **Step 2: Verify.**
  - **Products:** add 5 products. Expected: they appear on the sale screen.
  - **Rate:** set the 2026 rate. Expected: it's listed.
  - **Time zone:** set it. Expected: the dashboard stops asking for it.
- [ ] **Step 3: Commit** with `feat: settings`.

### Task 14: Shipments and stock screens

**Files:**
- Create: `app/[key]/shipments/page.tsx`, `app/[key]/stock/page.tsx`
- Modify: `app/[key]/actions.ts` (add `saveShipmentAction`, `deleteShipmentAction`, `saveCorrectionAction` and `clearExpiryAction`)

**Interfaces:**
- Consumes: `parseShipment`, `saveShipment`, `deleteShipment`, `parseCorrection`, `saveCorrection`, `clearExpiry`, and `buildDashboard(...).stock` for counts and average costs.

- [ ] **Step 1: Build the shipments page.** It lists past shipments, each with a delete button that asks for confirmation first. The new-shipment form has received date, freight amount and currency, and 5 line rows, one per product. Rows with blank units are dropped before parsing.
- [ ] **Step 2: Build the stock page.**
  - **Per SKU:** stock, average cost and expiry dates on hand, each date with a "Clear" button.
  - **Correction form:** product, change (+/−) and a required reason.
  - **History:** the moves list per SKU, newest first, showing kind, change, reason and date.
- [ ] **Step 3: Verify.**
  - **New shipment:** record one with two products. Expected: stock rises by the units, and the average cost matches a hand calculation using the weight split.
  - **Delete:** delete the shipment. Expected: stock goes back.
  - **Correction:** record −1 with the reason "damaged". Expected: it shows in the history.
- [ ] **Step 4: Commit** with `feat: shipments and stock`.

### Task 15: Sales, expenses and past totals screen

**Files:**
- Create: `app/[key]/sales/page.tsx`
- Modify: `app/[key]/actions.ts` (add `deleteSaleAction`, `saveExpenseAction`, `deleteExpenseAction`, `saveHistoryAction` and `deleteHistoryAction`)

- [ ] **Step 1: Build the page.** It has three sections, and each delete asks for confirmation:
  - **Sales:** newest first, with channel, product, quantity, price, day and a delete button.
  - **Expenses:** a form and list, with delete.
  - **Past monthly totals:** a form (month, product, channel, units, revenue with currency, orders) and a list, with delete.
- [ ] **Step 2: Verify.**
  - **Delete a sale:** expected, stock goes back up.
  - **Add an expense:** expected, this month's profit on the dashboard drops by the expense amount.
  - **Add last month's totals:** expected, the dashboard's previous column is marked approximate.
- [ ] **Step 3: Commit** with `feat: sales, expenses and past totals`.

### Task 16: Dashboard page

**Files:**
- Modify: `app/[key]/page.tsx`
- Create: `app/[key]/Chart.tsx`

**Interfaces:**
- Consumes: `buildDashboard` (Task 11), `parseRange` (Task 9), `formatUsd`, `formatVnd` and `usdCentsToVnd`.

- [ ] **Step 1: Build the page**, rendering each `buildDashboard` status:
  - **needs_time_zone:** a link to Settings.
  - **missing_rate:** "Add the {year} exchange rate in Settings to see reports."
  - **ok:**
    - **Filter row:** above everything, links for This week, This month and Custom set `?range=week|month|custom`. Custom shows `from` and `to` date inputs and an Apply button. `parseRange` reads the query, and every section uses the same windows.
    - **Chart (`Chart.tsx`, a client component):** takes both `series` arrays. A Profit / Revenue / Units sold switch picks one measure, so there's one y-axis. The current period is a 2px solid `#2a78d6` line and the previous a 2px dashed `#8A918A` line, aligned by day and labeled at their ends. Hovering or focusing a day shows a hairline and one tooltip with both values, value first. "Show as table" lists the same points. It's plain SVG with `vector-effect: non-scaling-stroke`.
    - **Headline:** profit (USD and VND), then margin, revenue, units and orders, for the selected range next to the previous period. The previous column is labeled with its dates, such as "26–30 Oct", and says "approximate" when that side uses past monthly totals.
    - **Splits:** tables for Etsy vs store and by SKU.
    - **Warnings:** listed in plain words, such as "Matcha 30g bag: expires 31 Mar 2027 (1 month)", "Only 3 left" and "Stock is −2, so check the count".
    - **VND:** converted with the rate for `today`'s year.
- [ ] **Step 2: Verify** against the Task 11 fixture numbers, entered through the screens. Expected: revenue $100.00, cost of goods sold $24.00 and profit $76.00, with VND matching the rate × USD. Then switch to This week and to a custom range of 1–15 Oct. Expected: every number and the chart change together. A custom range with `from` after `to` shows the month instead.
- [ ] **Step 3: Commit** with `feat: dashboard`.

### Task 17: Export

**Files:**
- Create: `app/[key]/export/route.ts`

- [ ] **Step 1: Implement `GET`.** It calls `requireKey(params.key)`, then returns `loadSnapshot()` as JSON with `Content-Disposition: attachment; filename="matcha-export-<today>.json"`.
- [ ] **Step 2: Verify.** Download the export. Expected: it contains every table, with your rows. With a wrong key, the URL returns 404.
- [ ] **Step 3: Commit** with `feat: data export`.

### Task 18: Deploy and phone test

**Before this task:** you create a free Vercel account and connect this project. That needs a GitHub repository, or the Vercel CLI (`npx vercel`).

- [ ] **Step 1: Configure.** Set `APP_KEY` (generate it with `openssl rand -base64 32 | tr -d '/+='`) and `DATABASE_URL` (Neon `main`) in Vercel's production environment, then deploy.
- [ ] **Step 2: Check the deployment.**
  - **Link:** `https://<app>.vercel.app/<APP_KEY>` loads, while `/` and `/wrong` return 404, and `curl -I` shows both headers.
  - **Tests:** `npx vitest run` passes locally, including the data tests against the `test` branch.
- [ ] **Step 3: Phone test.** Your friend opens the link on their phone and records a real store sale unaided. Expected: the sale shows on the dashboard. Time it against the 15-second target (FR-06), and note anything confusing as a follow-up.
- [ ] **Step 4: Commit** any fixes, and tag the release with `git tag phase-1`.
