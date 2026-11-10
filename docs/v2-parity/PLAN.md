# v2 parity plan: shared libraries for the WCPOS v2 target

- **Date:** 2026-11-10 · **Owner:** the TallyUI shared-libraries worker
- **Source:** Paul, 2026-11-10: "We have the new target of v2. So the goal is
  now abstracting functionality from wcpos v2 into shared libraries and
  bringing medusapos, vendurepos and the tally version of wcpos up to
  feature and ui parity."
- **Read at:** monorepo `main` `5ac185b0e` (WCPOS 2.0.0, shipped
  2026-11-09; read-only, never changed from here) and TallyUI `origin/main`
  `cc219653` (3.12.0, last merge 2026-10-15).
- **Consumers:** medusapos, vendurepos and tallyui-woocommerce. Each app
  worker audits its own app against v2 and fd-notes what it needs from the
  shared packages; this plan is the shared side.

Paths in the v2 column are relative to `~/Projects/monorepo`; TallyUI paths
are relative to this repo. "Core" in a v2 path means
`packages/core/src/screens/main`.

## How to read this

- **v2 is the target for features and UI** (Paul, 2026-11-10), not just a
  taste reference. Each platform still works its own way (Paul,
  2026-10-07): the app gets v2's features and screens, and the connector
  uses its own backend's model (roles, prices, payments, auth) underneath.
- **Port behaviour, not Woo shape.** v2's neutral logic (state machines,
  money math, numbering, queues) is re-implemented or adapted in TallyUI.
  Its WooCommerce parts (`wcpos/v2/*` endpoints, `_wcpos_*` meta keys,
  WordPress capabilities) become a connector seam. The monorepo,
  woocommerce-pos and woocommerce-pos-pro are never changed from TallyUI
  (fork ruling, 2026-10-06).
- **v2 has no ADR files in the monorepo.** ADRs 0033 and later live in
  `woocommerce-pos/docs/adr/`. The in-repo checklists a port should follow
  are the per-folder `LEDGER.md` behaviour ledgers (for example
  `core/pos/checkout/tender/LEDGER.md`, `core/reports/LEDGER.md`).
- **Size:** S is one PR of up to about 250 lines; M is two or three PRs; L is
  more than three PRs and needs its own design note first.

---

# Part A. Inventory and gap, area by area

## A1. UI shell, Scale and Fonts

**v2.** - **The shell** is an expo-router drawer
  (`apps/main/app/(app)/(drawer)/_layout.tsx`). It is a fixed icon rail on
  wide screens (`core/components/drawer-content/rail/index.tsx`, with its
  own `LEDGER.md`) and slides out on phones. The drawer has entries for POS,
  products, orders, coupons, customers, reports, health, settings and
  support.
- **The POS screen** has two route groups: `(pos)/(columns)` for wide
  screens and `(pos)/(tabs)` for phones.
  `core/pos/columns/pos-columns.tsx` splits products and cart with
  `packages/resizable-panels`, a vendored MIT port of
  react-resizable-panels. Products default to 60% of the width, each panel
  has a 25% minimum, and the width is saved only when the user drags.
  During payment the tender pane replaces the products column, with a 180 ms
  fade.
- **Per-screen UI settings** (cart position, auto-print, quick discounts,
  columns) live in `core/contexts/ui-settings/` and are stored on the device.
- **Themes:** 10 (`apps/main/global.css`; metadata in
  `packages/components/src/lib/themes.ts`).
- **Scale** has four settings, `auto|compact|regular|spacious`, built from
  nine size tokens per step (`packages/components/src/lib/scale.ts`).
  - `auto` picks compact below 640 px and spacious from 1600 px.
  - The pointer floors are 44 for coarse pointers and 24 for fine.
  - `MAX_FONT_SCALE` is 1.3.
  - `packages/core/src/contexts/scale/index.tsx` applies it through
    `ScopedVariables`. On the web it also writes to `documentElement`, so
    portals scale too.
  - It is stored as `stores.scale`, "device-local beside the theme".
- **Fonts and icons:**
  - The font choices are `auto|system|instrument|grotesk|fraunces|manrope`
    (`packages/components/src/lib/fonts.ts`). The bundled fonts are Google
    Fonts under SIL OFL 1.1.
  - The icon sets are tabler, hugeicons and phosphor, each with its own
    licence file.
  - The settings UI is `core/settings/theme.tsx` (`ThemeGrid`,
    `ScaleSection`, `FontsSection`, `IconsSection`).
- **Motion durations** are in `packages/components/src/lib/motion.ts`.
- **Accessibility:**
  - A 44 pt minimum touch target (`packages/components/src/lib/min-target.tsx`).
  - Contrast rules in `CODING_STANDARDS.md`.
  - Reduced-motion handling.
  - There is no axe testing and no right-to-left support.

**TallyUI today.**
- `packages/components/src/layout/` has `POSLayout` (split or stacked at
  768px, with header, browse and cart slots), `CheckoutLayout`,
  `SettingsLayout` and `LiveTabScreen`.
- `packages/theme/src/tokens.css` has about 81 CSS variables in light and
  dark, and `contrast.test.ts` checks contrast.
- There is **no UI scale, font or density setting anywhere**.

**Abstract into shared.**
- Scale and font tokens in `@tallyui/theme`.
- A provider in `@tallyui/components` that applies the scale and font.
- The settings come from the app-settings store (A10).

**Connector seam.** None; this is client-only.

**Size and dependencies.** M; depends on A10.

## A2. Tender pane and split payments

**v2.**
- **Entry points:** `core/pos/checkout/checkout.tsx`,
  `tender/tender-pane.tsx` (1,148 lines), `tender/use-tender-flow.ts`
  (1,849 lines), `tender/tender-state.ts` and `commit-sale.ts`.
- **The payment ledger:** `PaymentRow` with status
  `pending|authorized|captured|failed|voided`, kind, capture mode,
  tendered, change, tip and refunds
  (`packages/order-math/src/payments/types.ts:162-195`).
- **`derive()`** counts only `captured` rows as paid
  (`order-math/src/payments/derive.ts`, ADR 0040 D6).
