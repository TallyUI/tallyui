# A-track brief: Medusa POS app and plugin (medusapos/app)

*Written 2026-09-23 by the TallyUI programme lead, for the medusapos worker.
This file is the channel for instructions. Later instructions are appended
as dated sections at the end; read the whole file, newest section last.*

## Goal

The shortest path to a minimal Medusa POS that real people can test. This is
Paul's overriding priority (TallyUI ADR-034).

A tester:
1. opens a hosted POS web app;
2. logs into their own Medusa 2.21 store as an admin user;
3. sells for cash, or for a standalone card terminal recorded as
   `external`, while offline;
4. reconnects and sees every order land in Medusa **exactly once**: at the
   POS prices, paid, with stock decremented.

Target: testable Friday 2026-10-02; committed by Tuesday 2026-10-06. Web
only; no native or Electron work.

## Working rules

- **Codex writes the code.** For each job:
  1. Copy `~/.claude/codex/SPEC-TEMPLATE.md` and fill every section.
  2. Commit your own work so the tree is clean.
  3. Run `~/.claude/bin/codex-job.sh [--network] [--timeout S] <worktree> <spec>.md`.
  4. Review the full diff and rerun the acceptance commands yourself.
  5. Commit, and open one PR per job, ending with the Claude Code footer.

  If a job strays, narrow the spec; don't patch by hand.
- **Files and shell:**
  - Use the Write tool for files, one file per command.
  - No inline code in shell (`node -e`, `python3 -c`); scripts go in
    files.
  - Run allow-listed commands on their own, never chained with `&&`.
  - One test suite at a time, `--maxWorkers=2`.
- **GitHub:** no write actions except `gh pr create` and `gh pr edit` on your
  own PRs. Never push to `main`. The Front desk merges.
- **Reporting:** SendMessage to "Front desk" **only** when a PR opens (give
  its number and the A-track burndown, done/11) or when a decision is
  needed. Instructions come through this file, not through messages.
- **Secrets:** never print secrets. The dev store's POS key is in
  `~/Projects/medusa-dev/.pos-api-key`.

## State when this brief was written (verify it)

- **A1:** CI (typecheck + unit) is committed on `feat/medusa-pos-demo` at
  16202db, and draft PR #3's CI is green. Mark #3 ready for review and tell
  the Front desk. It merges #3 as the baseline (TallyUI ADR-029).
- **A5:** a seed with VAT rates for the Europe tax regions is committed on
  `feat/dev-store-vat-rates` at e2ad606. It is pushed, stacked on #3, has no
  PR yet, and has **not been verified**. Check its diff. If it was written
  by hand, treat it as the starting point for a Codex spec rather than
  committing it as-is. Then open its PR.
- No A2 scaffold exists.

## Jobs, in dependency order

A1 → A5 → A2 → A3 → A4; in parallel, A6 → A7 → A8 → A9 → A10 → A11.

| Job | Scope |
|---|---|
| A1 | CI for medusapos/app; get PR #3 ready (see State) |
| A5 | Dev-store seed with tax rates (at least DE 19% default in the Europe region), so e2e tests exercise tax |
| A2 | Medusa plugin package (for example `packages/medusa-plugin`, Medusa 2.21 plugin layout) with a ledger module: data model and migration for command id, type, payload fingerprint, status, result JSON and timestamps |
| A3 | The `order.create` workflow (recipe below), with compensation |
| A4 | `POST /tally/v1/commands` with admin JWT auth and the ADR-038/039 semantics; document the CORS settings a tester needs |
| A6 | App login: backend URL, Medusa admin email/password (native emailpass JWT), refresh. No secret key in the browser |
| A7 | Catalogue sync with the TallyUI Medusa `ReplicationAdapter` (pull-only, 100 per page); product grid, search, barcode. Use `getVariants` and `findVariantByCode` (TallyUI T11, merged) |
| A8 | Cart, cash or external tender, on-screen receipt with browser print, using the TallyUI `pos` order builder (`addLine`, `*Minor` fields) and receipt data. Money is integer minor units |
| A9 | Outbox wiring: `finalizeOrder` → `pos_orders` collection → `createOrderOutbox` with `createHttpCommandTransport` (TallyUI T5 merged; T7 in progress). Pending-orders indicator; a list of rejected orders that need attention |
| A10 | Offline e2e (Playwright, web, against medusa-dev); assertions below |
| A11 | Expo web static export on Vercel (a `*.vercel.app` URL first; app.medusapos.com once Paul adds DNS) plus a quick-start doc: plugin install, CORS, login |

