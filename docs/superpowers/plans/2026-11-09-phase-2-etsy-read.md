# Phase 2 Etsy Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the app to Etsy read-only, so Etsy sales lower stock on their own, Etsy fees and ads land in profit, and a daily check flags SKUs whose Etsy quantity differs from app stock.

**Architecture:**
- **Etsy client:** `lib/etsy/client.ts` holds the OAuth flow and a `fetch` wrapper.
- **Pure mapping:** `lib/etsy/map.ts` turns receipts, ledger entries and listings into rows and issues. `lib/etsy/webhook.ts` checks signatures. Both are fully unit-tested.
- **Database writes:** `lib/etsy/sync.ts` does all the writes, idempotent by unique keys, and is tested on the Neon `test` branch.
- **Entry points:** three route handlers outside `[key]`: OAuth callback, webhook, and daily cron. Two of them are checked by their own secret, and the callback by a one-time `state`.
- **Screens:** Settings, the dashboard and the sale screen gain small additions.

**Tech Stack:** unchanged from phase 1: Next.js 16 App Router, `@neondatabase/serverless`, Vitest. Etsy is called with plain `fetch`, and `node:crypto` covers PKCE, HMAC and the derived ids.

**Spec:** `docs/superpowers/specs/2026-11-06-matcha-stock-profit-app-design.md`, amended on 9 November 2026 (scopes, phase merge, listing picker). Requirements: `REQUIREMENTS.md`, FR-05, FR-09 and FR-12. Etsy facts: Etsy's OpenAPI file (`https://www.etsy.com/openapi/generated/oas/3.0.0.json`) and the authentication and webhooks pages, read on 9 November 2026.

**Branch:** `phase-2`, already created from `main`. The user pushes; never run `git push`.

## Global Constraints

- **Phase 1 constraints still hold:** see `docs/superpowers/plans/2026-11-06-phase-1-core-app.md`, Global Constraints. In particular:
  - Every server action starts with `requireKey(key)`.
  - Money is integer cents.
  - Stock is the sum of `stock_moves`.
  - No new dependencies.
- **Read-only Etsy:** the only Etsy requests are `GET`s, plus the token `POST`. Scopes are exactly `transactions_r listings_r shops_r`.
- **Headers on every Etsy call:**
  - `x-api-key: ${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`, with a colon.
  - `Authorization: Bearer ${access_token}`.
- **Environment variables:**
  - `ETSY_API_KEY` and `ETSY_SHARED_SECRET`: the Etsy app's keystring and shared secret.
  - `ETSY_REDIRECT_URI`: `https://lemon-umai-inventory.vercel.app/etsy/callback`.
  - `ETSY_WEBHOOK_SECRET`: the `whsec_…` secret.
  - `CRON_SECRET`.
  - Secrets never reach the browser or logs.
- **Tokens:**
  - The access token lives 3600 s; refresh it when fewer than 60 s remain.
  - The refresh token lives 90 days, and every refresh returns a new one. Save it.
- **Webhook signature:**
  - Signed content is `webhook-id.webhook-timestamp.raw_body`.
  - Key: base64-decode the secret after stripping `whsec_`, then HMAC-SHA256 and base64.
  - `webhook-signature` holds space-separated `v1,<sig>` entries.
  - Reject when `|now − timestamp| > 300` s.
- **Cut-off (spec §6):** Etsy transactions paid before `settings.etsy_connected_at` are never imported. Reconnecting keeps the first `etsy_connected_at`.
- **Copy:** dashboard and Settings text is plain and short, like phase 1. Never write "sync failed" without saying what to do.
- **Do not build:** cancellations or refunds (FR-10), any Etsy write (FR-07, FR-08), Telegram, a product import, or webhook registration through the API (none exists; the user registers it in the portal).

## Review Focus