- **Split plans:** `even`, `fixed` then N, and `items` (picked units).
- **Cash rounding** is written as a fee line before the leg
  (`order-math/src/payments/rounding.ts`,
  `core/pos/checkout/cash-rounding-hook.ts`).
- **The `PaymentMethodDescriptor`** declares `amount.partial`, `change`,
  `refunds.via`, `offline: record|queue|none`, `void` and
  `defaults.rounding`.
- **UI:** `TenderPane`, `LedgerPane`/`LedgerLegs`/`BalanceHeadline`,
  `TerminalLegView`, `CancelPaymentView`, `CapturedUnfinishedNotice`,
  `ReceiptStage`.
- **Behaviours** (`core/pos/checkout/tender/LEDGER.md`):
  - Excess cash is change.
  - A method without change cannot be over-entered.
  - The quick-cash chips are the exact amount, then round-ups to 5, 10
    and 50.
  - Even shares round half-up, and the last leg takes the remainder.
  - A zero-balance sale completes with no payment row.

**TallyUI today.**
- `packages/pos/src/tender/tender-state.ts` is a reducer with
  even/amount/percent/item split plans, a keypad, change and
  `quickTenderedAmounts` (line 248).
- `tender-void.ts` writes the `tender_voids` collection.
- **UI:** `packages/components/src/sale/tender.tsx`, `split-tender.tsx`
  and `components/src/checkout/*`.
- **Payments** are `OrderCreatePayment {method: 'cash'|'external',
  amountMinor, tenderedMinor, changeMinor, reference}`
  (`packages/core/src/types/commands.ts:293-303`), sent offline inside
  `order.create`.
- **Gaps:** no payment status, no per-method descriptor, no cash rounding
  and no card-terminal leg.

**Abstract into shared.**
- A neutral `PaymentMethodDescriptor` in core, read from the connector.
- Payment-leg status (pending, authorized, captured, failed, voided) in the
  tender state, with captured-only balance.
- Cash rounding as its own order line.
- The v2 tender pane layout in components (ledger legs, balance headline,
  terminal leg).

**Keep TallyUI's offline model.** TallyUI's `order.create` takes a cash sale
fully offline, including an order the store has never seen. v2 refuses that
case (`pos_checkout.order_not_on_store_yet`,
`core/pos/checkout/tender/use-tender-flow.ts:1012-1019`), so TallyUI
already does better here and keeps its model.

**Connector seam.** `paymentMethods(context)` returns descriptors:
- **Woo:** `GET wcpos/v2/payment-methods`.
- **Medusa:** payment providers per region.
- **Vendure:** `eligiblePaymentMethods` and payment method handlers.

A capability gates the payment statuses on the wire (an `order.create`
version bump: one-way).

**Size and dependencies.** L. The descriptor and contract come first, then
the state, then the UI. A3 depends on the descriptor.

## A3. Card reader / payment terminal abstraction

**v2.** - **The `PaymentDriver` interface**
  (`core/services/payment-drivers/types.ts`):
  - `provider`;
  - `capabilities {discovery, cancel, refund}`;
  - `availability()`;
  - optional `discoverReaders`, `connect`, `disconnect` and `cancel`;
  - `collect()`, which returns `CollectResult {outcome
    captured|authorized|declined|cancelled, provider_refs, receipt, amount,
    transport}`;
  - `status$`.
- **Supporting code:** a registry (`registry.ts`) and `simulated-driver.ts`.
- **Device drivers** (`apps/main/lib/payment-drivers.ts`):
  - Stripe Terminal: a beta React Native SDK.
  - SumUp: a local Expo module on SDK 7.1.0 that needs an affiliate key.
  - Credentials come from `POST payment-methods/{id}/bootstrap`.
- **Server-mode smart readers:** `core/services/terminal-payments/service.ts`.
- **Tender UI:** `checkout/tender/terminal-leg-view.tsx`,
  `reader-connection.tsx` and `remembered-readers.ts`.
- **ADR 0040 rules:** SumUp offline mode exists but is not called, and a
  payment counts as paid only when captured.

**TallyUI today.**
- Only types: `PaymentTransport` (`bluetooth|usb|network|tap_to_pay`) and
  `readerId` (`packages/pos/src/tender/tender-state.ts:1-19`).
- The "Card terminal" is an external tender with a typed reference
  (`components/src/sale/tender.tsx`).
- ADR-033 keeps hardware drivers splittable. Programme decision D4 keeps
  drivers out of public MIT repos for now.

**Abstract into shared.**
- A `PaymentDriver` interface (connect, intent, capture, cancel, refund,
  status events) and a simulated driver for tests and demos, in
  `@tallyui/pos`.
- The tender pane's terminal leg uses the interface.
- Real vendor drivers (Stripe Terminal, SumUp and so on) live outside the
  MIT libraries until Paul rules otherwise.

**Connector seam.** The descriptor's `capture_mode: device|server|gateway`.
A server-captured method (for example Stripe through the store) needs a
connector call for intent and capture:
- **Woo:** `wcpos/v2/payments/{uuid}/intent|capture`.
- **Medusa:** payment sessions.
- **Vendure:** `addPaymentToOrder` with a handler.

**Size and dependencies.** M; depends on A2's descriptor.

## A4. Registers: float, pay in/out, count, numbered closures

**v2.**
- **Code:** `packages/query/src/register-session/` (the session store,
  count, close, expected, queue, carry) and
  `core/services/register-session/` (count decision, denominations,
  closure document).
- **Collections:** `register_sessions`, `cash_movements`
  (`paid_in|paid_out|no_sale|void`), `closures` (immutable, numbered) and
  the local register document with `last_closure_number` and a
  `closure_reservation`.
- **Numbering:**
  - The device mints `last + 1`, and the server counters are a floor.
  - A 409 `wcpos_closure_number_invalid` renumbers once; a 409
    `wcpos_closure_exists` marks the closure superseded.
  - Closures are sent in number order
    (`query/src/register-session/queue.ts:272-303`).
