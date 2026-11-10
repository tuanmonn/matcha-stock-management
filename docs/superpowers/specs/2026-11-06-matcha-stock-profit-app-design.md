# Matcha Stock & Profit App: Design Spec

Date: 6 November 2026. Requirements: [REQUIREMENTS.md](../../../REQUIREMENTS.md) (copy of the [live document](https://claude.ai/artifact/TaFBwsKuvXB2z7tnaUfBA1)). Requirement IDs (FR-xx, NFR-xx, Rx) refer to that document.

## 1. Summary

A small web app on Vercel's free plan, with a Neon Postgres database. Your friend uses one phone screen to record store sales. You use computer screens for everything else. Etsy sales come in automatically, and a daily job imports fees, flags differences between app stock and Etsy quantities, and sends Telegram alerts. The app only reads from Etsy; you still update Etsy quantities by hand.

## 2. Stack

| Part | Choice | Why |
| --- | --- | --- |
| App | Next.js (App Router) with TypeScript, server-rendered pages and server actions | First-class on Vercel; forms work without a separate API |
| Database | Neon Postgres, free plan, via `@neondatabase/serverless` and plain SQL | Free, and real constraints stop double counting |
| Styling | One plain CSS file | Looks don't matter (NFR-04) |
| Tests | Vitest | Money and date logic need automated checks |
| Etsy, Telegram | Direct `fetch` calls | No SDK needed for a handful of calls |
| Scheduling | One Vercel cron job, once a day | The free plan allows daily jobs only |

No ORM, UI library, chart library or auth library.

## 3. Access (NFR-05, R2)

- **Private link:** Every page lives under `/{APP_KEY}/…`, where `APP_KEY` is a long random value in an environment variable. Any other path returns 404.
- **Server actions:** Every action checks the key itself, because actions can be called directly, not only from pages.
- **Leak reduction:** `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex` on every response.
- **Machine endpoints:** The Etsy webhook is checked by its signature. The daily job is checked by Vercel's `CRON_SECRET` header.
- **Read-only Etsy access:** The app asks Etsy only for read scopes (`transactions_r`, `listings_r`, `shops_r`), so a bug in the app can't change your listings. `shops_r` is needed by `getMe`, which returns your shop id. Active listing quantities come from `getListingsByShop` (`listings_r`). Confirmed against Etsy's OpenAPI file, 9 November 2026.
- **Secrets:** Etsy keys, tokens and the Telegram token stay on the server and never reach the browser.
- **Changing the key:** If the link leaks, change `APP_KEY` in Vercel and share the new link.

## 4. Data model

All money is stored as an integer amount plus a currency (`USD` cents or whole `VND`). Conversion happens only in reports (section 7).

| Table | Purpose | Key columns |
| --- | --- | --- |
| `products` | The 5 SKUs (FR-01) | sku, name, grams, packaging (`can`/`bag`), details, store_price, etsy_listing_id, low_stock_at (default 3) |
| `shipments` | One delivery from Japan (FR-03) | received_on, freight_amount, freight_currency, note |
| `shipment_lines` | SKUs in a shipment | shipment_id, product_id, units, vendor_amount, vendor_currency, expiry_date |
| `stock_moves` | Every stock change (FR-02) | product_id, qty_delta, kind (`shipment`, `sale`, `correction`), ref, reason, at. Unique on (kind, ref). |
| `sales` | One row per sold line | channel (`etsy`/`store`), sold_at, product_id, qty, unit_price, currency, etsy_receipt_id, etsy_transaction_id (unique) |
| `expenses` | Packaging and gifts (FR-11) | spent_on, category, amount, currency, note |
| `etsy_ledger` | Imported Etsy fee and ad entries (FR-12) | entry_id (unique), at, ledger_type, amount, currency, category, raw JSON |
| `monthly_history` | Past months entered by hand (FR-18) | month, product_id, channel, units, revenue, currency, orders |
| `expiry_dates` | Expiry dates on hand (FR-21) | product_id, expiry_date, cleared_at |
| `fx_rates` | One rate per year (FR-17) | year, vnd_per_usd |
| `settings` | Single row | time_zone, etsy tokens, telegram chat id |
| `sync_issues` | Anything needing your attention | kind (`mismatch`, `unknown_listing`, `negative_stock`, `uncategorized_fee`), product_id, detail, resolved_at |
| `alerts_sent` | Telegram alerts already sent (FR-20) | product_id, kind, key (for example `2027-03-01:2m`). Unique on all three. |
| `webhook_events` | Etsy deliveries already handled | webhook_id (unique), received_at |

**Stock count:** stock for a SKU is the sum of its `stock_moves`. It is never stored separately, so it can't drift from its history.

## 5. Calculations

**Freight allocation (FR-13).** Each line's share of shipment freight is its weight (`grams × units`) over the shipment's total weight. The last line takes the rounding remainder, so shares always add up to the freight total.

**Unit cost and cost of goods sold.** Weighted average cost, replayed from history each time a report runs:

1. Walk the SKU's stock moves in time order.
2. A shipment line adds its landed cost (vendor amount + freight share, in USD at that year's rate) and its units to the running pool.
3. A sale takes `qty × (pool cost ÷ pool units)` as its cost of goods sold, and removes that cost and those units from the pool.
4. Corrections change units at the current average cost.

Replaying keeps old reports correct when a shipment is edited or a rate changes, and 5 SKUs make it cheap. If the pool is empty when a sale happens, the sale uses the last known average cost and raises a `negative_stock` issue.

**Revenue.** Store sales count the entered price × quantity. Etsy sales count the item price × quantity, minus any discount. Buyer shipping and sales tax are excluded (business rule: buyer shipping).

**Profit (FR-14).**
- **Shop profit:** revenue − cost of goods sold − packaging and gift expenses − Etsy fees − Etsy ads. Margin is profit ÷ revenue.
- **SKU profit (FR-15):** revenue − cost of goods sold − Etsy fees linked to that SKU's orders. Fees Etsy doesn't link to an order count at shop level only, like ads and packaging, and are not split across SKUs.

## 6. Flows

**Store sale (FR-06).** On the phone screen, tap a SKU, adjust quantity (default 1) and price (agreed price filled in), and save. The date defaults to today. In one transaction, the app writes the sale and a `−qty` stock move. The same form has a channel switch (store or Etsy), so Etsy sales can be entered by hand before the Etsy connection exists, or if it fails. The Etsy option is hidden while Etsy is connected, and the catch-up in the daily job ignores receipts paid before the connection date, so no sale is counted twice.

**Etsy order (FR-05).**
1. Etsy sends `order.paid`, which includes only a link to the receipt.
2. The app verifies the signature: HMAC-SHA256 over `webhook-id.webhook-timestamp.raw_body`, using the base64-decoded secret without its `whsec_` prefix. It rejects timestamps more than 300 seconds old and skips `webhook-id`s it has already seen.
3. It fetches the receipt and writes one sale and one stock move per transaction. The unique keys on `etsy_transaction_id` and `(kind, ref)` mean a repeat delivery changes nothing.
4. A listing that isn't linked to a SKU raises `unknown_listing`.

**Cancellations and refunds (FR-10): backlog.** Not handled for now. `order.canceled` is ignored, and a canceled or refunded order still counts as a sale. Fix stock with a correction.

**Shipment (FR-03).** You enter freight and one line per SKU. Saving writes the lines, `+units` stock moves and new expiry dates.

**Correction (FR-04).** Enter a new count or a change, plus a required reason. This writes a `correction` move.

**Pushing to Etsy (FR-07, FR-08): backlog.** The app never changes Etsy. You update Etsy quantities by hand, and the daily mismatch check tells you when Etsy and the app disagree.

**Daily job (one Vercel cron, R6).** Steps run in this order, and one failing step doesn't stop the rest:
1. Refresh the Etsy access token, saving whatever refresh token Etsy returns.
2. Catch up on paid receipts from the last 7 days, in case a webhook was missed.
3. Import new ledger entries and categorize them.
4. Compare each SKU's Etsy quantity with the app's stock and flag mismatches (FR-09).
5. Send Telegram alerts.

Mismatches are only caught here. Etsy's `inventory.updated` event doesn't fire on quantity changes, so a change made directly on Etsy is flagged within about a day.

**Fee categories (FR-12, R4).** A small map in code turns each Etsy `ledger_type` into `fee`, `ads`, `ignore` (sales, payouts, refunds of sales, shipping labels) or `uncategorized`. Uncategorized amounts show on the dashboard with a warning until the map covers them. The real type names are confirmed against your shop's data in phase 2.

**Expiry and low stock (FR-19 to FR-21).**
- **Earliest date:** Each SKU's alert date is its earliest uncleared expiry date. You can clear a date, and all of a SKU's dates clear when its stock reaches 0.
- **Expiry warnings:** Each starts when today reaches the expiry date minus 3, 2 or 1 calendar months.
- **Low stock:** The warning starts when stock is at or below `low_stock_at`.
- **In the app:** Warnings are worked out each time a page loads.
- **Telegram:** Each threshold is sent once, using `alerts_sent`. A low-stock alert can be sent again after stock goes back above the threshold.

**Data export (R1, R7).** One page downloads every table as a single JSON file.

## 7. Reports (FR-14 to FR-18)

- **Date filter (FR-24):** one row above everything: This week, This month (the default) or a custom range. Every figure, chart and table on the page follows it.
- **Comparison (FR-16):** a week runs Monday to today, against the same days last week. A month runs the 1st to today, against the same days last month; a month with fewer days stops at its last day, so 1–31 March compares with 1–28 February. A custom range compares with the same number of days just before it.
- **Dashboard order:** profit first, then margin, revenue, units sold and orders, then the chart.
- **Chart (FR-23):** one value per day, switchable between profit, revenue and units sold, so it only ever has one axis. The selected range is a solid blue line and the previous period a dashed gray line, both labeled. Hovering or focusing a day shows both values, and a "Show as table" switch lists the same numbers. It's plain SVG, with no chart library.
- **Splits:** by Etsy vs store, and by SKU.
- **Days and months:** set by the time zone in settings, which is the store's US time zone (decision Q5).
- **Currency:** every amount converts to USD and VND using its own year's rate from `fx_rates`. If a year has no rate, the report says so and doesn't guess.
- **Past months:** a month entered in `monthly_history` uses only those totals, so its live sales are never counted twice. A range that touches such a month includes that month's whole total and is marked approximate; the chart leaves those months out. Their cost of goods sold uses today's average unit cost.

## 8. Screens

| Screen | Device | Contents |
| --- | --- | --- |
| Record sale | Phone | Large SKU buttons with stock left, quantity, price and save. Nothing else. |
| Dashboard | Computer | Date filter, profit summary, comparison, daily chart, splits, warnings and open issues |
| Stock | Computer | Count, average cost, expiry dates and history per SKU. Corrections. |
| Shipments | Computer | List and new-shipment form |
| Sales and expenses | Computer | Sales list, expenses, and past monthly totals |
| Settings | Computer | Products (each linked by picking from a list of your active Etsy listings), yearly rates, time zone, Etsy connect and sync now, Telegram test, export |

## 9. Error handling

- **Sale writes:** A sale and its stock move are written together or not at all.
- **Etsy calls:** Every Etsy call that fails becomes a `sync_issue` and is never dropped silently. The app's own records are never rolled back because Etsy was unreachable.
- **Etsy rate limits:** Retry once after the `retry-after` time Etsy gives, then raise an issue.
- **Missing access:** If Etsy access is lost (an expired or revoked token), the dashboard shows a "Reconnect Etsy" warning.
- **Form input:** Forms reject non-positive quantities, missing reasons, unknown SKUs and amounts without a currency.

## 10. Testing

Each item below gets an automated Vitest test:

- **Freight:** allocation, with shares that add up exactly.
- **Average cost:** the cost-of-goods-sold replay, across two shipments at different costs, an edited shipment, and an empty pool.
- **Profit:** shop and SKU profit, including uncategorized fees.
- **Comparison periods:** weeks (on a Monday, a Friday and a Sunday), months (10 November, 31 March, the first of a month) and custom ranges, including one across the new year.
- **Daily series:** every day appears, including days with no sales, and the days add up to the range totals.
- **Currency:** USD and VND conversion, plus the missing-rate case.
- **Alerts:** expiry thresholds on calendar months, plus once-only sending and the low-stock reset.
- **Etsy signature:** a valid signature, a tampered body, and a stale timestamp.

Manual checks follow the acceptance column of each FR. Your friend tests the sale screen on a real phone. One real Etsy statement is reconciled in phase 2, and the mismatch check is tried on one listing.

## 11. Build phases

| Phase | Delivers | Done when |
| --- | --- | --- |
| 1. Core | Private link, products, shipments, sales form with channel switch, corrections, expenses, past totals, reports, in-app warnings, export | Automated tests pass, and your friend records a store sale on a phone |
| 2. Etsy read | OAuth connection, listing picker, webhook, catch-up, ledger import and fee map, and the daily mismatch check (merged in from phase 3 on 9 November 2026) | One month reconciles to your Etsy statement, and a quantity you change on Etsy is flagged the next day |
| 3. Telegram | Bot alerts | Test alerts arrive once each |

Phase 1 doesn't depend on Etsy approval. Phase 2 needs your API key. Pushing quantities to Etsy (FR-07, FR-08) is in the backlog.

## 12. Assumptions to confirm during the build

| Item | Default until confirmed | Confirmed in |
| --- | --- | --- |
| Store's state, which sets the time zone | Ask before phase 1 ships | Phase 1 |
| Each SKU is one Etsy listing without variations | Wrong for this shop (options, and one SKU in several listings): matched by Etsy option SKU instead, which must equal the app SKU | Phase 2, 10 November 2026 |
| Receipt fields for item price and discounts | Price × quantity minus discount | Phase 2 |
| Real `ledger_type` names | Unknown types show as uncategorized | Phase 2 |
| Neon free-plan terms: no business-use ban found, but the governing [Databricks agreement](https://www.databricks.com/legal/mcsa) wasn't read | Proceed, and keep export available | You, any time |
| Neon pauses after 5 minutes idle | The first sale after a quiet spell may take a moment longer | Phase 1 phone test |

## 13. Not building

Login or passcode, cancellations and refunds (backlog, FR-10), pushing quantities to Etsy (backlog, FR-07, FR-08), splitting shared costs across SKUs, per-shipment profit, shipping or label costs, Etsy order packing views, a chart library, a file-upload Etsy fallback (built only if API access is refused), and anything listed as out of scope in the requirements.

## Sources

[Etsy webhooks](https://developer.etsy.com/documentation/essentials/webhooks), [Etsy listings tutorial](https://developer.etsy.com/documentation/tutorials/listings), [Etsy authentication](https://developer.etsy.com/documentation/essentials/authentication), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Neon plans](https://neon.com/docs/introduction/plans), [Neon product schedule](https://neon.com/terms-of-service). Read 5–6 November 2026.