1. **One order arriving twice:** the same order can arrive by webhook and again by catch-up, or by two webhook retries. It must give exactly one sale and one stock move per transaction. *Test: Task 4, `importReceipt twice records once`.*
2. **Sales entered by hand before connecting:** these sit next to the same orders on Etsy. Nothing paid before `etsy_connected_at` is imported. *Test: Task 3, `skips transactions paid before connection`.*
3. **Refreshing at the same moment:** the webhook and the cron may both refresh. The loser of a compare-and-set must reuse the winner's token, not mark Etsy disconnected. *Test: Task 2, `concurrent refresh reuses the saved token`.*
4. **Revoked access or Etsy down:** pages still load. The dashboard shows "Reconnect Etsy" or the error issue, and the sale screen offers the Etsy channel again. *Test: Task 2, `invalid_grant marks reconnect`; Task 7, the manual check.*
5. **A fee refund:** a positive ledger amount on a fee type lowers fees instead of raising them. *Test: Task 3, `fee refund reduces fees`.*

---

### Task 1: Schema

**Files:**
- Modify: `db/schema.sql` (append only; it must stay rerunnable)
- Modify: `lib/types.ts`

**Interfaces:**
- **Produces, new tables:**
  - `etsy_ledger(entry_id text primary key, at timestamptz, ledger_type text, reference_type text, reference_id text, amount bigint, currency text, category text check in ('fee','ads','ignore','uncategorized'), product_id uuid null references products, raw jsonb)`.
  - `sync_issues(id uuid pk default gen_random_uuid(), kind text check in ('mismatch','unknown_listing','etsy_error'), ref text, detail text, created_at timestamptz default now(), resolved_at timestamptz, unique (kind, ref))`.
  - `webhook_events(webhook_id text primary key, received_at timestamptz default now())`.
- **Produces, new columns:**
  - `sales.discount bigint not null default 0 check (discount >= 0)`, in cents, for the whole line.
  - On `settings`, all nullable: `etsy_shop_id text`, `etsy_user_id text`, `etsy_access_token text`, `etsy_refresh_token text`, `etsy_expires_at timestamptz`, `etsy_connected_at timestamptz`, `etsy_status text check in ('connected','reconnect')`, `etsy_oauth_state text`, `etsy_code_verifier text`, `etsy_oauth_started_at timestamptz`.
- **Produces, types:**
  - `Sale` gains `discount: number`.
  - New `LedgerRow = { entry_id; at; category: 'fee'|'ads'|'ignore'|'uncategorized'; amount: number; currency: Currency; product_id: string|null; ledger_type: string }`.
  - New `SyncIssue = { id; kind; ref; detail; created_at }`.

- [ ] **Step 1:** Append the statements above to `db/schema.sql`. Use `create table if not exists` and `alter table … add column if not exists`, with no semicolons inside strings, because `migrate.mjs` splits on `;`.
- [ ] **Step 2:** Run `node --env-file=.env.local -e "process.env.DATABASE_URL=process.env.TEST_DATABASE_URL" scripts/migrate.mjs`. If that form doesn't override the variable, run `DATABASE_URL=… node scripts/migrate.mjs` with the test URL read from `.env.local`, without printing it. Expected: `Ran N statements.` Run it twice; the second run must also succeed.
- [ ] **Step 3:** Update `lib/types.ts`. Run `npx tsc --noEmit`. Expected: no errors. Fix test fixtures that build `Sale` objects by adding `discount: 0`.
- [ ] **Step 4:** Commit `feat: phase 2 schema`.

### Task 2: Etsy client and tokens

**Files:**
- Create: `lib/etsy/client.ts`
- Test: `tests/etsy-client.test.ts`