- **Recounts** are correction records (`closures/{id}/recount`).
- **Approval** is bound to the exact count (`sessions/{id}/approve`).
- **Store switch:** an open drawer can be carried to another store
  (`sessions/{id}/carry`).
- **Handover slip** on a cashier switch (`SwitchConfirm`).
- **The register directory** (`GET registers`) carries `default_float`,
  `variance_threshold` and `expected_close_time`.
- **No register ADR;** the rules are `CONTEXT.md` § "Cashiers & till"
  (lines 375-650).

**TallyUI today.** Most of it, tested:
- `packages/pos/src/register/` has schemas with `paid_in|paid_out|no_sale|void`
  (`schemas.ts:58`), `expected.ts`, count helpers and denominations,
  approval (`closeNeedsApproval`), the Z and X closure documents, CSV, the
  five `register.*` commands (ADR-068), takeover and supersede (ADR-078),
  and a `blind` option (`use-register-session.ts:117`).
- **UI:** `components/src/register/` (`OpenRegisterCard`,
  `MovementSheet`, `RegisterCount`, `ClosureSheet`, `RegisterBar`,
  `RegisterPanel`, `RegisterPicker`).

**Gaps against v2:**
- the recount/correction command;
- carrying a drawer across a store switch;
- a handover slip;
- a register directory contract with `default_float`, threshold and close
  time;