TallyUI packages are consumed through `file:` overrides until they are
published (TallyUI T9/T10). Bump the TallyUI pin to current `main` when you
need newer packages, and add `react-native-svg` to the app at the same
time.

## Verified Medusa recipe for A3 (TallyUI ADR-036, medusa-dev order #301)

These six Admin steps run as one workflow with compensation:

1. `POST /admin/draft-orders` with `region_id`, `sales_channel_id`, an
   address (use the **stock location's address**; tax follows the address)
   and `items[{variant_id, quantity, unit_price (major units, as sold), metadata}]`.
   The override is kept: €8.50 was sold against a list price of €10.
2. `POST /admin/draft-orders/{id}/convert-to-order`. This keeps
   `unit_price`, only **reserves** stock, and creates **no** payment
   collection.
3. `POST /admin/payment-collections {order_id, amount}`.
4. `POST /admin/payment-collections/{id}/mark-as-paid {order_id}`. The order
   becomes `payment_status: captured`.
5. `POST /admin/orders/{id}/fulfillments {items, location_id, no_notification}`,
   split into items that need shipping and items that don't (Medusa refuses
   a mix). This decrements `stocked_quantity`.
6. `POST /admin/orders/{id}/complete`.

## Contract (TallyUI ADR-038 + ADR-039; pinned)

Any change needs a new ADR agreed with the TallyUI lead (append the request
here or ask the Front desk). The types are exported by `@tallyui/core`.
Import them; do not redeclare them.

**Transport**
- `POST /tally/v1/commands`, header `X-Tally-Protocol: 1`, body
  `{ commands: CommandEnvelope[] }`. Maximum 50 per request; the client
  sends at most 10.
- Response `200 { results: CommandResult[] }`, in the same order.
- Retryable by the client: network errors, `5xx`, `429`, and
  `409 { code: 'in_progress', id }`. A 409 stops the batch at that command;
  the client retries the whole batch, and earlier commands replay as
  `duplicate`.

**Types**

```ts
CommandEnvelope<P> { id /* UUIDv7, idempotency key */; type: 'order.create'; version: 1; payload: P; createdAt /* ISO, client */; deviceId; attempt }
CommandResult { id; status: 'applied' | 'duplicate' | 'rejected'; serverRefs?: { orderId; displayId?; totalMinor };
  warnings?: Array<{ code: 'total_mismatch'; expectedMinor; serverMinor } | { code: 'insufficient_stock'; variantId; quantity }>;
  error?: { code; message } }
OrderCreatePayload { clientOrderId; createdAt; currency /* ISO upper */; pricesIncludeTax;
  lines: [{ clientLineId; variantId; title?; quantity /* int >= 1 */; unitPriceMinor }];
  subtotalMinor; taxMinor; totalMinor;
  payments: [{ clientPaymentId; method: 'cash' | 'external'; amountMinor; tenderedMinor?; changeMinor?; reference? }];
  customer?: { email? } | null; registerId?; cashierRef?; locationId? }
```

The payload has **no discount field**. The POS refuses discounted sales
until a discount contract exists.

**Server semantics**
- **Ledger:** claim `id`. A replay of an applied id returns `duplicate`
  with the original `serverRefs`. The same id with a different fingerprint
  (sha256 of canonical JSON of `{ type, version, payload }`) is `rejected`
  with `idempotency_mismatch`. On a transient mid-workflow failure:
  compensate, release the claim, return 5xx.
