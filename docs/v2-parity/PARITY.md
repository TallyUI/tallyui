# v2 parity checklist: screen by screen against demo.wcpos.com

- **Date:** 2026-11-17 (refresh of the 2026-11-10 round) · **Owner:** the
  TallyUI shared-libraries worker
- **Reference:** WCPOS 2.0.0 at `https://demo.wcpos.com/pos`; its source is
  `packages/core/src/screens/main` in the WCPOS monorepo.
- **Compared:** Tally Woo, medusapos (`https://demo.medusapos.com`) and
  vendurepos (`https://demo.vendurepos.com`), as a cashier sees them today.
- **Plan:** each row names the unit in [PLAN.md](PLAN.md) or the merged
  TallyUI PR that closes it, or `new` when nothing covers it yet.

Every row has:

- a **status**:
  - `match`: a cashier would not notice a difference. It is given only with a
    fresh demo screenshot beside v2's.
  - `close`: the same job gets done, with a different look or one step more.
  - `gap`: the screen exists but misses something a v2 cashier uses.
  - `missing`: there is no such screen or control.
  - `not reachable`: no public demo to look at (Tally Woo, see below).
- a **kind**:
  - `feature`: the cashier cannot do the job, or does it another way;
  - `visual`: the job is the same, but the screen looks or is laid out
    differently;
  - `motion`: v2 animates something that the app snaps or does not show.
- a **fix location**: `@tallyui/components` when one shared change reaches
  every app, or the one app (`medusapos`, `vendurepos`) when the shared part
  already exists and the app has not adopted it or the gap is its own.

## How each app was reached

- **v2:** `https://demo.wcpos.com/pos`. Sign in with the user name and
  password the WordPress sign-in page prints for the public demo, then join
  the "Front Counter" register. Every shot uses one open cart (order #35898,
  "POS - Open", one Affirm Water Bottle). Nothing was paid, refunded, closed
  or saved there: the tender, refund and register-close screens were opened
  and then left. The motion clip that adds a line removed that line again.
- **medusapos:** `https://demo.medusapos.com`, then "Enter the demo" as the
  cashier. The register was opened with a 100 float. To reach the receipt,
  one cash sale of a Butter Croissant was completed. The close count was
  started and left with "Back to selling".
- **vendurepos:** `https://demo.vendurepos.com`, then "Enter the demo". The
  register was opened with a 100 float. To reach the receipt, orders and
  refund screens, one cash sale of a Cold Brew was completed. The refund form
  was opened and closed without refunding.
- **Tally Woo:** `not reachable`, so every row reads `not reachable`.
  - The README's demo (`https://tallyui-woocommerce.vercel.app`) asks for a
    WCPOS cashier account, and none is public.
  - The demo store that the Tally Woo repo's ADR 0007 names is behind a
    password kept outside the repos.
  - The Tally Woo screens below are still from 2026-11-10.

The screenshots are JPEG at quality 70:

- 1280x800, plus 390x844 for the phone sale screen;
- taken on 2026-11-17 between 15:00 and 16:10 CET;
- taken with Playwright Chromium, using scratch scripts kept outside the repo
  (the 2026-11-10 round used [`scripts/parity/capture.mjs`](../../scripts/parity/capture.mjs));
- with demo passwords printed on a sign-in page masked before the shot.

Motion clips are GIFs of a Playwright video:

- recorded at 1280x800 (and 1280x720 for the keypad), saved at half size;
- each under 1 MB;
- in `screens/<app>/motion/`.

## Scoreboard

There are 30 screen sections and 5 motion rows. The counts are per app.

| App | match | close | gap | missing | not reachable |
|---|---|---|---|---|---|
| Tally Woo | 0 | 0 | 0 | 0 | 35 |
| medusapos | 1 | 16 | 14 | 4 | 0 |
| vendurepos | 1 | 19 | 13 | 2 | 0 |

Rows that are not `match`, by kind:

| App | feature | visual | motion | open in all |
|---|---|---|---|---|
| medusapos | 17 | 12 | 5 | 34 |
| vendurepos | 17 | 12 | 5 | 34 |

What changed since 2026-11-10:

- Both apps now have v2's shell, from the shared components merged since
  then:
  - the icon rail;
  - the QTY/ITEM/PRICE/TOTAL cart table;
  - one Checkout button;
  - open orders as tabs;
  - the line keypads with −5/−10/−15%;
  - the register side sheet;
  - a Reports screen;
  - ten themes.
- The open rows are now:
  - the tender and split flow;
  - receipts;
  - coupons;
  - the category tiles, merged in #823 but not adopted by either app;
  - offline;
  - motion: v2 animates its lines, sheets and lists, and TallyUI draws them
    with no enter or exit animation;
  - a set of rows only medusapos misses (orders, order detail, refund,
    customers) and two only vendurepos misses (cart note, cashier sheet).

## Next, by what a cashier notices first

Shared rows first: one fix reaches both apps.

1. **Category tiles** ([Categories](#categories); visual; each app adopts #823).
   The first screen shows a row of chips. In v2 it is coloured tiles with
   product counts.
2. **Tile press and add feedback**
   ([Motion: product tile press and add](#motion-product-tile-press-and-add);
   motion; `@tallyui/components`).
   - v2 shows a count badge on the tile and an "added to cart" toast.
   - medusapos shows neither.
   - Neither app has a press state.
3. **Cart line enter and leave**
   ([Motion: cart line enter and leave](#motion-cart-line-enter-and-leave);
   motion; `@tallyui/components`). v2 lines swipe and fly off when removed.
   In both apps a line pops in and vanishes.
4. **Tender** ([Tender](#tender); visual; `@tallyui/components`). v2 replaces
   the products column with the tender pane and turns the cart into a
   payments ledger. The apps tender inside the cart column, and Complete sale
   is a separate step. PLAN unit 16 is merged; v2's layout is `new`.
5. **Split payment** ([Split payment](#split-payment); feature;
   `@tallyui/components`). It is missing in both apps; vendurepos's demo card
   still advertises it. PLAN units 14 and 16 are merged; it needs adoption.
6. **Receipt** ([Receipt and print](#receipt-and-print); feature;
   `@tallyui/components`). There is no template, printer, email or PDF.
   PLAN unit 28 is partly done; 29 is merged.
7. **Coupon** ([Coupon](#coupon); feature; each app). Shared coupons
   (#712–#792) are merged, but neither demo offers a coupon code.
8. **Offline** ([Offline](#offline); feature; `@tallyui/components`). Nothing
   says the till is offline. PLAN unit 34 (34b, 34c).
9. **Sheet and modal open and close**
   ([Motion: sheet and modal open and close](#motion-sheet-and-modal-open-and-close);
   motion; `@tallyui/components`).
10. **Lists and skeletons**
    ([Motion: list transitions and skeletons](#motion-list-transitions-and-skeletons);
    motion; `@tallyui/components`).
11. **Products screen** ([Products](#products); feature;
    `@tallyui/components`). Both apps have only the read-only table on the
    sale screen.
12. **Filter pills** ([Product search and scan](#product-search-and-scan);
    feature; `@tallyui/components`). There is no Featured, On Sale, Category,
    Tag or Brand pill.

Rows only one app has:

13. **Keypad over the till**
    ([Motion: price keypad over the till](#motion-price-keypad-over-the-till);
    vendurepos). A white backdrop blanks the products and the cart behind the
    keypad, at both 1280x800 and 1280x720.
14. **medusapos orders, order detail and refund** ([Orders list](#orders-list),
    [Order detail](#order-detail), [Refund](#refund); medusapos). The app has
    a "Recent" card list only: no detail and no refund. It needs the Medusa
    `listOrders` connector unit.
15. **vendurepos cart note** ([Cart note](#cart-note); vendurepos). The app
    should adopt the cart note row (#820).
16. **vendurepos cashier sheet**
    ([Cashier switch and sign-out](#cashier-switch-and-sign-out); vendurepos).
    It has email, store and Sign out only.

## Audit disagreements

Each app keeps its own audit. All three were last dated 2026-11-10 and were
read here without changes.

- **medusapos** `AUDIT.md` (and `DEMO-PARITY.md`, 2026-11-16, "1/44 match")
  disagrees with the demo:
  - it says Reports are missing, but there is a Reports screen;
  - it says Theme is missing, but there are ten themes;
  - it says tender has no keypad, but the tender pane has one;
  - it says open orders are missing, but there are sale tabs;
  - it says offline is "Has", but no offline indicator shows.
- **vendurepos** `AUDIT.md` (and `CHECKLIST.md`, "21/56") disagrees with the
  demo:
  - it says there is no order detail view, but there is a detail page;
  - it says refund has no till UI, but there is an inline refund;
  - it says Customers, Reports and Theme are missing, but all three exist;
  - it says offline is "Present", but no indicator shows;
  - the demo card offers "Split a payment", but the tender has no Split.
- **Tally Woo** `AUDIT.md` (DEMO-PARITY round 15, "No row reached match")
  cannot be checked: there is no reachable demo.

---

## Login and store pick

**v2:** a WordPress sign-in page, then a "which register are you at" list
for a new device.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| Tally Woo | not reachable | feature | | The demo asks for a WCPOS cashier account. |
| medusapos | close | feature | medusapos | A demo page with "Enter the demo" (cashier or manager), then a register card on the sale screen. |
| vendurepos | close | feature | vendurepos | A demo card with one "Enter the demo" button; the register opens straight onto an opening-float form. |

| v2 | Tally Woo (11-10) | medusapos | vendurepos |
|---|---|---|---|
| ![v2 sign-in](screens/v2/login.jpg) | ![Tally Woo connect](screens/tally-woo/login.jpg) | ![medusapos demo page](screens/medusapos/login.jpg) | ![vendurepos demo page](screens/vendurepos/login.jpg) |
| ![v2 register pick](screens/v2/store-pick.jpg) | ![Tally Woo refused](screens/tally-woo/store-pick.jpg) | ![medusapos register pick](screens/medusapos/store-pick.jpg) | (one demo store, no pick) |

**Closes it:** PLAN unit 31 (register directory) is merged in core.
`listRegisters()` is not started in any connector. The sign-in itself is
each platform's own.

## Sale screen, wide

**v2:**
- an icon rail;
- products and cart in two columns;
- photo tiles;
- filter pills;
- the QTY/ITEM/PRICE/TOTAL cart table with taxes per rate;
- one "Checkout $X" button;
- open orders as tabs under the cart.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | visual | medusapos | The shell matches v2 (rail, cart table, Checkout, tabs). The tiles are text only, with no photos. |
| vendurepos | close | visual | `@tallyui/components` | The same shell, with photo tiles. There is a title bar with "Sync now" and "Register ›" over the rail, and the cart column is narrower. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/sale-wide.jpg) | ![medusapos](screens/medusapos/sale-wide.jpg) | ![vendurepos](screens/vendurepos/sale-wide.jpg) |

**Closes it:**
- the shell: done (#631, #637, #643, #644, #686, #723, #765–#768,
  #772–#775);
- photos: medusapos maps product thumbnails into its tiles.

## Sale screen, phone

**v2:** at 390 px, products and cart are two bottom tabs, and the cart tab
carries the total.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | visual | `@tallyui/components` | Products fill the screen, with a "Cart · 1 item €2.50 ›" bar instead of tabs. |
| vendurepos | close | visual | `@tallyui/components` | Products and Cart are tabs at the top, not the bottom. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/sale-phone.jpg) | ![medusapos](screens/medusapos/sale-phone.jpg) | ![vendurepos](screens/vendurepos/sale-phone.jpg) |

**Closes it:** PLAN unit 4 (Scale) is merged. One bottom-tab layout in the
shared shell is `new`.

## Product search and scan

**v2:** one search box with a scan button and filter pills (In Stock,
Featured, On Sale, Category, Tag, Brand); results stay as tiles.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | feature | `@tallyui/components` | "Search or scan barcode / SKU" filters the tiles; only an In Stock pill. |
| vendurepos | close | feature | `@tallyui/components` | The same, plus a scan button; only an In Stock pill. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/search.jpg) | ![medusapos](screens/medusapos/search.jpg) | ![vendurepos](screens/vendurepos/search.jpg) |

**Closes it:**
- the scanner: done (#692–#734, #825–#828);
- the Featured, On Sale, Tag and Brand pills: `new`. On Woo, the term-feeds
  connector unit carries their data.

## Categories

**v2:** the product column opens on coloured category tiles with a product
count ("Clothing · 160 products"), then a breadcrumb.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | visual | medusapos | A row of chips (All products, Bakery, …); no tiles, counts or nesting. |
| vendurepos | gap | visual | vendurepos | The same chips. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/categories.jpg) | ![medusapos](screens/medusapos/categories.jpg) | ![vendurepos](screens/vendurepos/categories.jpg) |

**Closes it:** the category browse in components is merged (#823, on #634).
Each app adopts it.

## Variable product

**v2:** the tile drills into the product, with attribute chips (size, colour)
to pick the variation.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | visual | `@tallyui/components` | A "from €10.00" tile opens a list of variants (name, price, stock) over the grid. |
| vendurepos | close | visual | `@tallyui/components` | The same variant list. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/variable.jpg) | ![medusapos](screens/medusapos/variable.jpg) | ![vendurepos](screens/vendurepos/variable.jpg) |

**Closes it:** the variations popover (#736) is merged. The attribute chips
are `new` (attributes on the line are #495, needs-paul).

## Cart line: quantity

**v2:** the QTY box opens a keypad beside the line, with − and + and a trash
button.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | visual | `@tallyui/components` | A keypad popover with Remove, Apply and Cancel buttons instead of −, + and trash. |
| vendurepos | close | visual | `@tallyui/components` | The same keypad, with Discount added. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/line-quantity.jpg) | ![medusapos](screens/medusapos/line-quantity.jpg) | ![vendurepos](screens/vendurepos/line-quantity.jpg) |

**Closes it:** the keypad is done. The −, + and trash buttons and dropping
Apply are `new`.

## Cart line: price and discount

**v2:** the price opens a keypad with −5%, −10% and −15%. The keypad applies
as you type, and the old price shows struck through. There is no separate
line-discount form.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | visual | `@tallyui/components` | The same keypad and quick discounts, plus Discount, Apply and Cancel buttons. |
| vendurepos | close | visual | `@tallyui/components` | The same. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/line-price.jpg) | ![medusapos](screens/medusapos/line-price.jpg) | ![vendurepos](screens/vendurepos/line-price.jpg) |

**Closes it:** the keypad is done. Applying as you type is `new`; see also
[Motion: price keypad over the till](#motion-price-keypad-over-the-till).

## Fee and shipping

**v2:** the cart's "+" menu holds Add new customer, Misc product, Fee,
Discount and Shipping. The fee sheet has a name, an amount in $ or %,
"Amount includes tax" and a tax rate.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | feature | medusapos | The "+" menu holds Misc product, Fee, Discount and Shipping. The fee is a small modal with a name and an EUR amount: no %, no tax. |
| vendurepos | close | feature | vendurepos | "Add charge" expands inline (Fee, Shipping, Custom item), with a name, an amount and tax-class chips; no %. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2 menu](screens/v2/fee-shipping.jpg) | ![medusapos](screens/medusapos/fee-shipping.jpg) | ![vendurepos](screens/vendurepos/fee-shipping.jpg) |
| ![v2 fee](screens/v2/fee.jpg) | ![medusapos fee](screens/medusapos/fee.jpg) | ![vendurepos fee](screens/vendurepos/fee.jpg) |

**Closes it:** `new` (fee tax and percent in medusapos).

## Coupon

**v2:** "Add Discount" has two tabs, Quick discount and Coupon; the coupon
tab picks from the store's coupons.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | feature | medusapos | A Discount entry in the "+" menu; the cart's ⋮ menu holds Void only. No coupon code anywhere. |
| vendurepos | gap | feature | vendurepos | "Order discount" (Percent or Amount) inline; no coupon code. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/coupon.jpg) | ![medusapos](screens/medusapos/coupon.jpg) | ![vendurepos](screens/vendurepos/coupon.jpg) |

**Closes it:**
- shared coupons are merged (#712, #725, #787, #791, #792);
- each app wires its platform's promotions to them (Medusa promotions,
  Vendure coupon codes).

## Customer pick

**v2:** "Customer: Guest" in the cart header opens a search dropdown over the
store's customers, with an address button beside it.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | visual | `@tallyui/components` | "Customer: Guest" opens a modal with a search and "New customer". |
| vendurepos | close | visual | `@tallyui/components` | The search opens inline above the cart, with "New customer". |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/customer.jpg) | ![medusapos](screens/medusapos/customer.jpg) | ![vendurepos](screens/vendurepos/customer.jpg) |

**Closes it:** `new` (one dropdown picker in components).

## Customer create

**v2:** "Add new customer" in the "+" menu opens a full form: name, email,
phone, and billing and shipping addresses.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | feature | `@tallyui/components` | A "New customer" modal: first and last name, email, phone; no addresses. |
| vendurepos | close | feature | `@tallyui/components` | The same short form, inline. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/customer-create.jpg) | ![medusapos](screens/medusapos/customer-create.jpg) | ![vendurepos](screens/vendurepos/customer-create.jpg) |

**Closes it:** PLAN unit 7 (`updateCustomer` with addresses) is merged, as
are its connector units (#611, #613, #614). The address fields in the form
are `new`.

## Cart note

**v2:** the cart's Order details sheet holds:
- a customer note;
- the hand-over block (status, cashier, store, register);
- tax exempt and hidden fields;
- Void, Close, Print and Sync order.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | feature | medusapos | An "Order note" field over the cart lines; no hand-over, tax exempt or sync. |
| vendurepos | missing | feature | vendurepos | "Order details" holds only Void and Close; no note. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/note.jpg) | ![medusapos](screens/medusapos/note.jpg) | ![vendurepos](screens/vendurepos/note.jpg) |

**Closes it:**
- PLAN unit 6 and the cart note row (#820) are merged, and vendurepos adopts
  them;
- the hand-over block and tax exempt are `new`.

## Park and open orders

**v2:** every open sale is a tab under the cart ("Guest $16.83 · 5 h"), with
a count and a "+" for a new one.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | visual | `@tallyui/components` | Tabs under the cart with a "+", plus a parked-sales chip; no ages. |
| vendurepos | close | visual | `@tallyui/components` | Tabs under the cart plus "Parked (1)" over the cart. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/open-orders.jpg) | ![medusapos](screens/medusapos/open-orders.jpg) | ![vendurepos](screens/vendurepos/open-orders.jpg) |

**Closes it:** done (PLAN unit 19). The tab ages are `new`.

## Tender

**v2:**
- the tender pane replaces the products column: Payments and Legacy tabs, a
  "TO PAY" headline with Split, method tiles, quick-cash chips, a keypad and
  "Take $16.83 in Cash";
- the cart side becomes a payments ledger;
- the sale completes when it is paid.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | visual | `@tallyui/components` | Tender sits inside the cart column: Cash and Card terminal, chips, a keypad, "Take", then a separate "Complete sale" and Back. There is no ledger beyond "No payments yet". |
| vendurepos | gap | visual | `@tallyui/components` | The same pane across the full width. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/tender.jpg) | ![medusapos](screens/medusapos/tender.jpg) | ![vendurepos](screens/vendurepos/tender.jpg) |

**Closes it:** PLAN units 14, 15, 16 and 17 are merged: legs, rounding, the
keypad and chips, and the driver. Unit 18 (terminal leg view) is not
started. v2's layout is `new`:
- the pane over the products column;
- the cart as the ledger;
- the sale completes when paid.

## Split payment

**v2:** "Split" on the TO PAY headline. Each payment is a leg in the ledger,
and a leg can be voided.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | missing | feature | `@tallyui/components` | There is no Split control on the tender pane. |
| vendurepos | missing | feature | `@tallyui/components` | There is no Split control, although the demo card says "Split a payment". |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/split.jpg) | (no split control) | (no split control) |

**Closes it:** PLAN units 14 (payment legs) and 16 are merged, but neither
demo shows a split. Adopt it in each app, or add a Split entry to the
shared pane if the merged pane lacks one (`new`).

## Receipt and print

**v2:** a Receipt sheet with a template choice, a printer, a preview, Email,
Download PDF and Print.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | feature | `@tallyui/components` | A centred card with "Email receipt", "Print receipt" and "New sale". No preview, template or PDF. |
| vendurepos | gap | feature | `@tallyui/components` | A receipt in the cart column with "Print receipt" and "New sale". No email, template or PDF. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/receipt.jpg) | ![medusapos](screens/medusapos/receipt.jpg) | ![vendurepos](screens/vendurepos/receipt.jpg) |

**Closes it:**
- PLAN unit 28 is partly done (#609: no refund, Z or report defaults); 29 and
  38 are merged, but neither app offers a template or a printer;
- the Medusa `emailReceipt` connector unit.

## Orders list

**v2:** a table of the store's orders. Filters: status, payment method,
customer, cashier, store, register and date. It pages through the server's
history.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | feature | medusapos | A "Recent" card list of this till's sales only ("No sales yet" until one is made). |
| vendurepos | close | feature | vendurepos | An "All orders / This till" table with Status, Customer, Cashier, register and Date filters. There is no payment-method filter. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/orders.jpg) | ![medusapos](screens/medusapos/orders.jpg) | ![vendurepos](screens/vendurepos/orders.jpg) |

**Closes it:**
- medusapos: the Medusa `listOrders` connector unit (not started);
- vendurepos: done (#595).

## Order detail

**v2:** a side sheet with View, Edit and JSON tabs: lines, totals and
payments, plus Delete, Refund, Sync, Close, Receipt and Re-open.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | missing | feature | medusapos | A "Recent" card does not open. |
| vendurepos | close | feature | vendurepos | A full page with lines, totals and paid, "Refund items", "Receipt" and "Back to orders". No Re-open or Sync. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/order-detail.jpg) | ![medusapos](screens/medusapos/order-detail.jpg) | ![vendurepos](screens/vendurepos/order-detail.jpg) |

**Closes it:**
- PLAN unit 20, and the Medusa `listOrders` unit;
- Re-open is ADR-090 (#833–#852, open #853).

## Refund

**v2:** a refund sheet: quantity per line, a custom amount, a reason, and
Process Refund.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | missing | feature | medusapos | There is no order to refund from. |
| vendurepos | close | feature | vendurepos | Inline on the order page: a quantity per item, a restock switch, a reason, Refund and Cancel. There is no custom amount. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/refund.jpg) | (no refund control) | ![vendurepos](screens/vendurepos/refund.jpg) |

**Closes it:** PLAN units 9, 20 and 21 are merged. medusapos needs its
orders (`listOrders`) first.

## Customers

**v2:** a Customers screen in the rail: a searchable table (name, email,
billing address, date created) and an add button.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | feature | medusapos | A Customers screen that stays empty until a search, plus "Add customer". |
| vendurepos | close | feature | vendurepos | A customers table with search (#822). |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/customers.jpg) | ![medusapos](screens/medusapos/customers.jpg) | ![vendurepos](screens/vendurepos/customers.jpg) |

**Closes it:**
- vendurepos: done (#822);
- medusapos: lists the store's customers on open, `new`.

## Products

**v2:** a Products screen in the rail: a table with stock, a manage-stock
switch, variations and prices, edited in place.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | feature | `@tallyui/components` | Only the sale screen's "Table" view, read-only. |
| vendurepos | gap | feature | `@tallyui/components` | The same read-only table view. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/products.jpg) | ![medusapos](screens/medusapos/products.jpg) | ![vendurepos](screens/vendurepos/products.jpg) |

**Closes it:** `new` (a products screen; stock edits are each platform's own
API).

## Register: open, cash in and out

**v2:** the register side sheet: the drawer total, Paid in, Paid out, No
sale, the expected cash, Print X-report and Close register.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | match | visual | | The same side sheet: drawer total, session sales, Paid in, Paid out, No sale, float, expected, Print X-report, Close register. |
| vendurepos | match | visual | | The same side sheet. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/register.jpg) | ![medusapos](screens/medusapos/register.jpg) | ![vendurepos](screens/vendurepos/register.jpg) |

**Closes it:** done (#735). v2's "Other tenders" line is the only extra.

## Register close (X and Z)

**v2:** the close sheet: a keypad cash count, a note, "Count by notes and
coins", and "Close & print".

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | visual | `@tallyui/components` | A grid of notes and coins first, with "Back to selling" and "Close register"; no keypad-first count. |
| vendurepos | close | visual | `@tallyui/components` | The same count. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/register-close.jpg) | ![medusapos](screens/medusapos/register-close.jpg) | ![vendurepos](screens/vendurepos/register-close.jpg) |

**Closes it:** PLAN unit 13 (manager approval) is merged. Units 32 (recount)
and 27 (closures) are not started. The keypad-first count is `new`.

## Reports

**v2:** a Reports screen: a hero total, a sales chart, Orders, Payments and
Where-sold cards, and Print summary.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | visual | `@tallyui/components` | The same layout of hero and cards, with fewer cards. |
| vendurepos | close | visual | `@tallyui/components` | The same. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/reports.jpg) | ![medusapos](screens/medusapos/reports.jpg) | ![vendurepos](screens/vendurepos/reports.jpg) |

**Closes it:** PLAN unit 25 is done; units 26 and 27 remain.

## Settings: display, theme and scale

**v2:** Settings › Theme: ten themes, Scale, and icon sets.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | visual | medusapos | Theme with the ten themes; no Scale or icon set. |
| vendurepos | close | visual | vendurepos | General (prices, quick discounts, products per row) and Theme; no Scale. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/settings-display.jpg) | ![medusapos](screens/medusapos/settings-display.jpg) | ![vendurepos](screens/vendurepos/settings-display.jpg) |

**Closes it:** PLAN unit 22 (on 3, 4 and 5) is merged. Each app adopts the
Scale section.

## Settings: printers

**v2:** Settings › Printing: printers, paper width, auto-print and receipt
templates.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | missing | feature | `@tallyui/components` | Settings has Store, Register, Scanner, Theme and Danger zone; no printing. |
| vendurepos | gap | feature | `@tallyui/components` | Printing holds one "Print after each sale" switch. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/settings-hardware.jpg) | (no section) | ![vendurepos](screens/vendurepos/settings-hardware.jpg) |

**Closes it:** PLAN units 29 (print transport) and 38 (ESC/POS) are merged.
A Printing settings section with printers and templates is `new`.

## Settings: barcode

**v2:** Settings › Barcode Scanning: the key-timing threshold, minimum
length, prefix and suffix, sound, direct connection, and a test field.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | feature | `@tallyui/components` | Scanner: average time per key, minimum characters and a test field; no prefix, suffix or sound. |
| vendurepos | close | feature | `@tallyui/components` | Scanner: minimum length, prefix, suffix, sounds and a test field; no key timing. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/settings-barcode.jpg) | ![medusapos](screens/medusapos/settings-barcode.jpg) | ![vendurepos](screens/vendurepos/settings-barcode.jpg) |

**Closes it:** PLAN unit 39 (barcode settings section and test panel) is
not started. The shared scanner rules are merged (#825–#827).

## Cashier switch and sign-out

**v2:** the avatar opens a user sheet:
- sales today;
- "Hand the till to" another cashier;
- the store switch;
- Sign out.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | feature | medusapos | Sales today, the drawer, "Hand the till to the next cashier" and Sign out; no store switch. |
| vendurepos | gap | feature | vendurepos | The email, the store and Sign out only. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/cashier.jpg) | ![medusapos](screens/medusapos/cashier.jpg) | ![vendurepos](screens/vendurepos/cashier.jpg) |

**Closes it:** the shared sheet is ready-queue row S9: `CashierSheet` (S9a,
#982) has the header, Your sales today and Sign out; the rest of v2's sheet
(S9b–d) is open. PLAN unit 33 is the handover slip and switch confirm, not
the sheet. vendurepos adopts the sheet (`cashier()` is not started in any
connector).

## Offline

**v2:** with the network gone, a "Device went offline" toast and an Offline
pill; search and sales carry on.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | feature | `@tallyui/components` | Search carries on, but nothing says the till is offline: the footer keeps "Sales are up to date". |
| vendurepos | gap | feature | `@tallyui/components` | The same; no indicator. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/offline.jpg) | ![medusapos](screens/medusapos/offline.jpg) | ![vendurepos](screens/vendurepos/offline.jpg) |

**Closes it:** PLAN unit 34 (34a is partly done, #636; 34b and 34c are not
started). Unit 23 (outbox health) is merged.

---

## Motion

v2 animates with Reanimated: springs, layout entering and exiting, and
skeletons. TallyUI's `packages/components/src` has none of these: no
`entering`/`exiting`, no `withSpring`/`withTiming`, no Skeleton. It has only
CSS classes:
- `transition-colors` (button, icon-button, nav-item, table, toggle);
- `transition-opacity` (toast);
- `transition-all` (tabs, accordion, collapsible, progress);
- `animate-spin` (loader).

All five rows are `@tallyui/components` work. Any motion added honours the
platform's reduce-motion setting, as v2's does.

Each clip is shown v2 | medusapos | vendurepos.

### Motion: product tile press and add

**v2:** a press on the tile adds the line. The tile gets a count badge, and
an "added to cart" toast slides in.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | motion | `@tallyui/components` | No press state, no count badge, no toast; the line just appears. |
| vendurepos | gap | motion | `@tallyui/components` | A count badge and a toast; no press state. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/motion/add-line.gif) | ![medusapos](screens/medusapos/motion/add-line.gif) | ![vendurepos](screens/vendurepos/motion/add-line.gif) |

### Motion: cart line enter and leave

**v2:** the source shows lines that can be swiped, peeked with a spring and
flown off on removal (`pos/cart/cells/line-strip.tsx:177-261`, reduce-motion
aware). Open-order tabs fade in and out (`pos/cart/tabs.tsx:127, 446`).

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | motion | `@tallyui/components` | A line pops in; Remove makes it vanish. |
| vendurepos | gap | motion | `@tallyui/components` | The same. |

The same clips as above (add, then remove the line).

### Motion: sheet and modal open and close

**v2:** the Add Fee sheet slides from the left over a scrim. The register
sheet slides from the right, and Escape closes it.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | motion | `@tallyui/components` | Add Fee is a centred modal; the modal and the register sheet appear and go with no slide. |
| vendurepos | gap | motion | `@tallyui/components` | The register sheet appears with no slide; Add charge expands inline. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/motion/sheets.gif) | ![medusapos](screens/medusapos/motion/sheets.gif) | ![vendurepos](screens/vendurepos/motion/sheets.gif) |

### Motion: list transitions and skeletons

**v2:** the source shows skeleton rows while data loads:
- cart rows (`pos/cart/index.tsx:54`);
- products (`pos/products/index.tsx:391`);
- syncing table rows (`components/data-table/index.tsx:405`);
- the checkout title (`checkout-column.tsx:46`).

The products and checkout columns roll or crossfade
(`pos/columns/pos-columns.tsx:123`), and categories drill with a "deal"
animation (`pos/products/deal-stack.tsx`). The clip goes Sale → Orders →
Customers → Sale.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | gap | motion | `@tallyui/components` | Screens swap at once; an empty list shows until the data comes; no skeletons. |
| vendurepos | gap | motion | `@tallyui/components` | The same. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/motion/lists.gif) | ![medusapos](screens/medusapos/motion/lists.gif) | ![vendurepos](screens/vendurepos/motion/lists.gif) |

### Motion: price keypad over the till

**v2:** the price keypad opens as a popover beside the line; the cart and
the products stay visible behind it.

| App | Status | Kind | Fix in | What differs |
|---|---|---|---|---|
| medusapos | close | motion | `@tallyui/components` | The popover opens beside the line and the till stays visible; there is no open animation. |
| vendurepos | gap | motion | `@tallyui/components` | The popover opens low on the left. A white backdrop blanks the products grid and the cart below the popover's top edge, at 1280x800 and at 1280x720. This confirms the Steward's report. |

| | v2 | medusapos | vendurepos |
|---|---|---|---|
| 1280x800 | ![v2](screens/v2/motion/keypad.gif) | ![medusapos](screens/medusapos/motion/keypad.gif) | ![vendurepos](screens/vendurepos/motion/keypad.gif) |
| 1280x720 | ![v2](screens/v2/motion/keypad-720.gif) | ![medusapos](screens/medusapos/motion/keypad-720.gif) | ![vendurepos](screens/vendurepos/motion/keypad-720.gif) |

**Closes it:** check why vendurepos's popover renders a page-wide white
layer. The likely suspects are the modal scrim token (#779) or the popover
dismiss layer (#829). Neither is confirmed: it is `new`.