- a verified manager approval (#524);
- the open bugs #354, #366, #515 and #278;
- stale docs: `docs/registers/INTEGRATION.md` still says nothing is sent
  to a server.

**Abstract into shared.** The gaps above, as `register.*` command versions
plus the pure functions.

**Connector seam.** `listRegisters(context)`. The `register.*` commands
already go through the command outbox.
- **Woo:** the tallyui-woocommerce fork maps them onto `wcpos/v2/sessions|movements|closures`.
- **Medusa and Vendure:** their server plugins serve `/tally/v1/commands`.

**Size and dependencies.** M (five or six S units). No dependencies;
#524 needs the cashier contract (A12).

## A5. Offline cash sales and the outbox

**v2.** v2 has two durable queues:
1. **The record mutation queue** (`packages/sync-core/src/recordMutationQueue.ts`,
   drained to `POST wcpos/v2/push/{collection}`):
   - It sends `Idempotency-Key` and `If-Match` headers.
   - Backoff runs from 1s to 60s with no attempt cap.
   - Statuses are `pending → claimed → acked | conflicted | needs-revision |
     rejected`.
2. **The money-command journal**
   (`packages/query/src/store-local/money-commands.ts`, ADR 0040 §1.3):
   - It holds frozen envelopes and re-sends the same body under the same id.
   - Retries come at 30s, 120s and 600s.
   - Offline, `deferEntry` journals the command without sending it.

**TallyUI today.**
- `packages/pos/src/pos-order/` (`pos_orders` schema v10, `order.create`
  v1-v6, uuidv7 ids, `needs-attention.ts`, `reopen.ts`).
- `packages/pos/src/outbox/` (`order-outbox.ts`, `register-outbox.ts`,
  `http-transport.ts` to `POST /tally/v1/commands`).
- Golden fixtures and migration tests.

**Gaps:**
- A rejected till update halts the register sync, and the halt is not
  visible (#366).
- There is no single "Sign in again" strip for both outboxes (#373).
- The dead-letter screens are missing: v2 has
  `core/health/{rejected,conflicted}-mutations.tsx`.
- `core/src/server/versions.ts` lists `order.create` versions 1-4 while
  the till sends up to 6. This needs a check.

**Abstract into shared.** An outbox health model (pending, rejected and
needs-attention counts, requeue, discard) and a health panel in
components.

**Connector seam.** None new; this rides the existing transports.

**Size and dependencies.** M.

## A6. Sync engine

**v2.**
- **Layers:** `packages/sync-core` (pure) and `packages/sync-engine`
  (`createRxdbSyncEngine(ports, scope)`, with ports `storage`, `fetcher` and
  others).
- **Demand:** an `EngineRequirement` plane with 8 kinds
  (`require-plane.ts:246`).
- **Change feed:** a three-tier change signal (`hybridChangeSignal.ts`).
- **Politeness budgets:** per-lane caps (`maintenance/lane-registry.ts`).
  Server pressure slows only the background poll.
- **Update-required latch:** set once per engine
  (`sync-engine/src/update-required.ts`).
- **Connectivity:** `online|offline|degraded`.
- **Startup:** only tax rates are pulled in bulk.
- **Woo-shaped parts:**
  - the `woo/` folder;
  - `_woocommerce_pos_uuid`;
  - `/wcpos/v2/changes|push|integrity|digests`;
  - `QueryTotalWooRequest`;
  - the wc/v3 sort enums;
  - the wp_posts checksum tiers.

**TallyUI today.**
- Pull replication (`packages/database/src/replication.ts`).
- Reconcile passes: stock, ids, prices, calculated prices, catalogue and
  coupons (ADR-060).
- `pass-queue.ts` and one live tab (ADR-061).
- RxDB 17.5.0 on RxDB Premium SQLite.
- ADR-067 (2026-09-28) chose to consume `@wcpos/sync-core`/`sync-engine`,
  but nothing has started: no package depends on them, and they are still
  `private` in the monorepo.

**Abstract into shared.** This plan does not move to `@wcpos/sync-*`.
- **Why:** the packages are unpublished, and the monorepo is read-only for
  this lane. Under the fork ruling, the only path is to vendor about 42,700
  lines.
- **Instead:** port, on TallyUI's own sync, the v2 behaviours TallyUI lacks:
  - the update-required latch;
  - `online|offline|degraded` connectivity;
  - back-off for the background poll only, never for cashier demand;
  - epoch guards on a store switch.
- **A desk ruling is needed:** keep ADR-067 as the long-term target, or
  supersede it (Q1 in Part C).

**Connector seam.** `ReplicationAdapter` stays. The update-required check
needs each connector to map its own refusal (the Woo body
`code: wcpos_update_required`, a Medusa or Vendure plugin version
check from `/tally/v1/info`).

**Size and dependencies.** M, for the behaviours. The engine swap would be
L and is off this plan.

## A7. Refunds

**v2.**
- **Code:** `core/orders/refund/{form,modal}.tsx`,
  `use-refund-mutation.ts`, `calculate-refund.ts`.
- **Online only:** `POST wcpos/v2/orders/{id}/refunds`, with a new
  idempotency key per press.
- **Line-level amounts:** proportional and rounded half-up. Earlier refunds
  are subtracted by item id.
- **Restock:** there is no restock flag, and no fee or shipping refund
  lines.
- **Destination:** the original method or cash.
- **Receipt:** each refund has its own (`document=refund:<id>`).
- **Behaviours:** `core/orders/LEDGER.md` lines 9 and 20-41.

**TallyUI today.**
- The `order.refund` v1 logic and contract (ADR-080):
  `packages/pos/src/refund/`,
  `packages/core/src/server/refund-payload-shape.ts`.
- There is **no refund screen** in components.
- `docs/contract/field-kinds.md` has no `order.refund` section.

**Abstract into shared.**
- The refund form and modal in components, over the existing pure logic.
- A pure "refundable per line" function (earlier refunds subtracted,
  proportional tax, half-up).
- A refund receipt from `ReceiptData`.

**Connector seam.** `capabilities.orderRefund`.
- **Woo:** reports no refund capability today. The fork maps
  `order.refund` onto `wcpos/v2/orders/{id}/refunds`.
- **Medusa:** the medusapos plugin serves `order.refund`; there is nothing
  in the connector.
- **Vendure:** has the `vendureRefundable` helpers
  (`connectors/vendure/src/refunds.ts`).

**Size and dependencies.** M; depends on order history (ADR-081, shipped).

## A8. Reports screen

**v2.**
- **Code:** `core/reports/index.tsx` (`ReportsScreen`).
- **Two rooms:**
  - **Sales** is a hero chart with a comparison, plus cards that open
    panels. The panels are orders, payments, top products, categories,
    brands, cashiers, taxes, refunds, and where sold.
  - **Closures** lists closures by business day, plus the session cards.
- **Computed on the device** from `orders` and `refunds` by one module,
  `reports/report/sales-figures.ts`:
  - Payments read the ledger, so a split sale counts once per method.
  - Days are the store's, not the device's.
  - Margin needs the cost; a missing cost is never 0.
  - Refunds count on the day they were made.
- **Every panel** has Export CSV (formula-escaped) and Print (a `report`
  template).
- **Filters:** date presets, status, cashier, register and store.
- **Behaviours:** `core/reports/LEDGER.md` (45 lines) and
  `core/reports/closures/LEDGER.md` (35 lines).

**TallyUI today.**
- Only the register X and Z documents and CSV
  (`packages/pos/src/register/closure-document.ts`, `export-csv.ts`).
- Online order history (`components/src/order/order-list.tsx`,
  ADR-081).
- There is no Sales room. Programme backlog #56 is open.

**Abstract into shared.**
- A pure `@tallyui/pos` reports module (`salesFigures` over local
  `pos_orders`, refunds and fetched store orders, with store-timezone days).
- A generic formula-escaped CSV writer, lifted from the register's
  `export-csv.ts`.
- The Reports screen components: the hero, cards, panels and filters.
- A Closures room over the existing closures.

**Connector seam.**
- **Sales by store** needs every order, not only the till's: use the
  existing `listOrders` (Woo and, once wired, Vendure) plus a new Medusa
  `listOrders`.
- **Margin** needs a cost trait (`ProductTraits.cost`): Woo
  `cost_of_goods_sold`, a Medusa price-list or metadata field, and a Vendure
  custom field.

**Size and dependencies.** L. The pure figures come first, then CSV, then
the UI. It depends on A7 for refunds and on A12 for the cashier filter.

## A9. Receipts and printing

**v2.** - **Packages:** `packages/printer` (`@wcpos/printer` 1.9.1, MIT),
  `packages/receipt-renderer` (1.9.1), `packages/virtual-printer` (a
  private fake printer) and `apps/template-studio`.
- **Receipt data:** `ReceiptDataSchema` in
  `packages/printer/src/encoder/schema.ts:809`. Its sections are software,
  register, order, store, cashier, customer, lines, fees, shipping,
  discounts, totals, tax summary, payments, refunds, fiscal and i18n.
- **Templates** (`packages/database/src/collections/schemas/templates.ts`):
  - types receipt and report;
  - engines logicless (Mustache) and thermal XML;
  - output html or escpos;
  - paper 58 or 80 mm;
  - an `offline_capable` flag.
- **Rendering:** `renderLogiclessTemplate`, then `parseXml` into
  `renderHtml`, `renderEscpos` or `renderEposXml`. Barcodes use bwip-js and
  HTML goes through DOMPurify.
- **Print queue:** one serial queue per printer profile
  (`src/printer-service.ts`).
- **Transports:**
  - network: raw 9100, Epson ePOS HTTP, Star WebPRNT;
  - USB and Bluetooth: WebUSB, WebBluetooth and the vendor native SDKs;
  - the system dialog;
  - cloud printers through the plugin's `/print-jobs`.
- **Printer profiles** (`printer_profiles`) are device-local and never
  synced.
- **Behaviours** (`core/settings/printing/LEDGER.md`): "sent" is never
  shown as "printed" unless the lane acknowledges.
- **Woo coupling:** `GET /wcpos/v2/receipts/{id}`, cloud printers and the
  template gallery all live in the PHP plugin.
- **Licences:** the Epson and Star SDK licences are unverified (the audit
  had no `node_modules`).

**TallyUI today.**
- `packages/pos/src/receipt/build-receipt-data.ts`
  (`RECEIPT_SCHEMA_VERSION` 1.4.0) and `reprint.ts`.
- `components/src/sale/receipt.tsx` prints with `window.print()`.
- `emailReceipt` exists on Woo only.
- There is no template engine, ESC/POS, printer profile or queue.
  Programme backlog #18 and #48 are open.

**Abstract into shared.** - **Renderer:** a template renderer over TallyUI's `ReceiptData`, using
  logicless templates. It ships default 58 and 80 mm receipt, refund, Z and
  report templates, and outputs HTML.
- **Transports:** a `PrintTransport` interface plus a serial print queue
  per printer. The first transport is the system/browser dialog, which
  exists today.
- **Profiles:** a device-local `printer_profiles` collection.
- **ESC/POS:** an encoder for thermal output (a protocol, not a vendor SDK;
  see Q2).
- **Kept out of the MIT packages:** vendor SDK lanes (Epson, Star) and
  cloud printing.

**Connector seam.** Optional `emailReceipt` (Woo has it). The templates are
client-side, so no server is needed.

**Size and dependencies.** L.

## A10. Settings

**v2.** v2 has seven sections, listed in `core/settings/index.tsx`:

- **General:** store name and address (read-only), locale, currency
  format, the default customer, and "Restore server settings".
- **Tax:** these mirror WooCommerce's own options.
- **Printing:** printers, routing of templates to printers, the templates
  themselves, and cloud printers.
- **Card readers.**
- **Customer display:** the pairing code and paired displays.
- **Barcode scanning:** wedge thresholds, prefix and suffix, sound, input
  sources, and a test panel.
- **Theme:** theme, scale, icons and fonts.

Storage:

- Most values are fields on the `stores` document, written with
  `patchStoreSettings`.
- Device records live in the `printer_profiles`, `scanner_profiles` and
  `template_printer_overrides` collections.

**TallyUI today.**
- Presentational pieces only: `components/src/settings/settings-group.tsx`,
  `settings-row.tsx` and `connector-status.tsx`.
- Store settings are read from the store (`packages/pos/src/store-settings/`).
- There is **no app or user settings state and no persistence**.

**Abstract into shared.**
- A local, never-replicated `app_settings` collection with a typed key map
  and a `useAppSettings` hook in `@tallyui/pos` (CLAUDE.md: never write
  locally into a replicated collection).
- The v2 settings sections in components.

**Connector seam.** None for device settings. Store settings stay read-only
from the connector.

**Size and dependencies.** M. A1, A9 and A11 depend on it.

## A11. Customer display pairing

**v2.** - **Code:** `core/services/customer-display/`.
- **Connection:** WebRTC over the local network only (`iceServers: []`),
  with an ordered data channel named `wcpos-display`.
- **Pairing codes and signalling** go through the WordPress site:
  `POST {root}/pairings` and `displays/{id}/signal`
  (`signaling-client.ts`).
- **Messages:** the envelope `{wcpos: 1, id, action, payload}`
  (`envelope.ts`). The actions are `cart.updated`, `display.config`,
  `display.hello`, `display.idle` and `payment.state`.
- **Snapshot:** capped at 200 KiB and built from `buildReceiptData`.
- **The display page** is served by WordPress and needs Pro.
- **Neutral parts:** the peer, the envelope and the snapshot.
- **Woo/Pro parts:** the signalling and the page.

**TallyUI today.** Absent; the programme deferred it
(`docs/plans/2026-09-programme.md:228`).

**Abstract into shared.** - **Protocol:** the envelope and actions, a snapshot builder over
  `ReceiptData` with the 200 KiB cap, and the display states idle, cart and
  payment.
- **Transport:** a `DisplayTransport` interface. The first transport is a
  same-device second window over BroadcastChannel, proven in Playwright
  Chromium per CLAUDE.md.
- **Display screen** components.
- **LAN pairing** (WebRTC plus signalling on each backend's server plugin)
  is a later unit (see Q3).

**Connector seam.** None.

**Size and dependencies.** M; depends on A10.

## A12. Cashiers, permissions, store selection

**v2.**
- **The cashier record** (`wp_credentials`) holds roles, capabilities and
  stores. Every gate reads a capability.
- **Capabilities the client checks:**
  - `view_woocommerce_pos_reports`: Reports access, and a non-blind count;
  - `manage_woocommerce_pos_closures`: recount, and approving an override;
  - `manage_woocommerce_pos`.
- **Other permissions** are enforced only by server refusals.
- **`SwitchConfirm`** confirms cashier, store, register and sign-out
  switches, warns about unsent sales and can print a handover slip.
- **Cashiers:** one database per cashier.

**TallyUI today.**
- There is no cashier, role or capability contract. Programme backlog #15
  and #57 are open.
- Customers are online only (`searchCustomers`/`createCustomer`/`getCustomer`).

**Abstract into shared.**
- Neutral POS permissions (`viewReports`, `manageClosures`,
  `approveVariance`, `refund`, `discount`) resolved by the connector from
  its own model, plus a `can()` hook.
- `SwitchConfirm` in components.

**Connector seam.** `cashier(context)` returns `{id, name, permissions}`:
- **Woo:** WordPress capabilities.
- **Medusa:** admin user plus RBAC metadata.
- **Vendure:** Administrator roles and permissions.

**Size and dependencies.** M.

## A13. Barcode scanner

**v2.** `packages/scanner` (private, uses only rxjs) has:

- **Detection and decoding:** `wedge-detector` (a keyboard-wedge timing
  heuristic with prefix and suffix strip), `burst-assembler`,
  `serial-line-decoder` and `hid-pos-decoder`.
- **Sessions:** `scan-dedup` and `scan-session` (cooldown, check digit,
  UPC-A/EAN-13 leading-zero normalisation).
- **Routing:** `scan-events` (a scan bus per surface).

Lookup (`packages/sync-core/src/barcodeResolve.ts`):

- The local index comes first, then `GET resolve/barcode`.
- It emits `searching-online` before any await, and has one budget of about
  10 seconds.
- Settings follow `core/settings/barcode-scanning/LEDGER.md`.

**TallyUI today.** Lookup only: an exact code in `searchProducts`
(`packages/pos/src/product/search-products.ts`) and `findEntryByCode`
(`packages/pos/src/sale/catalogue.ts`). There is no scanner listener.

**Abstract into shared.** - **Scanning:** a keyboard-wedge detector, scan normalisation (UPC-A/EAN-13)
  and a scan bus, pure and framework-free in `@tallyui/pos`, plus a
  `useBarcodeScanner` hook.
- **Settings:** a section in components.
- **Hardware:** Web Serial and WebHID come later. They are Chromium-only
  and need a browser proof.

**Connector seam.** A barcode trait, which exists. A server barcode lookup
for products that aren't resident is optional:
- **Woo:** `wcpos/v2/resolve/barcode`.
- **Medusa:** a variant `barcode` filter.
- **Vendure:** the opt-in custom field (ADR-059).

**Size and dependencies.** S.

## A14. Cart and order math, and the rest of the sale

**v2.** `packages/order-math`:
- **Settle pipeline:** coupons, then percent fees, then totals, giving one
  `SettlePatch` (`settle.ts:277-284`).
- **Quirks** marked `QUIRK(parity)`.
- **Money ownership:** "WooCommerce owns money" (ADR 0032). Totals are
  stripped from pushes (`sync-core/src/woo/orderWriteContract.ts`).
- **Related pieces in `core/pos/`:**
  - **Open orders as tabs:** `tabs.tsx`, `tab-chip.tsx` (a "Partly paid"
    chip), `open-orders-list.tsx`.
  - **Lines and charges:** misc product, line split, fees and shipping.
  - **Order changes:** void (one leg at a time), note, tax exempt
    (`commands/tax-exempt.ts`), stock guard.

**TallyUI today.** Deep and tested:
- **Order and tax math:** `packages/pos/src/order/`, `pos/src/tax/exact.ts`
  (ADR-037), the Woo tax engine port (`core/src/tax/woocommerce/`, ADR-076)
  and Woo coupons (`core/src/coupons/woocommerce/`, ADR-077).
- **Lines:** fee, shipping and custom lines (ADR-075).
- **Parked sales:** `pos/src/order/use-parked-sales.ts`.

**Gaps:**
- the sale note (#520);
- customer edit (#521);
- variation attributes on the line (#495, needs-paul);
- coupons (#501);
- tax exempt;
- line split;
- open orders shown as tabs;
- server order history in the orders panel (#540).

**Abstract into shared.** Each gap as its own unit. Open-order tabs build on
parked sales.

**Connector seam.**
- **Note:** Woo `customer_note`, Medusa order `metadata`, Vendure
  `addNoteToOrder`.
- **Tax exempt:**
  - Woo `is_vat_exempt`;
  - Medusa customer group tax rules;
  - Vendure: no direct equivalent, so the connector reports it as
    unsupported.

**Size and dependencies.** M, as several S units.

## A15. i18n

**v2.** - **Code:** i18next and react-i18next, in `core/contexts/translations/`.
  Strings are read with `useT`.
- **Catalogue:** one bundled English catalogue
  (`locales/en/core.json`, symbolic keys).
- **Other languages** come from jsDelivr `wcpos/translations@<version>`
  and are cached in the user database.
- **Fallback** goes from a regional locale to its base, for example `fr_CA`
  to `fr`.
- **Receipts** have their own locale (`receipt_i18n`).

**TallyUI today.**
- There is no framework. Component text is hard-coded English (for example
  `components/src/sale/tender.tsx`).
- The register documents take `ClosureContext.i18n`
  (`pos/src/register/closure-document.ts:39`).
- Money uses Intl.

**Abstract into shared.** - An i18next-based provider and `useT` in `@tallyui/components`, with an
  English catalogue per package.
- String extraction one area at a time, starting with tender.
- Locale from store settings, falling back to the device.
- Receipt and closure documents keep their own label maps.

**Connector seam.** None. The locale comes from store settings or the device.

**Size and dependencies.** M, with an L tail (string extraction across
components).

---

# Part B. Ordered backlog

Every unit is one PR in this repo, specced by the shared-libraries worker,
implemented on the Codex or Opus lane, reviewed, and merged on green.

**Columns:**
- **Apps:** which apps need the unit. M is medusapos, V is vendurepos, W is
  tallyui-woocommerce.
- **Door:** two-way or one-way. One-way units (wire contracts, collection
  schemas) get an ADR in `docs/DECISIONS.md` first and the `needs-paul`
  label.
- **Asked:** a need already fd-noted by an app worker (medusapos audit,
  2026-11-10).

The order is: what all three apps need and nothing blocks; then what
unlocks the most UI; then per-backend connector units. Units within a wave
are independent and run in parallel.

### Wave 1: unblocked foundations (start now)

| # | Unit | Package(s) | Area | Size | Deps | Apps | Door | Asked |
|---|---|---|---|---|---|---|---|---|
| 1 | Docs truth pass: `docs/registers/INTEGRATION.md` says registers do not sync (they do, ADR-068); programme backlog statuses #1, #3, #8, #12, #14, #16 | docs | A4, A5 | S | — | all | two-way | |
| 2 | Check `core/src/server/versions.ts` `SUPPORTED_ORDER_CREATE_VERSIONS = [1,2,3,4]` against the till's v6 (`pos/src/pos-order/command.ts:75-88`); fix it or document why | core | A5 | S | — | M V | two-way | |
| 3 | `app_settings`: a local, never-replicated collection with a typed key map and `useAppSettings` | pos | A10 | S | — | all | two-way (new local collection) | |
| 4 | Scale: nine size tokens per step (`auto/compact/regular/spacious`, the v2 values), pointer floors, `MAX_FONT_SCALE` 1.3, and a `ScaleProvider` that applies them, with web portals scaled too | theme, components | A1 | M | 3 | all | two-way | M |
| 5 | Fonts: font-family tokens, a `FontProvider` and a `fonts` setting; the apps bundle the OFL font files | theme, components | A1 | S | 3 | all | two-way | M |
| 6 | Sale note: `useSale().setNote`, `order.create` note (#520) | pos, core | A14 | S | — | all | one-way if the wire changes (check v6 first) | M |
| 7 | `Connector.updateCustomer` in core, with addresses and tax ids (#521, core half) | core | A14 | S | — | all | two-way (optional method) | M |
| 8 | `PaymentMethodDescriptor` type and an optional `Connector.paymentMethods()` (no wire change) | core | A2 | S | — | all | two-way | |
| 9 | Refundable per line: a pure function that subtracts earlier refunds by item id, computes proportional tax and rounds half-up (v2 `core/orders/LEDGER.md` 20-41) | pos | A7 | S | — | all | two-way | M |
| 10 | Sales figures: a pure `salesFigures` over `pos_orders`, refunds and store orders. Store-timezone days; payments by method (a split sale counts once per method); top products, categories, taxes and refunds by the day made | pos | A8 | M | — | all | two-way | M |
| 11 | Generic CSV writer, formula-escaped, lifted from `pos/src/register/export-csv.ts` | pos | A8 | S | — | all | two-way | |
| 12 | Barcode: a keyboard-wedge detector, UPC-A/EAN-13 normalisation and a scan bus, pure; plus a `useBarcodeScanner` hook | pos | A13 | S | — | all | two-way | |

### Wave 2: the sale screen to v2

| # | Unit | Package(s) | Area | Size | Deps | Apps | Door | Asked |
|---|---|---|---|---|---|---|---|---|
| 13 | Register contract 3: `register.closure.submit` carries a verified manager approval (#524) | core, pos | A4 | M | — | M (blocking), V, W | one-way (ADR) | M |
| 14 | Payment legs: status `pending/authorized/captured/failed/voided` in the tender state, captured-only balance, leg void | pos | A2 | M | 8 | all | two-way (local state only) | M |
| 15 | Cash rounding: a pure rounding function per method and currency, shown in the tender state (the wire line is unit 24) | pos | A2 | S | 8 | all | two-way | |
| 16 | Tender pane redraw to v2: ledger legs, balance headline, keypad, quick-cash chips (exact amount, then round-ups to 5/10/50), leg void | components | A2 | M | 14 | all | two-way | M |
| 17 | `PaymentDriver` interface, a registry and a simulated driver (the v2 shape: `availability`, `collect`, `status$`) | pos | A3 | M | 8 | all | two-way | |
| 18 | Terminal leg view and reader connection over `PaymentDriver` | components | A3 | M | 16, 17 | all | two-way | |
| 19 | Open orders as tabs: several open sales in `useSale`, cart tabs with a "Partly paid" chip, built on parked sales | pos, components | A14 | M | — | all | two-way | M |
| 20 | Refund form and modal over unit 9 and `order.refund` v1 | components | A7 | M | 9 | all | two-way | M |
| 21 | `docs/contract/field-kinds.md`: an `order.refund` section | docs | A7 | S | — | M V | two-way | M |
| 22 | Settings › Display: theme, Scale and Fonts sections over units 3-5 | components | A1, A10 | S | 4, 5 | all | two-way | M |
| 23 | Outbox health: rejected and needs-attention counts, requeue and discard for both outboxes; one "Sign in again" strip (#366, #373) | pos, components | A5 | M | — | all | two-way | |

### Wave 3: Reports, printing, registers, the wire

| # | Unit | Package(s) | Area | Size | Deps | Apps | Door | Asked |
|---|---|---|---|---|---|---|---|---|
| 24 | `order.create` v7: payment status and provider refs per payment, plus the cash rounding line | core, pos | A2 | M | 14, 15 | all | **one-way** (ADR first) | |
| 25 | Reports screen, Sales room: the hero chart with a comparison, the cards, and filters (date presets in store time, status, cashier, register) | components | A8 | M | 10 | all | two-way | M |
| 26 | Report panels: full rows, CSV export and print | components | A8 | M | 11, 25 | all | two-way | |
| 27 | Closures room: closures by business day and session cards, over the existing closures | components | A8, A4 | M | 25 | all | two-way | |
| 28 | Receipt template renderer: logicless templates over `ReceiptData`; default 58 and 80 mm receipt, refund, Z and report templates; HTML output | pos | A9 | M | — | all | two-way | |
| 29 | `PrintTransport` interface, a serial queue per printer and device-local `printer_profiles`; a system/browser transport | pos | A9 | M | 28 | all | two-way | |
| 30 | Cashier permissions: an optional `Connector.cashier()` returning neutral permissions (`viewReports`, `manageClosures`, `approveVariance`, `refund`, `discount`), plus `can()`; the blind count and Reports gate read it | core, pos | A12 | M | — | all | two-way | |
| 31 | Register directory: an optional `Connector.listRegisters()` with `defaultFloat`, `varianceThreshold`, `expectedCloseTime`; float suggestion = default float, else the last counted cash | core, pos | A4 | S | — | all | two-way | |
| 32 | Recount: `register.closure.recount` v1 correction records, with the settled figure shown beside the recorded one | core, pos | A4 | M | 13 | all | **one-way** (ADR) | |
| 33 | Handover slip and `SwitchConfirm` (cashier, register and sign-out switches; warns about unsent sales) | pos, components | A4, A12 | S | 30 | all | two-way | |
| 34 | Connectivity `online/offline/degraded` and an update-required latch per connector (each maps its own refusal) | core, database | A6 | M | Q1 | all | two-way | |
| 35 | i18n foundation: i18next provider, `useT`, English catalogue; tender strings first | components | A15 | M | 16 | all | two-way | |

### Wave 4: devices and the long tail

| # | Unit | Package(s) | Area | Size | Deps | Apps | Door |
|---|---|---|---|---|---|---|---|
| 36 | Customer display protocol: envelope, actions, a snapshot over `ReceiptData` with a 200 KiB cap, display states | pos | A11 | S | 28 | all | two-way |
| 37 | Display transport over BroadcastChannel (a same-device second window), proven in Playwright Chromium, plus the display screen components | pos, components | A11 | M | 36, Q3 | all | two-way |
| 38 | ESC/POS encoder transport for thermal printers | pos (or its own package) | A9 | M | 29, Q2 | all | two-way |
| 39 | Barcode settings section and a test panel | components | A13 | S | 12, 22 | all | two-way |
| 40+ | i18n extraction, one component area per PR (cart, register, product, settings, reports) | components | A15 | S each | 35 | all | two-way |
| — | Tax exempt per sale (Woo `is_vat_exempt`; Medusa customer-group rules; Vendure reports unsupported) | core, pos | A14 | M | — | all | one-way |
| — | Line split (`cart.line.split`) | pos | A14 | S | — | all | two-way |

### Connector units (this repo's `connectors/`), each S unless marked

| Unit | Connector | Need | Deps | Asked |
|---|---|---|---|---|
| Medusa `listOrders`/`getOrders` over a `/tally/v1/orders` contract (store order history) | medusa | A8, A7 | the medusapos plugin route | M |
| Medusa `emailReceipt`, plus a "Receipt email" action in components | medusa, components | A9 | the medusapos plugin route | M |
| Medusa `updateCustomer` | medusa | A14 | 7 | M |
| Vendure: wire `listVendureOrders`/`getVendureOrder` as `listOrders`/`getOrders` (exported but not wired) | vendure | A8, A7 | — | |
| Vendure `updateCustomer` | vendure | A14 | 7 | |
| Woo `updateCustomer` (#521, Woo half) | woocommerce | A14 | 7 | |
| `paymentMethods()` for each of Woo, Medusa and Vendure | all three | A2 | 8 | |
| `cashier()` for each of Woo (WordPress capabilities), Medusa and Vendure | all three | A12 | 30 | |
| `listRegisters()` for each of Woo (`wcpos/v2/registers`), Medusa and Vendure | all three | A4 | 31 | |
| Woo transport onto WCPOS 2.0's `wcpos/v2` money endpoints (the payments ledger, `orders/{id}/close`, refunds) instead of 1.10.x push/orders (ADR-073), size L | woocommerce | A2, A5, A7 | Q4 | W |
| Woo stock reconcile adapter for `@tallyui/database` `startStockReconcile`, for v2's stock numbers on tiles | woocommerce | A6 | — | W |
| Woo term feeds: categories, tags and brands, with parent, image and count, for v2's Browse by and the brand and featured quick filters | woocommerce | A14 | — | W |
| Woo customers replicated into a local collection, for v2's offline customer search | woocommerce, database | A14 | — | W |
| Woo full tax-rate table with locations, plus `tax_based_on`, tax display and `prevent_overselling` on `StoreSettings` | woocommerce, core | A14 | — | W |
| Woo online barcode and exact-SKU lookup over `wcpos/v2/products` when a scan misses locally | woocommerce | A13 | 12 | W |

### Shared units asked by the apps after the plan (2026-11-10)

These came from the tallyui-woocommerce worker (W) and medusapos (M) on 2026-11-10. They are shared units, in the
order they will be taken once waves 1 and 2 have room.

| Unit | Package(s) | Area | Size | Door | Asked |
|---|---|---|---|---|---|
| Decimal quantities in `OrderBuilder.addLine` and `updateQuantity`, and on `order.create` (the builder rejects non-integers today) | pos, core | A14 | M | one-way (wire) | W |
| Stock guard in `useSale.add` and `setQuantity`, driven by `preventOverselling` | pos | A14 | S | two-way | W |
| `useSale.updateLine` (name, SKU, regular price), and `addCustomLine` with SKU, virtual, downloadable and categories | pos | A14 | S | two-way | W |
| Tax-rate matching by the customer's billing or shipping address, retaxing when the customer changes (`tax_based_on`) | pos | A14 | M | two-way | W |
| `MovementSheet`: reason chips for pay in and pay out | components | A4 | S | two-way | W |
| A `status` field (the HTTP status) on `CustomerServiceError`, so a retry need not parse the message | core | A9 | S | two-way | W |

The tender keypad for Woo waits for unit 16. The W worker's test-id spec,
`~/agent/handoff/tallyui-woo-tender-keypad-spec-2026-11-10.md`, is input to that unit. The sale note (unit 6)
goes in `order.create` v7, because the medusapos plugin refuses unknown payload fields.

**Open issues this backlog absorbs:** #366, #373 (unit 23); #501 and #495
(coupons and variation attributes; #495 stays needs-paul); #520 (unit 6);
#521 (unit 7 and its connector units); #524 (unit 13); #540 (order history
units). The remaining register bugs (#278, #354, #515, #559) are picked up
next to unit 13 or 32, whichever touches the same file.

---

# Part C. Questions for the desk

These need a desk ruling. Each one has a recommendation, and the work that
does not depend on it carries on meanwhile.

- **Q1. ADR-067 (consume `@wcpos/sync-*`).** The packages are still
  private, and the monorepo is read-only for this lane.
  - **Recommendation:** supersede ADR-067 for now. Keep TallyUI's own sync
    (pull, reconcile and command outbox) and port the v2 behaviours it
    lacks (unit 34, A6).
  - **What it unblocks:** unit 34.
- **Q2. Hardware in MIT packages** (programme D4, ADR-033).
  - **Recommendation:** the interfaces, the simulated card driver, the
    system print transport and an ESC/POS encoder go into the MIT packages,
    because they are protocols and logic. Vendor SDK drivers (Stripe
    Terminal, SumUp, Epson, Star) stay out until Paul rules.
  - **What it unblocks:** unit 38, and the vendor-driver policy for units
    17 and 29.
- **Q3. Customer display transport.** v2 uses WebRTC with signalling through
  WordPress, and needs Pro.
  - **Recommendation:** first a same-device second window
    (BroadcastChannel). LAN pairing later, through each backend's own
    server-plugin signalling.
  - **What it unblocks:** unit 37.
- **Q4. The Woo connector's target.** It writes to WCPOS 1.10.x (ADR-073);
  WCPOS 2.0 shipped on 2026-11-09 with a `wcpos/v2` payments ledger,
  server-side close and a refunds endpoint.
  - **Recommendation:** move the connector to 2.0 on the
    tallyui-woocommerce worker's request, inside the TallyUI fork of the
    plugin if a server change is needed (fork ruling).
  - **What it unblocks:** the Woo transport unit.
