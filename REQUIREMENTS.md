# Matcha Stock & Profit App: Requirements

Nov 5, 2026 · @Tuanmon

Copy of the [live requirements document](https://claude.ai/artifact/TaFBwsKuvXB2z7tnaUfBA1), saved on 5 November 2026.

## Purpose and success

The app answers one question each day: is the matcha business making a profit, and is there enough sellable stock? It replaces texts and Google Sheets for two people. Etsy quantities are still updated by hand for now.

| Goal | How we will know it works |
| --- | --- |
| Stock is always trustworthy | The app count matches the shelf and Etsy, and any mismatch is flagged |
| Store sales are effortless | Your friend records a sale on a phone without help or a text to you |
| Profit is clear | The monthly profit matches a hand check against Etsy statements and your cost records |
| Nothing expires unnoticed | Alerts arrive 3, 2 and 1 months before expiry, and at about 3 units left |

## Users and jobs to be done

Two people use the app, and both can see everything, including costs and profit.

| User | Main device | Jobs to be done |
| --- | --- | --- |
| Owner (you) | Computer, checked daily | Set up products. Record shipments and costs. Log expenses. Spot stock mismatches. See whether the business is profitable. |
| Friend (US, holds the stock) | Phone | Record store sales quickly. Check how much stock is left. |

Etsy order packing stays outside the app: you tell your friend about each order, and your friend packs it.

## Functional requirements

There are 24 requirements: 19 Must, 2 Should and 3 Won't for now (FR-07, FR-08 and FR-10, in the backlog), prioritized with MoSCoW. Update the Status column as work moves from Locked to Verified. You approved FR-04 and FR-06's 15-second target on 5 November 2026.

| ID | Area | Requirement | Priority | Acceptance check | Status |
| --- | --- | --- | --- | --- | --- |
| FR-01 | Products | Add and edit a SKU with name, grams, can or bag, details, expiry date and agreed store price | Must | All 5 current SKUs can be entered and edited | Locked |
| FR-02 | Stock | Show one current stock count per SKU, which is the source of truth | Must | Every sale, shipment and correction changes the count and can be traced | Locked |
| FR-03 | Stock | Record a shipment with vendor cost, freight, units per SKU and expiry dates | Must | Saving a shipment raises stock and updates unit cost | Locked |
| FR-04 | Stock | Correct stock by hand with a reason, such as damage or a recount | Should | The correction and its reason appear in the SKU's history | Locked |
| FR-05 | Etsy sync | Import Etsy sales automatically and lower stock | Must | A paid order lowers stock with no typing | Locked |
| FR-06 | Store sales | Let your friend enter a sale on a phone: SKU and quantity, with today's date and an editable agreed price filled in | Must | Your friend completes a sale one-handed, unaided, in about 15 seconds | Locked |
| FR-07 | Etsy sync | Lower the Etsy listing quantity automatically after a store sale | Won't for now (backlog) | Etsy shows the lower quantity shortly after saving | Locked |
| FR-08 | Etsy sync | Raise the Etsy quantity when a shipment is recorded, so you enter it once | Won't for now (backlog) | Etsy shows the higher quantity shortly after saving | Locked |
| FR-09 | Etsy sync | Flag any mismatch between app stock and Etsy quantity | Must | A quantity changed directly on Etsy gets flagged | Locked |
| FR-10 | Etsy sync | Remove refunded or canceled sales from revenue and profit; return units to stock only after you confirm they are sellable | Won't for now (backlog) | A test refund changes profit, and stock changes only after confirming | Locked |
| FR-11 | Costs | Log bulk packaging and gift purchases as expenses on the purchase date | Must | Each expense appears in that month's profit | Locked |
| FR-12 | Costs | Pull Etsy fees and ads automatically, as accurately as Etsy's data allows | Must | One month's total reconciles to the Etsy statement, with any gap shown | Locked |
| FR-13 | Costs | Calculate average unit cost per SKU from vendor price and freight, with shared freight split by weight | Must | A sample shipment matches a hand calculation | Locked |
| FR-14 | Reports | Show profit first, then margin, revenue, units sold and orders | Must | One month's numbers match a hand check | Locked |
| FR-15 | Reports | Split results by Etsy vs store, and by SKU | Must | Etsy and store add up to the total; SKU results show profit before shared costs | Locked |
| FR-16 | Reports | Compare the selected date range with the period just before it, of the same length (month to date compares with the same days last month) | Must | On 10 November it compares 1–10 November with 1–10 October | Locked |
| FR-17 | Reports | Show all reports in USD and VND at one exchange rate you set for the year | Must | Changing the rate updates VND and USD conversions consistently | Locked |
| FR-18 | History | Let you enter past monthly totals per SKU by hand (units, revenue, orders), without changing today's stock or Etsy quantities | Must | Past totals appear in past-month reports only; months entered as totals show the full month, not a same-days comparison | Locked |
| FR-19 | Alerts | Show warnings in the app at 3, 2 and 1 months before expiry, and at about 3 units left | Must | Test dates and low stock each trigger the right warning | Locked |
| FR-20 | Alerts | Send the same warnings through Telegram, once per threshold | Should | Test alerts arrive in Telegram with no duplicates | Locked |
| FR-21 | Alerts | With mixed expiry dates, base alerts on the earliest date on hand, which clears when you remove that date or the SKU reaches zero | Must | Removing a date moves alerts to the next date | Locked |
| FR-22 | Access | Give both users full access to all screens | Must | Both can reach every screen with the same link | Locked |
| FR-23 | Reports | Show a line chart of profit, revenue or units sold per day for the selected range (switchable), with the previous period as a dashed line | Must | Hovering a day shows both periods' values, and the daily values add up to the totals | Locked |
| FR-24 | Reports | Filter the dashboard by this week, this month or a custom date range; every number, chart and table on the page follows the filter | Must | Choosing 1–15 Oct shows only those days, compared with 16–30 Sep | Locked |

## Business rules

Profit is revenue minus the cost of goods sold, expenses, Etsy fees and ads. These rules fix how each number is calculated.

```latex
\text{Profit} = \text{Revenue} - \text{Cost of goods sold} - \text{Packaging and gifts} - \text{Etsy fees} - \text{Etsy ads}
```

| Rule | Definition |
| --- | --- |
| Unit cost | Vendor price plus allocated freight, averaged per SKU across shipments. Sales are not traced to a specific shipment. |
| Shared freight | Split across the SKUs in a shipment by total product weight (grams × units). |
| Packaging and gifts | Counted in full in the month of purchase, so profit dips in months you restock them. Store orders don't use them. |
| Etsy fees and ads | Taken from Etsy's records. Ads and packaging are subtracted from shop profit only and are not split across SKUs. |
| Store sales | Revenue is the sale price entered. No Etsy fees apply. |
| Margin | Profit divided by revenue. |
| Comparison period | A week runs Monday to today, against the same days last week. A month runs the 1st to today, against the same days last month. A custom range compares with the same number of days just before it. |
| Exchange rate | One USD–VND rate for the whole year, used for every conversion. |
| Refunds and cancellations | Backlog, not handled for now. A canceled or refunded Etsy order still counts as a sale; fix stock with a correction (FR-04). |
| Low stock | About 3 units left for a SKU. |
| Expiry alerts | 3, 2 and 1 months before expiry, using the earliest date on hand. |
| Buyer shipping | The buyer pays shipping at checkout, on top of the product price. Shipping charges and Etsy label costs are left out of revenue, expenses and profit. Freight from Japan stays in unit cost. |
| Sale date | US time, at the store's location, decides the day and month a sale counts in. |

## Quality requirements and constraints

The app must be easier than Google Sheets, with sales entry designed for phones and everything else designed for a computer browser.

| ID | Requirement | Acceptance check |
| --- | --- | --- |
| NFR-01 | Sales entry works well on a phone browser, with large buttons and no sideways scrolling | Tested at phone width, then by your friend on a real phone |
| NFR-02 | Stock and report screens are designed for a computer browser | All reports readable on a laptop screen with no extra tools |
| NFR-03 | Web-based, with nothing to install | Opens from a link on both devices |
| NFR-04 | Simple and plain; looks don't matter | Your friend needs no training |
| NFR-05 | No login, per your decision (see risk R2) | Both users reach the app directly from the link |
| NFR-06 | Hosted on Vercel's free plan (see risk R1) | Hosting choice recorded in the decision log |
| NFR-07 | Runs without your devices being on | Etsy sales import and alerts work while your computer is off |

## Out of scope

These stay out for now and need a change-log entry to come back in. Backlog to revisit: cancellations and refunds (FR-10), and pushing quantities to Etsy (FR-07, FR-08).

- Payments to your friend, any store cut, and passing store money to you
- Storage costs, taxes, samples, and write-offs for damaged or expired products
- A point-of-sale system at the store
- Showing Etsy orders to your friend for packing
- Choosing which units ship first by expiry date
- Tracking profit by individual shipment

## Risks and open questions

Two risks affect your decisions now: Vercel's free plan appears not to allow this use, and an app with no login is open to anyone who gets the link.

| ID | Risk | Impact | Proposed response |
| --- | --- | --- | --- |
| R1 | [Vercel's Hobby plan](https://vercel.com/docs/limits/fair-use-guidelines) is limited to non-commercial personal use, and its definition covers any deployment used for financial gain. It doesn't name internal tools, so this is my reading. | Running on it may break Vercel's rules | Owner accepted this risk and chose the free plan. Fallback: [Pro at $20 a month](https://vercel.com/pricing) |
| R2 | With no login, anyone with the link can see costs and profit, and enter or change records | Wrong stock, exposed finances | Keep no login but use a long private link, and record every change. Owner chose this over a shared passcode and accepted the risk. |
| R3 | [Etsy API approval](https://github.com/etsy/open-api/discussions/1607) is uncertain, and developers report long waits and denials | No automatic Etsy sync until approved | Apply first. Fall back to file uploads and manual Etsy updates. |
| R4 | Etsy's fee types aren't listed in the pages I could read, and developers report entries not tied to orders | Fees could be miscategorized, and SKU profit partly estimated | Check real shop data before finalizing, then reconcile to one Etsy statement |
| R5 | An Etsy order and a store sale can take the last unit at almost the same time | Occasional oversell | You update Etsy by hand after each store sale; the daily check flags any gap, and negative stock is flagged |
| R6 | [Hobby scheduled jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing) run once a day, within an hour of the set time. [Etsy's refresh token lasts 90 days](https://developer.etsy.com/documentation/essentials/authentication). | Daily checks only on Hobby | Use [Etsy's order events](https://developer.etsy.com/documentation/essentials/webhooks) for live sales and a daily job for alerts and mismatch checks |
| R7 | [Neon's free database](https://neon.com/pricing) limits usage (1 GB of storage, 100 compute hours a month per project), and its terms weren't checked for commercial use | Database could pause or block writes | Expected use is small. Check the terms and offer a data export. |

**Open questions**

- [x] Q1 Hosting: decided. Use Vercel's free plan, accepting risk R1.
- [x] Q2 Access: decided. Long private link only, with no passcode, accepting risk R2.
- [x] Q3 Postage: decided. Buyers pay shipping at checkout, so shipping charges and label costs stay out of revenue, expenses and profit.
- [x] Q4 SKU profit: decided. Don't split shared costs; SKU results show profit before ads and packaging.
- [x] Q5 Month boundary: decided. US time decides the day a sale counts. Still needed: the store's state, to set the exact time zone.
- [x] Q6 Stock corrections: decided. FR-04 and the 15-second target in FR-06 are approved.

**Sources** (read on 5 November 2026)

[Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines), [Vercel Hobby plan](https://vercel.com/docs/plans/hobby), [Vercel pricing](https://vercel.com/pricing), [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Vercel deployment protection](https://vercel.com/docs/deployment-protection), [Neon pricing](https://neon.com/pricing), [Etsy authentication](https://developer.etsy.com/documentation/essentials/authentication), [Etsy listings tutorial](https://developer.etsy.com/documentation/tutorials/listings), [Etsy webhooks](https://developer.etsy.com/documentation/essentials/webhooks), [Etsy payments tutorial](https://developer.etsy.com/documentation/tutorials/payments), [Etsy app key notice](https://github.com/etsy/open-api/discussions/1607), [Etsy reply on app tiers](https://github.com/etsy/open-api/discussions/1657).

## Decision and change log

Any change to a locked requirement gets a row here, newest first.

| Date | Decision | Made by |
| --- | --- | --- |
| 6 Nov 2026 | Dashboard gets a daily line chart (FR-23) and a week, month or custom date filter (FR-24); FR-16 now compares any selected range | Owner |
| 6 Nov 2026 | Pushing quantities to Etsy (FR-07, FR-08) moved to the backlog until the app is proven; the app only reads from Etsy | Owner |
| 6 Nov 2026 | Cancellations and refunds (FR-10) moved to the backlog, to revisit later | Owner |
| 6 Nov 2026 | Buyer shipping is not an expense: the buyer pays it at checkout, so shipping and label costs stay out of revenue, expenses and profit. Replaces the 5 Nov postage-difference rule. | Owner |
| 5 Nov 2026 | Use Neon's free plan as the database instead of Google Sheets | Owner |
| 5 Nov 2026 | Manual stock corrections (FR-04) and the 15-second sale target (FR-06) approved | Owner |
| 5 Nov 2026 | US time decides the day and month a sale counts in | Owner |
| 5 Nov 2026 | Pull customer postage and label costs from Etsy's records; only the difference affects shop profit | Owner |
| 5 Nov 2026 | Requirements reduced: past sales entered as monthly totals (FR-18), shared costs not split across SKUs (Q4), and no confirmation step for expiry dates (FR-21) | Owner |
| 5 Nov 2026 | Long private link only, with no passcode, accepting risk R2 | Owner |
| 5 Nov 2026 | Use Vercel's free plan without asking support, accepting that it may not allow business use | Owner |
| 5 Nov 2026 | Requirements locked in this document, pending open questions | Owner |
| 5 Nov 2026 | Friend's sales entry optimized for phone; everything else for computer | Owner |
| 5 Nov 2026 | No login, with two trusted users | Owner |
| 5 Nov 2026 | Explore Vercel for hosting, aiming for no cost | Owner |
| 5 Nov 2026 | Hosted web app chosen over a Google Sheet or a local app | Owner |
| 5 Nov 2026 | App is the source of truth for stock; average cost per SKU; one exchange rate per year | Owner |