- **Metadata:** set `metadata.tally_client_id`, `metadata.tally_created_at`,
  and per line `metadata.tally_line_uuid`.
- **Region:** the currency must match and the region must contain the
  location's country; otherwise reject with `unsupported_currency`.
- **Walk-in customer:** omit `email` if Medusa accepts that. Otherwise use a
  server-configured placeholder, default `walk-in@pos.invalid`. Always set
  `no_notification`.
- **Tax-inclusive prices:**
  1. set `is_tax_inclusive` per item;
  2. otherwise, back out an exclusive `unit_price` at full decimal
     precision (`unitPriceMinor × 10⁶ / (10⁶ + ratePpm)`, never rounded to
     the cent);
  3. otherwise, reject with `unsupported_tax_mode`.

  Prove the chosen path with an inclusive-region test.
- **Insufficient stock:** record the sale. Items that can't be fulfilled
  stay unfulfilled, with an `insufficient_stock` warning per variant. Reject
  with `insufficient_stock` only if Medusa refuses the order itself.
- **Overpayment:** accept it; the collection amount = `totalMinor`.
- **Rejection codes:** `unknown_variant`, `invalid_quantity`, `underpaid`,
  `unsupported_currency`, `unsupported_tax_mode`, `insufficient_stock`,
  `idempotency_mismatch`, `invalid_payload`.

## Money and tax rules (TallyUI ADR-037 + ADR-040)

- Medusa keeps line tax **unrounded** (precision 20). For example, the total
  3.094 EUR is paid as 3.09 and still reads `captured`.
- The POS computes tax exactly and rounds once. The **POS total is
  authoritative** for the merchant.
- The payment collection amount = `payload.totalMinor`, exactly.
- If Medusa's total, rounded to the cent, differs from `totalMinor`, apply
  the order anyway and return a `total_mismatch` warning.
- Lines may carry several stacked tax rates (applied to the same base, not
  compounded). The receipt's per-rate breakdown sums to the charged tax.

## A10 must assert

- 25 sales, 20 of them made offline, produce 25 orders in Medusa with 0
  duplicates.
- For every order: |Medusa order total − POS total| ≤ 1 minor unit.
- For every order: payment collection amount == POS total, exactly.
- Stock drops by the quantities sold.

## Environment

- **Dev store:** `127.0.0.1:9000`, run from `~/Projects/medusa-dev` with the
  scripts `deploy.sh`, `reset.sh` and `restart.sh`. Admin login
  `admin@tally.test`.
- **Codex:** it cannot write pnpm's global store inside its sandbox. Write
  acceptance commands as `./node_modules/.bin/vitest …` and
  `./node_modules/.bin/tsc …`, not `pnpm …`.
- **Component tests:** they run react-native-web in jsdom, which never
  renders `className`. Assert on text, role, attributes or inline style
  only.

---

## Appended instructions

*(Dated sections go below this line, newest last.)*

### 2026-09-23 evening — TallyUI pin and the API to use (instruction; no scope change)

**Pin TallyUI to `3996453ef752f246167075d06ca3dcda0b3098fd`**, the #25
merge on `TallyUI/tallyui` main. It contains every T-track job. Bump your
`file:` overrides and CI checkout to this commit, and add `react-native-svg`
(≥ 15) to the app at the same time: components need it since TallyUI #12.
Packages are **not on npm yet**. Keep `file:` overrides until the Front desk
says Release is enabled.

**Use these, and nothing older:**

- **Money:** everything is integer minor units, `Money = { amount, currency }`
  from `@tallyui/core`. Format with `formatMoney(m, locale)`, and parse typed
  cash with `moneyFromDecimalString(text, currency)`. Never use `parseFloat`
  or `toFixed` on money.