**Interfaces:**
- **Consumes:** `sql` from `lib/db.ts`, and the Task 1 settings columns.
- **Produces:**
  - `pkce(): { verifier: string; challenge: string }`: a 32-byte base64url verifier, and a challenge that is base64url(sha256(verifier)).
  - `authorizeUrl(state: string, challenge: string): string`: `https://www.etsy.com/oauth/connect` with `response_type=code`, `client_id`, `redirect_uri`, `scope=transactions_r listings_r shops_r`, `state`, `code_challenge` and `code_challenge_method=S256`.
  - `exchangeCode(code: string, verifier: string): Promise<Tokens>`: `POST https://api.etsy.com/v3/public/oauth/token`, form-encoded, with `grant_type=authorization_code`, `client_id`, `redirect_uri`, `code` and `code_verifier`.
  - `type Tokens = { access_token: string; refresh_token: string; expires_in: number }`.
  - `getAccessToken(now: Date, f?: typeof fetch): Promise<string>`: returns the stored token while it has at least 60 s left. Otherwise it refreshes with `grant_type=refresh_token`. The save is a compare-and-set: `update settings set … where etsy_refresh_token = <old>`.
    - **0 rows updated:** another process refreshed first. Reread and return the stored token.
    - **400 `invalid_grant`:** set `etsy_status='reconnect'` and throw `EtsyAuthError`.
  - `etsyGet<T>(path: string, query: Record<string,string|number|boolean>, f?: typeof fetch): Promise<T>`: base `https://api.etsy.com/v3/application`, with both headers from Global Constraints.
    - **On 429:** wait `retry-after` seconds (capped at 10) and retry once.
    - **Any other non-2xx:** throw `EtsyError(status, path)`.
  - `class EtsyError extends Error { status: number }` and `class EtsyAuthError extends Error`.

- [ ] **Step 1: Write the failing tests.** Inject `fetch`; no network. For `getAccessToken`, use the Neon test branch, wrapped in `describe.skipIf(!TEST_DATABASE_URL)` with the same production guard as `tests/data.test.ts`.
  - `sends x-api-key as key:secret and a bearer token`
  - `retries once after 429 then throws EtsyError`
  - `pkce challenge is base64url sha256 of verifier`: check against a known vector computed with `node:crypto` in the test.
  - `authorizeUrl has the three read scopes and S256`
  - `refreshes when under 60 seconds left and saves the new refresh token`
  - `concurrent refresh reuses the saved token`: change `etsy_refresh_token` in the database between the fake fetch's response and the save. The function returns the token now stored.
  - `invalid_grant marks reconnect`: after the call, `etsy_status` is `'reconnect'` and the call throws `EtsyAuthError`.
- [ ] **Step 2:** Run `npx vitest run tests/etsy-client.test.ts`. Expected: FAIL, because the module doesn't exist yet.
- [ ] **Step 3:** Implement `lib/etsy/client.ts`.
- [ ] **Step 4:** Run the tests again with `node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/etsy-client.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: Etsy client with PKCE, token refresh and read-only GET`.

### Task 3: Pure mapping

**Files:**
- Create: `lib/etsy/map.ts`
- Test: `tests/etsy-map.test.ts`

