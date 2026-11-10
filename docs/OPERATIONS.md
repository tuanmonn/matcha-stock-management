# Operations runbook

This is how the live app is set up and run, and the lessons learned building it. Read it before deploying, migrating, touching production data, working on the Etsy sync, or debugging the live site.

## Live setup

| Thing | Value |
| --- | --- |
| Site | `https://lemon-umai-inventory.vercel.app/<APP_KEY>/…`, where any other path returns 404 |
| Vercel | Project **`lemon-ui-inventory`** (renamed; the address didn't change). Hobby plan. Every push to `main` deploys production |
| Database | Neon project `sparkling-unit-58053494` (org `org-tiny-snow-13030902`). Branch `production` is live; branch `test` is used only by tests |
| GitHub | `tuanmonn/matcha-stock-management`. PRs #1–#4 are merged (phase 1, phase 2, SKU matching, fee map) |
| Store | The friend's store is in Texas, so `settings.time_zone = America/Chicago` |
| Etsy shop | LemonUmaiMatcha. Read-only app, connected |

`.env.local` (git-ignored) holds `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH`, `TEST_DATABASE_URL`, `APP_KEY`, `VERCEL_OIDC_TOKEN`, `ETSY_API_KEY`, `ETSY_SHARED_SECRET` and `ETSY_WEBHOOK_SECRET`.

Vercel production holds `APP_KEY`, `DATABASE_URL`, `ETSY_API_KEY`, `ETSY_SHARED_SECRET`, `ETSY_REDIRECT_URI` (`https://lemon-umai-inventory.vercel.app/etsy/callback`), `CRON_SECRET` and `ETSY_WEBHOOK_SECRET`. All are stored as secrets. Nobody has `CRON_SECRET` locally.

## Commands

The user's shell doesn't load Node by default, so start every Node or npm command with:
`export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" >/dev/null && …`

- **Tests:** `node --env-file=.env.local node_modules/vitest/vitest.mjs run`. The DB test files run against `TEST_DATABASE_URL`. `tests/db-guard.ts` refuses to run when that URL points at production. `vitest.config.ts` sets `fileParallelism: false`, because the DB test files truncate shared tables.
- **Typecheck and build:** `npx tsc --noEmit` and `npm run build`. Afterwards, run `git checkout next-env.d.ts`, because `next dev` and `next build` rewrite it.
- **Migrate:** `db/schema.sql` must stay rerunnable (`if not exists`), and `scripts/migrate.mjs` splits on `;`, so no semicolons inside strings.
  - Test branch: `node --env-file=.env.local --input-type=module -e 'process.env.DATABASE_URL=process.env.TEST_DATABASE_URL; await import("./scripts/migrate.mjs")'`
  - Production: the same command with `DATABASE_URL_UNPOOLED`. Run it *before* merging code that reads new columns. Additive changes are safe for the running site.
- **One-off read or fix on production:** write a throwaway `./.peek.mjs` that uses `@neondatabase/serverless`, run it with `node --env-file=.env.local ./.peek.mjs`, then delete it. Print only the fields you need, never connection strings or tokens.
- **Run app code (TypeScript, `@/` imports) against production:** put a temporary `tests/zz-*.test.ts` that dynamically imports the module, run that one file with the vitest command above, then delete it. This is how the Etsy backfill ran.
- **Check the live site without printing the key:** `K=$(grep '^APP_KEY=' .env.local | cut -d= -f2- | tr -d '"')`, then `curl -s -o /dev/null -w '%{http_code}' "$URL/$K/settings"`.
- **Vercel environment variables:** pipe the value in without echoing it: `printf '%s' "$V" | npx vercel env add NAME --environment production --sensitive --yes`. Then redeploy with `npx vercel redeploy <latest production deployment URL> --target production`, because env changes only apply to new deployments.

## Shipping a change

1. Work on a branch from `main`.
2. Executing agents run on Sonnet; reviews run on Opus (see `CLAUDE.md`).
3. Run tsc, the suite and the build, all green.
4. Commit.
5. **The user runs `git push` themselves.**
6. Open the PR with `gh pr create`.
7. **The user presses Merge.** The session's safety check blocks merges.
8. Vercel deploys within about a minute. Pull `main` and curl-check the live pages.

## Etsy integration facts

- **Read-only.**
  - Scopes are `transactions_r listings_r shops_r`.
  - The only Etsy write is the token POST.
  - The user updates Etsy quantities by hand.
  - Pushing quantities to Etsy (FR-07/08) is backlog.
- **API ground truth:** `https://www.etsy.com/openapi/generated/oas/3.0.0.json`. The docs site's reference page is client-rendered and unreadable by fetch.
  - Header: `x-api-key: <keystring>:<shared secret>`.
  - `GET /users/me` returns `shop_id`.
  - `getListingsByShop` with `includes=Inventory` gives each option's `sku` and offering quantities.
  - Ledger `amount` is in cents, and charges are negative.
- **Orders are matched by option SKU.** The live shop has listings with options:
  - Listing 4585500639 sells MKWAKO20 and MKWAKO40.
  - Listing 4610328937 sells all 5 SKUs.
  - Every Etsy option's SKU equals the app SKU exactly.
  - The listing link in Settings is only a fallback, used when that listing belongs to exactly one product.
  - The mismatch check compares every listing option with app stock by SKU.
- **Cut-off:** `settings.etsy_connected_at = 2026-10-01T05:00Z`.
  - It was moved back from the 9 November connect so the 6 earlier orders could be backfilled.
  - Manual Etsy sales are allowed only before that day.
  - Reconnecting after lost access resets it, so hand-entered gap sales aren't imported twice.
- **Fee map (`lib/etsy/map.ts` `categorize`)** is built from the shop's real ledger types. Unknown types land as `uncategorized`, show a dashboard warning, and need a map entry plus a `update etsy_ledger set category=…` for stored rows.
  - Fees include `shipping_transaction`, `tax_seller_services` and `seller_onboarding_fee`.
  - Ignored: `PAYMENT_GROSS`, `DISBURSE2`, `sales_tax`, `shipping_labels` and `seller_onboarding_fee_payment`.
- **Fee to SKU links** are set at import time. After backfilling sales, link existing rows by `reference_type` `transaction` (via `sales.etsy_transaction_id`) or `receipt` (when all of that receipt's sales are one product).
- **Tokens.** Access tokens last 1 hour, and refresh tokens rotate on every refresh. Refresh only through the app's compare-and-set path (`getAccessToken`) or an equivalent conditional `update … where etsy_refresh_token = <old>`. A careless refresh logs the live site out.
- **Webhook.** `order.paid` was registered in Etsy's Webhook portal on 10 November 2026 and is verified, with signed test messages giving 200 and unsigned ones 401. Other events aren't needed.
- **Daily cron.** `/etsy/daily` runs at 12:00 UTC (`vercel.json`): token, catch-up (7 days), ledger import, then mismatch check. **Sync now** in Settings runs the same job.

## Money rules confirmed against Etsy (October 2026 statement)

- **Fees and Marketing** match Etsy to the cent.
- **Etsy "Sales" includes buyer-paid shipping**, but the app counts item prices only. Buyer shipping and labels are both excluded by the user's decision, and they roughly cancel out.
- **Discounts** (`shop_coupon + buyer_coupon` per transaction) haven't been seen on a real order yet. Check the first discounted order.

## Lessons learned

- **Check real shop data against every spec assumption before the first sync.** The spec assumed one listing per SKU without options, which was wrong.
- **Vendor cost is the total for the line.** The user's first shipment was entered per unit. Sanity-check new shipments: per-unit cost = line ÷ units.
- **Prefer pulling data from Etsy over asking the user to type it.**
- **Next 16 differences:** `notFound()` inside a route handler gives a 500, so return a plain 404 `Response`. `params` is a Promise. Read `node_modules/next/dist/docs` before using an unfamiliar API.
- **Polling deploys:** use an until-loop on an observable change, such as new text on the live page. `vercel ls` output parsing is brittle.

## Backlog and known gaps

- **Backlog:**
  - Cancellations and refunds (FR-10); fix stock with a Stock correction for now.
  - Pushing quantities to Etsy (FR-07/08).
  - Telegram alerts (phase 3).
- **Known minor gaps:**
  - Listings are read one page of 100.
  - The callback, webhook and cron routes have no route-level tests.
  - Orders paid on a reconnect day, before the reconnect time, are never imported.
