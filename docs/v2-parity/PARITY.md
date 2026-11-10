# v2 parity checklist: screen by screen against demo.wcpos.com

- **Date:** 2026-11-10 · **Owner:** the TallyUI shared-libraries worker
- **Reference:** WCPOS 2.0.0 at `https://demo.wcpos.com/pos`.
- **Compared:** Tally Woo, medusapos (`https://demo.medusapos.com`) and
  vendurepos (`https://demo.vendurepos.com`), as a cashier sees them.
- **Plan:** each gap names the unit in [PLAN.md](PLAN.md) that closes it, or
  `new` when no unit covers it yet.

Status words:

- `match`: a cashier would not notice a difference.
- `close`: the same job gets done, with a different look or one step more.
- `gap`: the screen exists but misses something a v2 cashier uses.
- `missing`: there is no such screen or control.
- `not reachable`: no public demo to look at (Tally Woo, see below).

## How each app was reached

- **v2:** `https://demo.wcpos.com/pos`, signed in with the user name and
  password the WordPress sign-in page prints for the public demo, at the
  first register offered. The script keeps one open cart (order #35631, "POS -
  Open") and reuses it on every run. Nothing was paid, refunded, closed or
  saved there: the tender, refund and register-close screens were opened and
  left.
- **medusapos:** `https://demo.medusapos.com/demo`, "Enter the demo" (the
  cashier account the page prints). The register was opened with a 100 float.
  One cash sale of a Butter Croissant (order 38680eb2) was completed to reach
  the receipt; the close count was started and left with "Back to selling".
  The first sign-in of a fresh browser finds the till held by the script's
  own earlier browser ("open on another till"); the script takes it over only
  when the register list says "Not opened".
- **vendurepos:** `https://demo.vendurepos.com/demo`, "Enter the demo" (the
  page's public demo account; its data stays in the browser). The register
  was opened with a 100 float. One cash sale of a Tally Fixture Mug (order
  04ee2803) was completed to reach the receipt; the close count was started
  and left with "Back to selling".
- **Tally Woo:** `login needed`, so every row is `not reachable`. The app
  (`https://tallyui-woocommerce.vercel.app`) has no demo store of its own. The
  only public WooCommerce store, demo.wcpos.com, answers its connect request
  with "Missing or invalid redirect_uri parameter" (screens below), and the
  store the app is tested against needs a private login. To reach it, one of:
  a public Woo demo store whose sign-in page prints its demo login, or
  demo.wcpos.com accepting the Tally Woo redirect address.

Screenshots are 1280x800, plus 390x844 for the phone sale screen, made by
[`scripts/parity/capture.mjs`](../../scripts/parity/capture.mjs). The demo
sign-in pages print their demo passwords; the script masks them before each
screenshot.

## Scoreboard

30 sections.

| App | match | close | gap | missing | not reachable |
|---|---|---|---|---|---|
| Tally Woo | 0/30 | 0 | 0 | 0 | 30 |
| medusapos | 0/30 | 13 | 12 | 5 | 0 |
| vendurepos | 0/30 | 14 | 10 | 6 | 0 |

No section is a `match` yet: both apps are built from the same TallyUI
components, and those still draw the pre-v2 sale screen.

## Next, by what a cashier notices first

1. **Tender pane** (medusapos, vendurepos; [Tender](#tender)): no method
   tiles, keypad or "Take $X in Cash" button. PLAN unit 16 (on 14).
2. **Sale screen shell** (medusapos, vendurepos;
   [Sale screen, wide](#sale-screen-wide)): a text top bar instead of the
   icon rail, a plain cart list instead of the QTY/ITEM/PRICE/TOTAL table,
   two pay buttons instead of one Checkout button. `new` (PLAN A1 names the
   shell; no unit yet).
3. **Open orders as tabs** (medusapos, vendurepos;
   [Park and open orders](#park-and-open-orders)): a "Parked sales" dialog
   instead of tabs under the cart. PLAN unit 19.
4. **Line keypad and quick discounts** (medusapos, vendurepos;
   [Cart line: price and discount](#cart-line-price-and-discount)): a form
   with a currency field instead of the keypad with −5/−10/−15%. `new`.
5. **Receipt preview and print** (medusapos, vendurepos;
   [Receipt and print](#receipt-and-print)): a plain receipt with "Print
   receipt", no template, printer choice, email or PDF. PLAN units 28 and 29;
   Medusa `emailReceipt` connector unit.
6. **Refund** (medusapos, vendurepos; [Refund](#refund)): no refund action
   anywhere. PLAN units 9, 20 and 21.
7. **Cart note** (medusapos, vendurepos; [Cart note](#cart-note)): no way to
   add a note. PLAN unit 6.
8. **Cashier switch** (medusapos, vendurepos;
   [Cashier switch and sign-out](#cashier-switch-and-sign-out)): sign-out
   only, no hand-over or switch. PLAN unit 33 (on 30).
9. **Offline state** (medusapos, vendurepos; [Offline](#offline)): no offline
   dot or toast; the footer keeps saying "up to date". PLAN unit 34 (and 23).
10. **Split payment** (medusapos, vendurepos; [Split payment](#split-payment)):
    a separate split pane instead of payment legs in one ledger. PLAN units
    14 and 16.
11. **Order detail and its actions** (medusapos, vendurepos;
    [Order detail](#order-detail)): a row that unfolds, with no Receipt,
    Refund, Re-open or Sync. PLAN unit 20, Medusa `listOrders`/`getOrders`
    and the Vendure orders connector units.
12. **Reports** (medusapos, vendurepos; [Reports](#reports)): a sales count
    and "Print X report" instead of the chart and cards. PLAN units 25, 26
    and 27.
13. **Theme and Scale** (medusapos, vendurepos;
    [Settings: display, theme and scale](#settings-display-theme-and-scale)):
    no theme, scale or font choice. PLAN unit 22 (on 3, 4 and 5).
14. **Customers screen** (medusapos, vendurepos; [Customers](#customers)):
    none. `new`.
15. **Coupons** (medusapos, vendurepos; [Coupon](#coupon)): an order discount
    only, no coupon picker. `new` (#501).

---

## Login and store pick

**v2:** a WordPress sign-in page, then a "which register are you at" list
for a new device.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | The connect screen asks for a store URL; demo.wcpos.com refuses its redirect address. |
| medusapos | close | A demo page with "Enter the demo" (cashier or manager) instead of a sign-in form; the register is picked in a "Choose a register" card on the sale screen. |
| vendurepos | close | The same demo page with one "Enter the demo" button; the register opens straight onto an opening-float form. |

| v2 | Tally Woo | medusapos | vendurepos |
|---|---|---|---|
| ![v2 sign-in](screens/v2/login.jpg) | ![Tally Woo connect](screens/tally-woo/login.jpg) | ![medusapos demo page](screens/medusapos/login.jpg) | ![vendurepos demo page](screens/vendurepos/login.jpg) |
| ![v2 register pick](screens/v2/store-pick.jpg) | ![Tally Woo refused](screens/tally-woo/store-pick.jpg) | ![medusapos register pick](screens/medusapos/store-pick.jpg) | ![vendurepos register pick](screens/vendurepos/store-pick.jpg) |

**Closes it:** PLAN unit 31 (register directory) for the pick; the sign-in
itself is each platform's own.

## Sale screen, wide

**v2:** an icon rail on the left; products and cart in two resizable
columns; product tiles with photos; filter pills (In Stock, Featured, On
Sale, Tag, Brand); a cart table (QTY, ITEM, PRICE, TOTAL) with taxes per
rate; one "Checkout $X" button; open orders as tabs under the cart.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | A text top bar (Products, Orders, Reports, Settings, Sign out); text tiles without photos; a cart list with Discount and Price links; "Cash" and "Card terminal" instead of Checkout; no tabs. |
| vendurepos | gap | The same layout, with a button row (Orders, Register, X report, Sync now, Settings, Sign out) and "Pay cash", "Pay by card" and "Split" instead of Checkout. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/sale-wide.jpg) | ![medusapos](screens/medusapos/sale-wide.jpg) | ![vendurepos](screens/vendurepos/sale-wide.jpg) |

**Closes it:** `new` (the A1 shell: rail and columns), with unit 16 for the
Checkout button and unit 19 for the tabs.

## Sale screen, phone

**v2:** at 390 px, products and cart are two tabs; the cart tab carries the
total.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | Products fill the screen, with a "Cart · 1 item €2.50 ›" bar at the bottom instead of tabs. |
| vendurepos | close | The same cart bar; the demo banner takes the top of the screen. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/sale-phone.jpg) | ![medusapos](screens/medusapos/sale-phone.jpg) | ![vendurepos](screens/vendurepos/sale-phone.jpg) |

**Closes it:** PLAN unit 4 (Scale, `auto` picks compact below 640 px), then
`new` for the tab layout.

## Product search and scan

**v2:** one search box with a scan button and filter pills; results stay as
photo tiles.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | "Search or scan barcode / SKU" filters the tiles and says "4 matching"; no filter pills. |
| vendurepos | close | The same search; no filter pills. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/search.jpg) | ![medusapos](screens/medusapos/search.jpg) | ![vendurepos](screens/vendurepos/search.jpg) |

**Closes it:** PLAN unit 12 (scan bus) for the scanner; `new` for the filter
pills (the Woo term feeds connector unit carries the data on Woo).

## Categories

**v2:** coloured category tiles with a product count, and a breadcrumb
("Categories › All products").

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | A row of category chips over the tiles; no counts, no nesting. |
| vendurepos | close | The same chips. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/categories.jpg) | ![medusapos](screens/medusapos/categories.jpg) | ![vendurepos](screens/vendurepos/categories.jpg) |

**Closes it:** `new`.

## Variable product

**v2:** the tile says "12 options"; a tap opens an attribute picker (size,
colour) beside the tile.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | A "from €10.00" tile opens a list of variants (name, SKU, price, stock) over the grid, with Cancel. |
| vendurepos | close | The same variant list. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/variable.jpg) | ![medusapos](screens/medusapos/variable.jpg) | ![vendurepos](screens/vendurepos/variable.jpg) |

**Closes it:** `new` (attributes on the line are #495, needs-paul).

## Cart line: quantity

**v2:** the QTY box opens a number keypad.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | − and + buttons under the line; no keypad, so 12 units take 11 taps. |
| vendurepos | close | − and + beside the line. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/line-quantity.jpg) | ![medusapos](screens/medusapos/line-quantity.jpg) | ![vendurepos line with − and +](screens/vendurepos/line-price.jpg) |

**Closes it:** `new` (the line keypad).

## Cart line: price and discount

**v2:** the price opens a keypad with −5%, −10% and −15% quick discounts;
the old price shows struck through.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | "Price" and "Discount" links open an inline form (a currency field and an optional reason, Apply, Cancel); no keypad, no quick discounts. |
| vendurepos | gap | The same forms. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/line-price.jpg) | ![medusapos price](screens/medusapos/line-price.jpg) | ![vendurepos price](screens/vendurepos/line-price.jpg) |
| | ![medusapos discount](screens/medusapos/line-discount.jpg) | ![vendurepos discount](screens/vendurepos/line-discount.jpg) |

**Closes it:** `new` (line keypad with quick discounts; v2 keeps the quick
discounts in per-screen UI settings).

## Fee and shipping

**v2:** a "+" menu on the cart adds a misc product, a fee or shipping, each
in its own form.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | "Add charge" opens one form with Fee, Shipping and Custom item, a name and an amount. |
| vendurepos | close | The same "Add charge" form. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2 menu](screens/v2/fee-shipping.jpg) | ![medusapos](screens/medusapos/fee-shipping.jpg) | ![vendurepos](screens/vendurepos/fee-shipping.jpg) |
| ![v2 fee](screens/v2/fee.jpg) | ![medusapos fee](screens/medusapos/fee.jpg) | ![vendurepos fee](screens/vendurepos/fee.jpg) |

**Closes it:** nothing needed beyond the shell.

## Coupon

**v2:** "Add Discount" has two tabs, Quick discount and Coupon; the coupon
tab picks from the store's coupons.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | "Order discount" (Percent or Amount) only; no coupon codes. |
| vendurepos | gap | The same order discount; no coupon codes. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/coupon.jpg) | ![medusapos](screens/medusapos/coupon.jpg) | ![vendurepos](screens/vendurepos/coupon.jpg) |

**Closes it:** `new` (#501; Woo coupons are already in core, ADR-077).

## Customer pick

**v2:** "Customer: Guest" in the cart header opens a search over the store's
customers, with an address button beside it.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | "Customer: Guest" opens a dialog with a search and "New customer". |
| vendurepos | close | "Add customer" opens the search inline above the cart. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/customer.jpg) | ![medusapos](screens/medusapos/customer.jpg) | ![vendurepos](screens/vendurepos/customer.jpg) |

**Closes it:** nothing for the pick; offline search for Woo is a connector
unit.

## Customer create

**v2:** a full form: name, email, phone, billing and shipping addresses.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | "New customer" asks for name, email and phone; no addresses. |
| vendurepos | close | The same short form. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/customer-create.jpg) | ![medusapos](screens/medusapos/customer-create.jpg) | ![vendurepos](screens/vendurepos/customer-create.jpg) |

**Closes it:** PLAN unit 7 (`updateCustomer` with addresses) and its
connector units.

## Cart note

**v2:** the cart's order details hold a customer note, and the note prints
on the receipt.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | missing | No note anywhere on the sale. |
| vendurepos | missing | No note anywhere on the sale. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/note.jpg) | (no note control) | (no note control) |

**Closes it:** PLAN unit 6 (sale note), on the wire with `order.create` v7.

## Park and open orders

**v2:** every open sale is a tab under the cart ("Guest $16.83 · 5 h"), with
a "+" for a new one; a partly paid sale says so.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | "Parked sales" opens a dialog: "Park this sale" and a list; one sale on screen at a time. |
| vendurepos | gap | The same "Parked sales" dialog, from a "Park" button. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/open-orders.jpg) | ![medusapos](screens/medusapos/open-orders.jpg) | ![vendurepos](screens/vendurepos/open-orders.jpg) |

**Closes it:** PLAN unit 19.

## Tender

**v2:** the tender pane replaces the products: "TO PAY" headline, method
tiles (Cash, card terminals, bank transfer), quick-cash chips ($16.83,
$20.00, $50.00, Exact), a keypad and "Take $16.83 in Cash"; the cart side
becomes a payments ledger (Total, Paid, Remaining).

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | "Cash" opens a pane in the cart column: quick-cash chips, a typed amount, Change Due, Balance due, Complete sale, Back. No keypad, no method tiles, no ledger. |
| vendurepos | gap | The same cash pane ("Back to the cart"). |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/tender.jpg) | ![medusapos](screens/medusapos/tender.jpg) | ![vendurepos](screens/vendurepos/tender.jpg) |

**Closes it:** PLAN unit 16 (on 14), with 17 and 18 for card terminals and
15 for cash rounding.

## Split payment

**v2:** "Split" on the tender pane; each payment is a leg in the ledger, and
a leg can be voided.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | "Split payment" opens a separate pane (Total, Paid, Remaining, Cash or Card, Add). |
| vendurepos | gap | A "Split" button on the cart opens the same split pane. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/split.jpg) | ![medusapos](screens/medusapos/split.jpg) | ![vendurepos](screens/vendurepos/split.jpg) |

**Closes it:** PLAN units 14 and 16.

## Receipt and print

**v2:** a receipt preview with a template choice, a printer, Email, PDF and
Print.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | After the sale: a plain receipt (store, order, cashier, lines, VAT, cash and change) with "Print receipt" and "New sale"; no template, printer, email or PDF. |
| vendurepos | gap | The same receipt in the cart column. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/receipt.jpg) | ![medusapos](screens/medusapos/receipt.jpg) | ![vendurepos](screens/vendurepos/receipt.jpg) |

**Closes it:** PLAN units 28 and 29 (and 38 for thermal printers); the
Medusa `emailReceipt` connector unit.

## Orders list

**v2:** a table of the store's orders with status, customer, total and
filters; it pages through the server's history.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | "Recent": only the sales made on this till ("No sales yet" until one is made). |
| vendurepos | close | "Recent" lists this till's sales and the store's earlier orders (DEMO-000001 to 3); no filters. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/orders.jpg) | ![medusapos](screens/medusapos/orders.jpg) | ![vendurepos](screens/vendurepos/orders.jpg) |

**Closes it:** the Medusa `listOrders`/`getOrders` connector unit (#540);
the Vendure orders wiring unit.

## Order detail

**v2:** an order dialog with lines, payments and notes, and Receipt, Refund,
Re-open, Sync, Delete and Close.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | The row unfolds to show the lines and the payment; no actions. |
| vendurepos | gap | The same unfolding row; no actions. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/order-detail.jpg) | ![medusapos](screens/medusapos/order-detail.jpg) | ![vendurepos](screens/vendurepos/order-detail.jpg) |

**Closes it:** PLAN unit 20 for Refund, 28 for Receipt; `new` for Re-open.

## Refund

**v2:** a refund form: quantity per line, a custom amount, a reason, and the
refund method.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | missing | No refund action on the order. |
| vendurepos | missing | No refund action on the order. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/refund.jpg) | (no refund control) | (no refund control) |

**Closes it:** PLAN units 9, 20 and 21.

## Customers

**v2:** a Customers screen in the rail: a searchable table (name, email,
billing address, date created) and an add button.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | missing | No customers screen; customers are only reached from the sale. |
| vendurepos | missing | No customers screen. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/customers.jpg) | (no screen) | (no screen) |

**Closes it:** `new`.

## Products

**v2:** a Products screen in the rail: a table with stock and price, edited
in place.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | A "Table" toggle on the sale screen lists name, SKU, barcode, price, stock and category; read-only. |
| vendurepos | close | The same table toggle. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/products.jpg) | ![medusapos](screens/medusapos/products.jpg) | ![vendurepos](screens/vendurepos/products.jpg) |

**Closes it:** `new` (a products screen; stock edits are platform work).

## Register: open, cash in and out

**v2:** the register panel: opening float, paid in, paid out, no sale, the
expected cash, X report and Close.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | "Register ›" opens a dialog: sales this session, Paid in, Paid out, No sale, expected cash, Close register. No X report there (it is on Reports). |
| vendurepos | close | The same Register dialog; "X report" is a button on the top bar. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/register.jpg) | ![medusapos](screens/medusapos/register.jpg) | ![vendurepos](screens/vendurepos/register.jpg) |

**Closes it:** PLAN unit 31 (float suggestion) and the `MovementSheet`
reason-chips shared unit.

## Register close (X and Z)

**v2:** the close count with a keypad, a count per note and coin, notes,
and the variance before the Z report.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | "Count the drawer": a cash total field and a tile per note and coin, "Back to selling", "Close register"; no keypad. |
| vendurepos | close | The same count. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/register-close.jpg) | ![medusapos](screens/medusapos/register-close.jpg) | ![vendurepos](screens/vendurepos/register-close.jpg) |

**Closes it:** PLAN unit 13 (manager approval), 32 (recount) and 27
(closures).

## Reports

**v2:** a Reports screen: a till strip, a sales chart with a comparison,
and cards (payments by method, top products, taxes, refunds), with filters.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | "Today's sales", "Print X report", today's closures and earlier closures ("Couldn't load earlier closures."); no chart or cards. |
| vendurepos | missing | No reports screen; an "X report" button on the top bar is all there is (the shot shows the sale screen the script landed on). |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/reports.jpg) | ![medusapos](screens/medusapos/reports.jpg) | ![vendurepos](screens/vendurepos/reports.jpg) |

**Closes it:** PLAN units 10, 25, 26 and 27.

## Settings: display, theme and scale

**v2:** Settings › Theme: ten themes, Scale (auto, compact, regular,
spacious), fonts and icon sets.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | missing | Settings shows the store (read-only), the till name and scanner timing; no theme, scale or font. |
| vendurepos | missing | Settings holds the scanner only; no theme, scale or font. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/settings-display.jpg) | ![medusapos](screens/medusapos/settings-display.jpg) | ![vendurepos](screens/vendurepos/settings-display.jpg) |

**Closes it:** PLAN unit 22 (on 3, 4 and 5).

## Settings: printers

**v2:** Settings › Printing: printers, paper width, auto-print, templates.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | missing | No printer settings; "Print receipt" uses the browser's print. |
| vendurepos | missing | No printer settings. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/settings-hardware.jpg) | (no section) | (no section) |

**Closes it:** PLAN units 29 and 38.

## Settings: barcode

**v2:** Settings › Barcode Scanning: scanner timing, prefix and suffix, and a
test field.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | close | "Scanner": average time per key and a test field, on the one settings page. |
| vendurepos | close | "Scanner": shortest barcode, prefix and suffix the scanner adds, and scan sounds; no test field. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/settings-barcode.jpg) | ![medusapos](screens/medusapos/settings-display.jpg) | ![vendurepos](screens/vendurepos/settings-display.jpg) |

**Closes it:** PLAN units 12 and 39.

## Cashier switch and sign-out

**v2:** the avatar opens a sheet: the drawer, hand the till to someone else,
switch register, sign out.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | "Sign out" in the top bar only; no switch or hand-over. |
| vendurepos | gap | "Sign out" only. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/cashier.jpg) | ![medusapos](screens/medusapos/sale-wide.jpg) | ![vendurepos](screens/vendurepos/sale-wide.jpg) |

**Closes it:** PLAN unit 33 (on 30).

## Offline

**v2:** with the network gone, an "Offline" dot and a toast ("Device went
offline… sync resumes"); search and sales carry on.

| App | Status | What differs |
|---|---|---|
| Tally Woo | not reachable | |
| medusapos | gap | Search and the sale carry on, but nothing says the till is offline: the footer still says "Sales are up to date." |
| vendurepos | gap | Search and the sale carry on; the top bar keeps "Last synced" and "Sync now", and nothing says the till is offline. |

| v2 | medusapos | vendurepos |
|---|---|---|
| ![v2](screens/v2/offline.jpg) | ![medusapos](screens/medusapos/offline.jpg) | ![vendurepos](screens/vendurepos/offline.jpg) |

**Closes it:** PLAN unit 34 (connectivity), with 23 (outbox health).