**Interfaces:**
- **Produces:**
  - `saleIdFor(transactionId: string): string`: a UUID-formatted string taken from the first 32 hex digits of sha256(`etsy-transaction:` + id). It is deterministic, so a repeat import collides on `sales.id` and on the stock move `ref`.
  - `receiptToSales(receipt: EtsyReceipt, productByListing: Map<string,string>, connectedAt: Date): { sales: EtsySaleRow[]; issues: IssueRow[] }`. For each transaction:
    - **Paid before `connectedAt`:** skip it. Use `paid_timestamp`, falling back to the receipt's `created_timestamp`.
    - **Listing not in the map:** add issue `{kind:'unknown_listing', ref: transaction_id, detail: "Etsy listing <listing_id> (<title>) isn't linked to a product. Link it in Settings."}`.
    - **`price.currency_code !== 'USD'`:** add issue `etsy_error` with ref `currency:<transaction_id>`.
    - **Otherwise:** add a row:
      - `id = saleIdFor(transaction_id)` and `sold_at` = the paid time.
      - `qty = quantity` and `unit_price = round(price.amount * 100 / price.divisor)`.
      - `discount = round((shop_coupon + buyer_coupon) * 100)`.
      - `etsy_receipt_id` and `etsy_transaction_id`.
  - `type EtsySaleRow = { id; product_id; sold_at: string; qty; unit_price; discount; etsy_receipt_id; etsy_transaction_id }` and `type IssueRow = { kind; ref; detail }`.
  - `categorize(ledgerType: string): 'fee'|'ads'|'ignore'|'uncategorized'`. Compare in lower case. The starting map is below; anything else is `uncategorized`. It is a best guess until Task 7 checks it against real data:
    - **fee:** `listing`, `transaction`, `transaction_quantity`, `renew_sold`, `renew_sold_auto`, `renew_expired`, `payment_processing_fee`, `processing_fee`, `vat_seller_services`.
    - **ads:** `prolist`, `offsite_ads_fee`, `etsy_ads`.
    - **ignore:** `payment`, `sale`, `disbursement`, `disburse`, `disburse2`, `refund`, `shipping_label`, `shipping_labels`, `sales_tax`, `tax`.
  - `ledgerToRow(e: EtsyLedgerEntry, link: { byTransaction: Map<string,string>; byListing: Map<string,string>; byReceipt: Map<string,string[]> }): LedgerRow`:
    - `amount`: the entry's own value. Fees are negative.
    - `at`: from `created_timestamp`.
    - `category`: from `categorize`.
    - `product_id`: set only for `fee`, from `reference_type`:
      - `transaction` → `byTransaction`.
      - `listing` → `byListing`.
      - `receipt` → set only when every sale in that receipt is one product.
      - Otherwise null.
  - `mismatches(products: {id; sku; etsy_listing_id: string|null; stock: number}[], listings: {listing_id: number; quantity: number; has_variations: boolean; title: string}[]): IssueRow[]`, with `kind:'mismatch'` and `ref = product id`. Products without a listing id are skipped. One issue for each of these:
    - **Listing not among active listings and app stock > 0:** `detail "<SKU>: listing isn't active on Etsy, app has <n>"`.
    - **`has_variations`:** `"<SKU>: Etsy listing has variations; the check can't compare it"`.
    - **Two products share one listing:** `"<SKUs> share Etsy listing <id>"`.
    - **Quantities differ:** `"<SKU>: Etsy <q>, app <n>"`.
  - **Etsy types:** declare `EtsyReceipt`, `EtsyTransaction`, `EtsyLedgerEntry` and `EtsyListing` with only the fields used. The names come from the OpenAPI file: `receipt_id`, `created_timestamp`, `transactions[]`, `transaction_id`, `listing_id`, `title`, `quantity`, `price{amount,divisor,currency_code}`, `paid_timestamp`, `shop_coupon`, `buyer_coupon`; `entry_id`, `ledger_type`, `reference_type`, `reference_id`, `amount`, `currency`, `created_timestamp`; `listing_id`, `quantity`, `has_variations`, `title`, `state`.

- [ ] **Step 1: Write the failing tests:**
  - `unit price is amount*100/divisor`: amount 2400 with divisor 100 gives 2400 cents. Amount 24 with divisor 1 also gives 2400.
  - `discount sums shop and buyer coupon`: 2.5 and 1 give 350.
  - `skips transactions paid before connection`
  - `unknown listing becomes an issue and no sale`
  - `saleIdFor is stable and uuid-shaped`
  - `categorize is case-insensitive and unknown is uncategorized`
  - `fee refund reduces fees`: a positive amount on `transaction` stays positive and its category is `fee`.
  - `links fee to product by transaction, listing, and single-product receipt only`
  - `ads never get a product`
  - `mismatch cases`: the four details above, plus no issue when the quantities are equal.
- [ ] **Step 2:** Run `npx vitest run tests/etsy-map.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the functions.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: map Etsy receipts, ledger entries and listings`.

### Task 4: Sync writes

**Files:**
- Create: `lib/etsy/sync.ts`
- Test: `tests/etsy-sync.test.ts` (test branch, with the production guard)