- **Catalogue and variants** (`@tallyui/core`, `@tallyui/connector-medusa`):
  - Replicate products with `medusaConnector.replication.products`
    (pull-only, 100 per page; the baseline is 2,005 products in about 12.5 s
    before browser storage).
  - Read variants with `traits.getVariants(doc)`, which gives
    `VariantSummary { id, title, sku, barcode, prices, stock }`.
  - Resolve a variant's price with `resolvePrice(variant.prices, currency)`.
  - Scan with `findVariantByCode(variants, code)`: barcode first, then SKU.
- **Tax context** (`@tallyui/pos`):
  - `<TaxProvider ratesPpm={{ default: 190000 }} pricesIncludeTax={false}>`,
    or a plain `TaxContext` object with `getTaxRatePpm(taxClass?)`.
  - Rates are **integer ppm**: 19% = 190000. Convert Medusa's percent rate
    with `ratePpmFromPercent('19')`. The dev store is tax-exclusive; once
    A5's rates land, read the rate from the region's tax rate.
- **Cart** (`@tallyui/pos`):
  - Create the cart with `createOrderBuilder({ currency, taxContext })`.
  - Add lines with `builder.addLine({ productId, variantId, name, sku, unitPrice: Money, quantity })`.
    Use `variantId` from `VariantSummary.id`.
  - Subscribe to `builder.order$`. Every total is on the `Order`:
    `subtotalMinor`, `taxMinor`, `totalMinor`, `paidMinor`,
    `balanceDueMinor`, `changeDueMinor`.
  - **Do not compute totals in the app.**
- **Tender:**
  - Record a tender with `builder.addPayment({ method: 'cash' | 'external', amountMinor })`.
    For cash, `amountMinor` is the amount **handed over**;
    `finalizeOrder` works out the change.
  - Only `cash` and `external` are accepted.
  - **Discounts are not supported yet:** `finalizeOrder` throws on them.
    Don't expose discount UI.
- **Completing the sale:**
  - `const posOrder = finalizeOrder(builder.getSnapshot(), { registerId, cashierRef })`.
  - It throws with a stable prefix (`finalize: …`): no lines, underpaid,
    change exceeds cash, unsupported method, discounts. Show that message
    to the cashier.
  - Then `db.pos_orders.insert(posOrder)`, where the collection uses
    `posOrderSchema`.
  - **The sale is recorded locally at that point, even offline.** Start a
    new `createOrderBuilder` for the next sale.
- **Sync:**
  - Build the outbox with
    `createOrderOutbox({ collection: db.pos_orders, transport: createHttpCommandTransport({ baseUrl, getHeaders: () => ({ Authorization: 'Bearer ' + jwt }) }), deviceId })`,
    then `outbox.start()`.
  - The outbox is single-tab (no leader election yet), so run one POS tab.
  - `outbox.state$` gives `{ pending, sending, lastRetryReason, nextAttemptAt }`
    for the pending indicator.
  - Orders move `pending` → `applied` (with `serverRefs`, and `warnings`
    such as `total_mismatch` or `insufficient_stock`) or `rejected` (with
    `error.code`).
  - Show `rejected` orders and any warnings in the needs-attention list.
  - A 401 is retried forever, so `getHeaders` must return a fresh token
    after refresh.
- **Receipt:** `buildReceiptData(order, config)` gives `*Minor` fields and
  per-rate `taxLines` that sum to the charged tax.
- **Components** (`@tallyui/components`): `CartLine`, `CartTotal`,
  `CashTendered`, `ChangeDisplay` and `CartPanel<T>` now take `Money`
  values. Pass the builder's numbers; the components compute nothing.

**Command envelope:** the outbox builds it with
`toOrderCreateEnvelope(posOrder, deviceId)`. The payload is exactly
ADR-038's `OrderCreatePayload`. `lines[].variantId` falls back to
`productId`; `customer` is null unless an email is set. The server (A3/A4)
must accept exactly this shape. TallyUI's tests prove the envelope survives
a JSON round trip unchanged.