**Interfaces:**
- **Consumes:** Task 2's `etsyGet`, `getAccessToken`, `EtsyAuthError`; Task 3's functions; `clearExpiries` from `lib/data.ts` (export it).
- **Produces:**
  - `importReceipt(receipt: EtsyReceipt): Promise<number>`: returns the number of new sales. Everything happens in one `sql.transaction`:
    - Insert each sale `on conflict (id) do nothing`.
    - Insert stock move `kind 'sale'`, `ref = sale id`, `qty_delta = -qty`, `on conflict (kind, ref) do nothing`.
    - Run `clearExpiries()`.
    - Upsert issues `on conflict (kind, ref) do nothing`.
    - Resolve any open `unknown_listing` issue whose ref is a transaction that was just recorded.
  - `catchUp(now: Date): Promise<number>`: `GET /shops/{shop_id}/receipts`:
    - **Query:** `was_paid=true`, `min_created = max(now − 7 d, etsy_connected_at − 1 d)` in epoch seconds, `limit=100`, paging by `offset`.
    - Calls `importReceipt` for each receipt.
  - `importLedger(now: Date): Promise<number>`: `GET /shops/{shop_id}/payment-account/ledger-entries`.
    - **Window:** from (latest `etsy_ledger.at` − 2 d), or from 1 January of `etsy_connected_at`'s year when the table is empty, up to `now`.
    - Splits the window into ≤ 30-day chunks with `limit=100` and offset paging.
    - Inserts rows `on conflict (entry_id) do nothing`.
  - `checkMismatches(): Promise<number>`: one `GET /shops/{shop_id}/listings?state=active&limit=100`.
    - Upserts the current mismatch issues, setting `resolved_at = null` and refreshing `detail`.
    - Sets `resolved_at = now()` on open mismatch issues no longer in the set.
  - `listActiveListings(): Promise<EtsyListing[]>`: the same call, for the Settings picker.
  - `runDaily(now: Date): Promise<string[]>`: runs `getAccessToken`, `catchUp`, `importLedger` and `checkMismatches` in that order.
    - Each step has its own try/catch, and a failure upserts `etsy_error` with `ref = step name` and a detail of `<step>: <message>. It will retry tomorrow, or press Sync now in Settings.`
    - A successful step resolves its own open `etsy_error`.
    - Returns one line per step.
    - Does nothing and returns `['Etsy not connected']` when `etsy_status` isn't `'connected'`.

- [ ] **Step 1: Write the failing tests.** Fake Etsy with an injected fetch: give `etsyGet` an optional fetch parameter that `sync` passes through, or `vi.stubGlobal('fetch')`.
  - `importReceipt twice records once`: after two calls, one sale row, one stock move, and stock down by qty.
  - `importReceipt resolves unknown_listing once linked`
  - `importLedger is idempotent across overlapping windows`
  - `importLedger starts at 1 January of the connection year when empty`: assert the first request's `min_created`.
  - `checkMismatches resolves fixed mismatches`
  - `runDaily records a failing step and still runs the rest`
- [ ] **Step 2:** Run `node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/etsy-sync.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the functions.
- [ ] **Step 4:** Run the tests again, then the whole suite with `node --env-file=.env.local node_modules/vitest/vitest.mjs run`. Expected: all PASS.
- [ ] **Step 5:** Commit `feat: idempotent Etsy receipt, ledger and mismatch sync`.

### Task 5: Entry points: connect, callback, webhook, cron

**Files:**
- Create: `lib/etsy/webhook.ts`, `app/etsy/callback/route.ts`, `app/etsy/webhook/route.ts`, `app/etsy/daily/route.ts`, `vercel.json`
- Modify: `app/[key]/actions.ts`
- Test: `tests/etsy-webhook.test.ts`

**Interfaces:**
- **Produces:**
  - `verifyWebhook(h: { id: string|null; timestamp: string|null; signature: string|null }, rawBody: string, secret: string, nowSec: number): boolean`. It uses `timingSafeEqual` on equal-length buffers.
  - `connectEtsyAction(key: string): Promise<void>` (server action):
    - Runs `requireKey`, then `pkce()` and a 32-byte base64url `state`.
    - Saves `etsy_oauth_state`, `etsy_code_verifier` and `etsy_oauth_started_at`.
    - Calls `redirect(authorizeUrl(...))`.
  - `syncNowAction(key: string, _prev: State): Promise<State>`: runs `runDaily` and returns its lines joined as `saved`.
  - `dismissIssueAction(key: string, id: string): Promise<void>`: sets `resolved_at`.
  - `GET /etsy/callback?code&state`:
    - **404 when:** `state` doesn't match the stored one (`timingSafeEqual`), more than 10 minutes have passed since `etsy_oauth_started_at`, or `error` is present.
    - **Otherwise:**
      - Runs `exchangeCode`.
      - Calls `GET /users/me` with the new token, which gives `user_id` and `shop_id`.
      - Saves the tokens, `etsy_expires_at`, the ids, `etsy_status='connected'`, and `etsy_connected_at = coalesce(etsy_connected_at, now())`.
      - Clears state and verifier.
      - Redirects with 303 to `/${APP_KEY}/settings`.
  - `POST /etsy/webhook`:
    - Reads the raw body with `await req.text()`.
    - **401 when** `verifyWebhook` fails.
    - **200 when** `webhook_id` was already seen.
    - **`order.paid`:** gets the receipt id from `resource_url` with `/\/receipts\/(\d+)/`, runs `getShopReceipt` and then `importReceipt`, and only then inserts `webhook_id`.
    - **Other event types:** inserts `webhook_id` and returns 200.
    - **Any error:** `console.error` with the message only, never the body, then 500, so Etsy retries.
  - `GET /etsy/daily`: 401 unless `authorization === 'Bearer ' + CRON_SECRET`. Otherwise runs `runDaily(new Date())` and returns its lines as JSON.
  - `vercel.json`: `{ "crons": [{ "path": "/etsy/daily", "schedule": "0 12 * * *" }] }`, which is about 4–5 am Pacific.

- [ ] **Step 1: Write the failing tests:**
  - `accepts a valid signature`: built in the test with `createHmac`.
  - `accepts when one of several v1 signatures matches`
  - `rejects a tampered body`
  - `rejects a timestamp 301 seconds old`
  - `rejects missing headers`
- [ ] **Step 2:** Run `npx vitest run tests/etsy-webhook.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `verifyWebhook`, the three routes, the actions and `vercel.json`.
- [ ] **Step 4:** Run the tests again, then `npx tsc --noEmit` and `npm run build`. Expected: PASS and a clean build. The build lists `/etsy/callback`, `/etsy/webhook` and `/etsy/daily` as dynamic.
- [ ] **Step 5: Check locally.** Run `npm run dev`, then:
  - `curl -s -o /dev/null -w '%{http_code}' localhost:3000/etsy/daily` → `401`.
  - `curl -X POST … /etsy/webhook -d '{}'` → `401`.
  - `/etsy/callback?state=x&code=y` → `404`.
- [ ] **Step 6:** Commit `feat: Etsy connect, callback, webhook and daily cron`.

### Task 6: Screens and reports

**Files:**
- Modify: `lib/data.ts`, `lib/report.ts`, `lib/alerts.ts` (if `Warning` grows), `app/[key]/page.tsx`, `app/[key]/settings/page.tsx`, `app/[key]/sale/page.tsx`, `app/[key]/sale/SaleForm.tsx`, `app/[key]/export/route.ts` (add the new tables except `settings` token columns)
- Test: `tests/report.test.ts`

**Interfaces:**
- **Consumes:** `LedgerRow`, `SyncIssue` and `Sale.discount` (Task 1); `listActiveListings` (Task 4); the actions from Task 5.
- **Produces:** `Snapshot` gains `ledger: LedgerRow[]`, `issues: SyncIssue[]` (open only) and `etsy: { status: 'connected'|'reconnect'|null }`.
- **Report changes:**
  - **Revenue:** sale revenue becomes `qty * unit_price − discount`.
  - **Ledger costs:** ledger rows with category `fee` or `ads`, in either window, become `CostLine { day: dayKey(at, tz), amount: −amount converted to USD cents, kind, productId }`. A positive refund amount therefore lowers costs.
  - **Uncategorized:** the uncategorized total for the current window goes in a new dashboard field, `uncategorizedFeesCents`.
- **Export:** must not include `etsy_access_token`, `etsy_refresh_token`, `etsy_code_verifier` or `etsy_oauth_state`.

- [ ] **Step 1: Write the failing tests** in `tests/report.test.ts`, adding `ledger: [], issues: [], etsy: { status: null }` to the fixture first:
  - `discount lowers revenue`
  - `fee and ads ledger rows count as costs and a refund lowers them`
  - `fee with product counts in that SKU's profit, ads don't`
  - `uncategorized ledger total is reported and not counted in profit`
- [ ] **Step 2:** Run `npx vitest run tests/report.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the snapshot and report changes.
- [ ] **Step 4: Screens:**
  - **Settings, Etsy section:**
    - The status: "Not connected", "Connected, read only. Last check: …" (the latest of `etsy_ledger`/`sales` import is fine, or omit it), or "Etsy access ended. Reconnect."
    - The Connect or Reconnect button.
    - A "Sync now" form showing the returned lines.
    - The copy "The app reads sales, fees and quantities. It never changes your Etsy listings."
  - **Settings, product form:** when connected, `etsy_listing_id` is a `<select>`. Its options are "Not on Etsy" plus each active listing as `title (listing_id)`, and it always includes the current value. If `listActiveListings` throws or Etsy isn't connected, keep the text input.
  - **Dashboard warnings:**
    - "Etsy access ended. Reconnect in Settings." when `etsy.status === 'reconnect'`.
    - One line per open issue, with a Dismiss button (`dismissIssueAction`).
    - "$X of Etsy charges this period aren't sorted into fees or ads yet." when `uncategorizedFeesCents > 0`.
  - **Sale screen:** hide the Etsy radio when `etsy.status === 'connected'`, so only Store shows, still selected.
- [ ] **Step 5:** Run the full suite, `npx tsc --noEmit` and `npm run build`. Expected: all pass. Then open `/[key]`, `/[key]/settings` and `/[key]/sale` on the dev server against the test branch and screenshot each.
- [ ] **Step 6:** Commit `feat: Etsy status, issues, listing picker and fees in reports`.

### Task 7: Go live and reconcile (you and the user)

This needs the user at each numbered point. Ask, don't assume.

- [ ] **Step 1:** The user adds `https://lemon-umai-inventory.vercel.app/etsy/callback` as a callback URL on the Etsy app in the developer portal.
- [ ] **Step 2:** The user adds these Vercel environment variables (Production), then pushes `phase-2` and opens a PR. You merge only when the user says to.
  - `ETSY_API_KEY`
  - `ETSY_SHARED_SECRET`
  - `ETSY_REDIRECT_URI`
  - `CRON_SECRET` (`openssl rand -base64 32 | tr -d '/+='`)
  - `ETSY_WEBHOOK_SECRET`, after Step 4
- [ ] **Step 3:** Run the migration on production with `DATABASE_URL_UNPOOLED`. Expected: `Ran N statements.` Then the user presses **Connect Etsy** in Settings and approves. Expected: Settings shows "Connected, read only."
- [ ] **Step 4: Webhook.**
  1. The user opens the Webhook portal, chooses **+Add Endpoint**, enters `https://lemon-umai-inventory.vercel.app/etsy/webhook`, and picks the event `order.paid`.
  2. The user copies the `whsec_…` secret into Vercel and redeploys.
  3. If the portal isn't offered for their app type, skip this step. The daily catch-up still imports orders within a day.
- [ ] **Step 5:** The user presses **Sync now**. Then list the distinct `ledger_type`s, with counts and totals, from `etsy_ledger` (read-only query).
  - Move every real type into the right bucket in `categorize`.
  - Update the categories already stored with one `update etsy_ledger set category = …` per type.
  - Add a test case for each new type.
  - Commit `fix: fee map from real ledger types`.
- [ ] **Step 6:** Reconcile one full month against the user's Etsy statement (FR-12 acceptance).
  - Compare fees, ads and sales totals.
  - Write down any gap and its cause in the spec's §12 table.
  - Mark the price and discount assumption there as confirmed, or fix `receiptToSales`.
- [ ] **Step 7:** Mismatch check (FR-09 acceptance). The user changes one listing's quantity on Etsy and presses **Sync now**. Expected: a mismatch line on the dashboard. The user sets the quantity back and syncs again; the line disappears.
- [ ] **Step 8:** Tag `phase-2` once the user confirms.
