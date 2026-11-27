# @tallyui/core

## 5.4.0

## 5.3.0

### Minor Changes

- 9943567: ADR-048's rounding tolerance counts discounted lines on a store that taxes each discount as its own row. `TallyConnector` gains an optional `discountsAreTaxedRows`, and `needsAttention` takes a matching option, which `OrdersList` reads from the connector. When it is set, a `total_mismatch` bridge is a notice only up to ⌈(lines + fees + shipping + discounted lines) / 2⌉ minor units, where a discounted line is one the `order.create` payload sends with `discountMinor` above 0. Without it, nothing changes. `@tallyui/connector-vendure` sets `discountsAreTaxedRows: true`; an app that builds its own connector object must set it too. The vendurepos plugin must count its per-rate tolerance T from the same rows of the payload (vendurepos/app#532). The bound was probed on tax-exclusive lines of quantity 1; inclusive channels, quantity above 1, fees and shipping were not probed.

## 5.2.0

### Minor Changes

- 429e1ae: A fee or shipping charge entered in a mode other than the store's is sent in its own mode (`amountIncludesTax`), but only to a store whose connector declares `chargeTaxMode`. connector-vendure maps `/tally/v1/info`'s `chargeTaxMode: { v: 1 }`.

  This ends the one-cent drift of an inclusive fee in a tax-exclusive Vendure store. Without the capability, order.create sends the same bytes as before.

  - **Apps:** nothing to do beyond passing the connector's capabilities to `finalizeOrder`, as before. The WooCommerce and Medusa connectors need no change.
  - **Servers built on `@tallyui/core/server`:** a server whose connector declares the capability must pass `supported.chargeTaxMode: true` to `precheckCommand`. Otherwise it refuses every sale that carries `amountIncludesTax` with `invalid_payload`.
  - **Storage is one-way.** `pos_orders` moves to schema version 23, an identity migration: no stored order is rewritten, and v23 only adds the optional `entered` on fee and shipping items. Once a till has opened this version, an older build opens the store but shows none of its orders, as with versions 21 and 22. The sales it rings meanwhile are migrated in when the till opens at 23 again. Never roll an app back across this version.

- fd25afd: **Behaviour change.** Cancel order on store and Give back and cancel are offered only while the register session that took every till payment is still open, and the outbox checks again when the store answers. An app that wires `onCancelOnStore` (5.1.0) loses the button until it passes `OrdersList`'s `openSessionId` and `useOrderOutbox`'s `openSessionId`. An app with no register sessions loses it. Once that session has closed, a manager must settle the sale in the store's admin.

  A refused sale left part paid on the store can now offer “Give back and cancel” through `OrdersList`'s `onReverseOnStore`. The WooCommerce connector implements the optional `RefusedOrderSettlement.reverse`: it voids only the till's recorded manual payments, then reads the order again before cancelling. The outbox's `reverseOnStore` keeps the attempt, command ids and confirmed voids across retries. The till names each payment to give back by hand and leaves that money out of its expected figures; if a step fails, the row stays in Needs attention with the confirmed progress.

  The cancel notice of 5.1.0 was wrong. It asked for cash given back after Cancel order on store to be recorded as a pay-out, which counted that cash twice against the store's figures. It now lists what to give back, and the till's expected cash, drawer terms and closure leave out the payments of an order cancelled on the store and each payment the store confirmed voided.

- 7cff720: Refunds price from an order line's as-sold figures when the store sends them: `StoreOrderLine` gains optional `soldTotalMinor`, `soldTaxMinor` and `returnedQuantity`, which connector-medusa maps from MedusaPOS plugin contract 7. A connector may declare `lineTotalsShrinkOnReturn` (connector-medusa does); the refund form then refuses a partial refund of a line without sold figures and asks for the store plugin to be updated. New `useOptionalConnector()`. Other connectors are unchanged. The medusapos app must pass the store's own rejection message (money_drift) on to the cashier: reject the refund form's confirm with an Error carrying that message, or pass it as `error`, and the form shows it as written.

## 5.1.0

### Minor Changes

- b1962cf: `precheckCommand` now refuses an order.create payload that fails the shape check at every version, not only version 5 and later, as `invalid_payload` with the same messages. The same applies to an order.update's create part at any `createVersion`. A command the store has already applied still replays as `duplicate` when the plugin runs its replay lookup before `precheckCommand`, as documented.
- aba5fd7: A refused sale whose order the store created part paid can now have the rest recorded on the store from the till, with no new money taken. `@tallyui/core` adds `SettlePayment`, `SettlePayRequest` and `SettlePayResult`, and `RefusedOrderSettlement` gains an optional `pay`. The WooCommerce connector's `pay` reads the order, records the till's unrecorded payments under new ids only when the store's amount due is exactly their sum and the order is still open, then reads it again: only a completed order is `done`. `@tallyui/pos` adds `canPayRestOnStore`, `unrecordedLegs` and the outbox's `payRestOnStore`; `useOrderOutbox`'s `storeSettlement` option takes the connector's `pay` too and the hook returns `payRestOnStore(orderId)`. The attempt and its payment ids are stored as `storeSettlement` (kind `pay`) before the call, so a repeat sends the same ids; no schema change. `settledOnStore` now counts a `gone` settlement as settled only when the store had recorded nothing. `OrdersList` takes `onPayRestOnStore`, which adds "Pay the rest on store" behind a confirm dialog naming each payment to record; with it, a row with money recorded on the store has no Retry. `OrderSyncNotices` says where the pay stands, never with the store's code or message, and a cancelled sale with cash legs now asks the cashier to record any cash they gave back as a pay-out.
- 93fb2b9: Adds `TallyConnector.settleRefusedOrder` with the `SettleOutcome`, `SettleCancelRequest` and `RefusedOrderSettlement` types, and the WooCommerce `settleRefusedOrder.cancel`: it reads the order the store created before refusing a sale through a WCPOS 2.0 read push, and cancels it with the revision that read returned only when the store's record shows nothing paid and the order is still pending or open; otherwise it answers `changed`, `refused`, `gone` or `retry`.

### Patch Changes

- 2ef5a3d: `precheckCommand` now also refuses a malformed order.refund, order.reopen or register command payload as `invalid_payload`, with the messages of `refundPayloadErrors`, `reopenPayloadErrors` and `registerPayloadErrors` (at most 10, joined with `; `). The version check still answers first. Plugins still run the shape check themselves before any lookup; this is a backstop for one that skips it.

## 5.0.0

### Minor Changes

- 501e189: A cash payment that settles a sale under its method's rounding records the difference in `Order.cashRoundings`, counted in the total and stored in `pos_orders` 21 (identity migration). A rounded sale needs a store whose connector declares the `cashRounding` capability on `ServerCapabilities`; without it the till does not round, finalize refuses an order with entries, and `precheckCommand` refuses `cashRoundings` as `invalid_payload`.
- bfab53c: Order payloads whose display figures do not add up (ADR-063 I1–I3) are now refused as invalid_payload.

  A store that takes this version refuses such a payload from any till, including one an older till still holds in its outbox. The check runs on version 3 and later payloads that carry `display` and `taxByRate` and pass the shape check; a version 3 or 4 payload that fails the shape check is not checked here. A command the store has already applied still replays as `duplicate`. The oldest `@tallyui/pos` proven to satisfy I1–I3 is 3.20.1: 200 seeded sales built by each of 3.20.1, 4.0.0, 4.1.0 and 4.2.0 pass the new check (both tax modes, line and order discounts, coupons, fees and shipping). 3.10.0 and 3.3.0 could not be run, and the other versions were not run. The run does not build return lines, reopened orders or charges with `amountIncludesTax`, and those versions have no cash rounding. On Woo with prices including tax it leaves out fees and shipping (#1341), and an order discount with a coupon (#1342): a check that predates this change can already refuse those sales.

- 86f3d40: `parseCommandResult` accepts a stock-only refund result: `totalMinor` 0, `byMethod` `{}`, `refunds` `[]` (ADR-080, #1330).
- 96f8789: `StoreOrderRefund` gains optional `lines` (`StoreOrderRefundLine`): the order lines a store refund paid back (#1324).
- d104073: Add the parked needs_admin command outcome while preserving transport retries.
  Keep a marker on pending refunds and expose RefundNeedsAdminNotice with Check again.
  Tell cashiers when stuck sales need a manager in the store admin.
- 8e15960: A store sale now counts on its paid day. `ListOrdersQuery` gains an optional `modifiedAfter` filter (WooCommerce `modified_after`), and the WooCommerce connector lists it. The new `salesRangeQuery` builds a sales report's read: with `modifiedAfter` it fetches orders changed since the range start and created before its end. `reportOrderFromStoreOrder` places a store order on `paidAt`, or on `placedAt` when the order has none. So a WooCommerce order created in a report's range but paid after it now counts on its paid day, as in WCPOS v2.

  Upgrading: build a report's read with `salesRangeQuery`. A report that still reads a WooCommerce store with `dateRange: { after, before }` now loses every order paid on a later day than it was created, because the created-day read fetches it and `salesFigures` drops it from that day.

- 837bb5f: `@tallyui/core/server` now installs in a store without react: `react` becomes an optional peer, and the built server entry imports no react, rxdb or rxjs. Core now exports the till's BigInt refund share, `refundableLines`, `priceRefund` and their types `RefundableOrderLine`, `EarlierRefund`, `RefundableLine`, `PricedRefundLine` and `PricedRefund`, with `roundRatio` and `RoundingMode`, from both its root and `./server`. `@tallyui/pos` re-exports the same functions under the same names. `SUPPORTED_REGISTER_VERSIONS` now lists 1, 2 and 3, the register versions the till builds.

  This is not a major change. No export is removed or renamed, and the `react` peer only loosens. `SUPPORTED_REGISTER_VERSIONS` is documented as the till's capability, and a server passes its own list to `precheckCommand`. A server that passed core's constant as its own list will now accept register versions 2 and 3.

- 710b62f: `StoreOrder.cashierId`, `storeId` and `registerId` (all optional) name the cashier, store and register the store records for an order, as `ListOrdersQuery` filters them. WooCommerce reads `_pos_user`, `_pos_store` (a WordPress id; 0 means none) and `_wcpos_register` (written only by WCPOS, so absent on orders TallyUI rings).
- 04c375d: `StoreOrder.createdVia` (optional) says where the store records the order was created, in the platform's own words; WooCommerce reads it from `created_via`. Absent when the store records none.
- e5c8503: `StoreOrder.needsPayment` (optional) says the store reports the order still owes money; WooCommerce reads it from `needs_payment`. Reports label a store order's unpaid remainder `unpaid` when it is true, so Taken no longer counts it; when the flag is false or absent the remainder stays `unknown` and counts toward Taken, as before.
- 1704c9d: `StoreOrder` gains an optional `paidAt`: when the store recorded the order as paid, as an ISO 8601 UTC instant. It is absent while the order is unpaid, or when the store records no paid date. The WooCommerce connector reads it from `date_paid_gmt` and never falls back to the site-local `date_paid`. A value that does not parse leaves no `paidAt`.
- eda38cf: `@tallyui/core` gains the optional, online, read-only `TallyConnector.listRefunds` member, its `StoreRefund`, `StoreRefundOrphan`, `ListRefundsQuery` and `StoreRefundPage` types, and `StoreRefundsUnsupportedError`, so refunds can be dated by when they were made (ADR-081 decision 7).

  `@tallyui/connector-woocommerce` implements `listRefunds` over WCPOS 2.0's `wcpos/v2/refunds` read, reading each refund's currency from its order and rejecting with `StoreRefundsUnsupportedError` below WCPOS 2.0.0.

### Patch Changes

- 2ebf613: A till now lowers its perpetual refunds to the store's figure after its newest applied closure, once nothing of its own is unsent, and raises them only from the store's figures at its newest closure number.

## 4.2.0

## 4.1.0

## 4.0.1

## 4.0.0

### Major Changes

- c83dcda: **4.0.0: the till's customer-display API takes a device key.** This is a breaking change for apps that implement `DisplaySignalling` or call `createTillPairing` or `createTillDisplayService`.

  Migration:

  - `DisplaySignalling`'s nine till methods take `TillDevice { deviceId, deviceKey }` in place of `deviceId`. Implement the new `registerDevice`, and handle the `device_refused` refusal.
  - `createTillPairing` and `createTillDisplayService` take `device` (from `createTillDevice`) in place of `deviceId`.
  - Store the device key next to the device id, and never replicate it. An existing till registers on first use and keeps its paired displays.

### Minor Changes

- fae1b1a: `@tallyui/core` adds `MoneyFormatProvider`, `useFormatMoney` and `useCurrencySymbol`. `@tallyui/pos`'s `CurrencyProvider` renders the provider, and every `@tallyui/components` money amount and money-input symbol now reads the store's money format when one is provided. Without a provider, nothing changes. `discountLabel` takes an optional formatter as its third argument.
- 028c0e3: `ProductCategory` takes an optional `imageUrl`, the category's picture for browse tiles.
- 3942708: `fnv1a32(text, { pad })`: the 32-bit FNV-1a hash the platform apps use for database names, as lowercase hex (inventory C22).
- 81198d2: `formatMoney(money, locale, format)` takes an optional store money format (`MoneyFormat`: currency position, thousand and decimal separators, decimals, symbol), as WooCommerce stores set them; without one it reads exactly as before, through Intl. `@tallyui/pos`'s `CurrencyProvider` now formats through it, and its `CurrencyFormat` type is `MoneyFormat`.
- fed2ec4: order.create version 10: a payment may carry `methodId`, the payment method's own id (shape-checked: 1–64, no NUL; refused below 10). New `wireMethodOf` and `legMethodId` helpers.
- 1f40158: `ratePpmFromPercent` is exported from `@tallyui/core` and `@tallyui/core/server` (moved from `@tallyui/pos`, which still re-exports it), so servers can convert rate percentages without vendoring pos.
- bc9a686: `reopenPayloadErrors` and `updatePayloadErrors` accept a `baseRevision` of up to 128 characters (ADR-090); a store revision is an opaque token, and WooCommerce's is 71. Ids stay at 64.
- c9403ce: `@tallyui/core/server` now ships a CommonJS build beside the ESM one, so CommonJS backend plugins can `require('@tallyui/core/server')`. The `./server` export map gains a `require` condition (`dist/server/index.cjs`, types `dist/server/index.d.cts`); `import` resolves exactly as before. The main entry and `./rxdb` stay ESM-only.
- b6e936c: **Breaking for DisplaySignalling implementers**

  - The nine till methods take `TillDevice { deviceId, deviceKey }` in place of `deviceId`, and `registerDevice` and the `device_refused` refusal are new.
  - `createTillPairing` and `createTillDisplayService` take `device` (from `createTillDevice`) in place of `deviceId`.
  - Migration: a plugin adds the register route and checks the key on every till route; an app stores the key next to the device id (never replicated); an existing till registers on first use and keeps its paired displays.

  A till now proves itself to the store with a key the store issued, so knowing a till's device id is no longer enough to act as that till on its customer displays.

- d034d9f: A store can report the lines whose figures it computed differently with the new `line_figures_mismatch` warning, which `parseCommandResult` and `knownWarnings` accept. `moneyDivergence(order)` gives a sale's differing order figures and line ids, and the orders list counts the differing lines.
- 82ec063: `ServerCapabilities.pluginContract` carries `/tally/v1/info`'s top-level `pluginContract`. The Medusa connector's `listOrders` sends register filters and 1-6 digit searches (display numbers) through the MedusaPOS plugin's `GET /tally/v1/orders` at plugin contract 3, reading the rows from the admin API so every order maps the same way; `medusaOrderFilters(capabilities)` gives the filter fields a store honours (#1114).
- e48cac6: `minorToMajor` is exported from the `@tallyui/core` root and `minorUnitDigits` from `@tallyui/core/server`, so each money converter has one name everywhere. `currencyDecimals`, `moneyToMajor` and `@tallyui/pos`'s `minorToDecimal` are deprecated in their favour; nothing is removed.
- ccb28e1: `normalizeMoneyText(text, format?)` reads a typed amount in the store's separators, and `useMoneyFormat()` returns the nearest MoneyFormatProvider's format (#672).
- 1821a2c: order.create version 11: version 10 plus the customer's `billing` / `shipping` on a sale with no `taxAddress`, as informational fields. `SUPPORTED_ORDER_CREATE_VERSIONS` and the version types gain 11; `precheckCommand` accepts untaxed addresses at 11 and still refuses them at 9 and 10.
- 74191f9: `@tallyui/core`: order.create version 12 is 11 plus `customer.taxIds`, a catalogue line's `sku` and order `meta`, as informational fields, with their shape and bound checks in `precheckCommand` and the `ORDER_TAX_IDS_MAX`, `ORDER_TAX_ID_TYPE_MAX`, `ORDER_TAX_ID_VALUE_MAX`, `ORDER_META_MAX`, `ORDER_META_KEY_MAX` and `ORDER_LINE_SKU_MAX` constants (ADR-092).

  `@tallyui/pos`: the till sends a sale's tax ids, meta and edited catalogue SKU at order.create 12 (`INFORMATIONAL_EXTRAS_ORDER_CREATE_VERSION`, now `ORDER_CREATE_MAX_VERSION`) only when the store's cap allows it, and `pos_orders` goes to schema 18 (identity migration, one-way like 17) to store them and `attentionHandledFor`. `markAttentionHandled(orders, orderId)` marks a refused or warned order handled, and `needsAttention` leaves it out until a requeue gives it a new command id.

- 0eb7640: order.create version 9 (#790): `OrderCreateCoupon.lines` (`OrderCreateCouponLine`) carries each coupon's share of each line. `SUPPORTED_ORDER_CREATE_VERSIONS` adds 9, `precheckCommand`, `payloadShapeErrors` and `payloadBoundErrors` check it (docs/contract/order-create-v9.md), and version 9 needs no `taxAddress`.
- f5a739f: `order.reopen` version 1 (ADR-090), an online command that reopens a store order for editing. `@tallyui/core` adds the envelope, payload and result types, `reopenPayloadErrors` (the strict shape check), the `order.reopen` type in `validateBatch`, an optional `orderReopen` list in `precheckCommand`, the `reopen` result in `parseCommandResult`, the refusal codes (`payment_in_motion`, `order_state`, `revision_conflict`, `forbidden`), `SUPPORTED_ORDER_REOPEN_VERSIONS` and the `orderReopen` capability from `/tally/v1/info`. Nothing sends it yet.
- 3b25108: `order.update` v1 (ADR-090): the contract for sending a reopened sale's whole new state. Types, a payload shape check (`updatePayloadErrors`), store ids on kept lines, fees and shipping (`storeLineId`) and on payments (`paymentId`), precheck, the `orderUpdate` capability and `SUPPORTED_ORDER_UPDATE_VERSIONS`. Nothing sends it yet.
- 7a6075b: `@tallyui/core` adds the `ProductTerm` type and an optional `getTerms` product trait, so a connector can report a product's terms (facet values, tags, brands) each in its group; without it a product has no terms.
  `@tallyui/pos` adds `productTerms`, `listTermGroups` (each group and term once, sorted by name like `listCategories`) and `hasTerm`.
- 2cb63cb: ServerCapabilities.receiptEmail: parseInfoCapabilities reads `/tally/v1/info`'s `receiptEmail: { v: n }` (a safe integer above 0); a malformed value is left out with one warning.
- 6e191c9: New exports the platform apps copied before: `deriveSessionFigures` and `deriveVariance` on `@tallyui/core`'s browser-safe main entry; `tenderLabel` and a new `syncStatusQuiet` predicate (true when `SyncStatus` would show only "Sales are up to date.") on `@tallyui/components`.
- 2bdae98: Adds an optional, online `closures` connector surface (ADR-093): read the store's Z closures, append a recount and record a reprint. `Correction` and `ApproverCredentials` move to core (pos and the Woo connector re-export them); `Correction` gains `late_refund`, which `deriveSettled` counts on the refund side. The Woo connector implements it for WCPOS 2.0.
- f51a692: A store order read now carries what a reopen needs to write the order back: the order's `revision`, an `id` on each fee, shipping line and payment record, and the recorded `taxStatus` on a fee or shipping line, a fee's `taxClass` and a shipping line's `methodId`. All new fields are optional. The WooCommerce connector fills them from the order resource and the WCPOS payment ledger.

  An order list page now leaves out an order the connector cannot read and counts it in `unreadable`, instead of failing the whole page. An order whose payment record the connector cannot read carries `paymentRecordUnreadable`.

- 28ba50e: StoreTaxRate gains optional `rules` for a backend's override-rate conditions.
- cc6f6cf: `StoreSettings` gains `preventOverselling` and `StockLevel` gains `backorders` (`no` | `notify` | `yes`). The WooCommerce connector reads the store's `prevent_overselling` and each product's and variation's `backorders`, which WCPOS v2's stock guard needs. The product schema goes to version 3, so a till resyncs its products once.
- 23a6813: `StoreSettings.moneyFormat` carries the store's own money format (core's `MoneyFormat`). The WooCommerce connector fills it from WCPOS's store row (currency position, thousand and decimal separators, decimals) and WooCommerce's currency symbol, so CAD reads `$`; pass it to `CurrencyProvider`'s `format`.

### Patch Changes

- e928f11: A display's check code is unique among its till's live pending pairings, and the in-memory reference server now rerolls only against that till.
- ac46fa5: The `DisplaySignalling` docs now say the till's `deviceId` is a bearer secret on some backends (ADR-085, #753): an implementation never logs it, puts it in an error, a response or a display's view, or returns it to another device. The pairing and display service options say the same.
- 61846d3: The tender pane offers every manual-capture payment method the host passes, records each as its wire method plus its own `methodId`, and labels ledger, takings and report rows with the method's title; takings and report rows key by kind and id (`legMethodId`), so two methods never merge. `takingsByMethod` returns an object with no prototype; read it with `Object.hasOwn`, not `hasOwnProperty`.
- c9201a2: Internal tidy: `precheckCommand` builds its rejections through one helper, core uses `OrderCreatePayload` internally (the deprecated `OrderCreatePayloadV3` alias stays exported), and the order.create version docs now list version 6. Behaviour unchanged.
- a171cf5: `precheckCommand` refuses an order.create 9 payload that carries a customer address without `taxAddress` (#790).

  The order outbox treats an `unsupported_version` downgrade that would not go strictly lower, or would stay above the store's cap, as a terminal rejection instead of resending (#790).

## 3.20.1

## 3.20.0

### Minor Changes

- 749894f: `StoreOrderPage` gains an optional `total`, every order the query matches, and the WooCommerce connector fills it from `X-WP-Total`, for v2's "Showing N of M" (#769).
- 5f3475b: `StoreSettings` gains `taxClasses`, each tax class's slug and display name, and the WooCommerce connector fills it from `taxes/classes`, so a renamed class shows its WooCommerce name (#770).

## 3.19.0

### Minor Changes

- a3387fc: Customers carry an optional `createdAt`, and the optional connector method `searchCustomersPage` returns a page of a customer search with the store's total (`CustomerPage`); the WooCommerce connector fills both, from `date_created_gmt` and the `X-WP-Total` header (#680).
- 1af7329: The second-device customer display's signalling seam (ADR-085 U2, #684, #705). `TallyConnector.displaySignalling` is an optional `DisplaySignalling`: a till side (mint a code, list pending claims with their check codes, confirm or decline, list and forget displays, a signal mailbox, the snapshot post) under a cashier session holding `customer_display.pair` (`DISPLAY_PAIR_CAPABILITY`), and a display side (claim, collect the token once, its own mailbox, the snapshot read) gated by the display's token. Every refusal is a `DisplaySignallingError`. `ServerCapabilities.customerDisplay` carries `/tally/v1/info`'s display advertisement, read by `parseDisplayAdvertisement` with `DEFAULT_ICE_SERVERS`. `rateLimitSource` keys failed claims per source (IPv6 by /64). `@tallyui/core/server` adds `createMemoryDisplaySignalling`, an in-memory reference server, and `displaySignallingContract`, the shared suite each plugin's connector runs against its own routes through a `DisplaySignallingHarness`.
- 434c143: order.create version 8 taxes a sale on the customer's address (#722, step 2). Version 8 is version 7 plus `payload.taxAddress` (`'billing'` or `'shipping'`, the address the till matched the rates against) and the customer's `billing` and `shipping` addresses. A till sends 8 only when a sale was taxed on one of the customer's addresses, and never downgrades such a sale: capped below 8, `toOrderCreateEnvelope` throws `UnsupportedOrderVersionError(8, cap)` and the outbox sends it at 8, never at a version whose server would tax it on the base. A sale taxed on the base sends the same bytes as before. The server precheck refuses `taxAddress` or customer addresses below 8, and 8 without `taxAddress`.

  `@tallyui/pos`: `saleTaxContexts(settings, { orderCreateVersion })` re-matches rates by the customer's address only from order.create 8 (`TAX_ADDRESS_ORDER_CREATE_VERSION`); without the option, or below 8, every customer gets the store's context. `finalizeOrder` takes `taxLocation` and stores the tax address with the customer's addresses. `useSale` refuses a customer whose rates differ from the sale's once tender has begun (`CUSTOMER_RETAX_REFUSED`), telling the cashier to cancel the payment and change the customer in the cart, or start a new order. This is an interim: #759 re-taxes the sale on a customer change, as WCPOS v2 does. `pos_orders` moves to schema 12; its migration is the identity, and a schema-11 till opening a schema-12 store finds no orders.

  `@tallyui/connector-woocommerce`: `wooStoreSettings` fills `taxRateTable` whenever the store has a base address and advertises order.create 8 where it advertised 7. `toWooOrderPayload` sends a version-8 sale's tax address as WCPOS's `_woocommerce_pos_tax_based_on` meta, with the customer's billing and shipping addresses.

- a15835f: `ListOrdersQuery` takes v2's order-history filters (#721): `status`, `customerId`, `cashierId`, `registerId`, `paymentMethod`, `storeId`, `createdVia` and `dateRange` (`after` and `before` as ISO 8601 UTC instants ending in `Z`). A connector lists the fields its `listOrders` honours in the new optional `TallyConnector.orderFilters` and maps each its own way; any other set field is refused with `UnsupportedOrderFilterError` (`code: 'unsupported_order_filter'`, `fields`), which `assertOrderFiltersSupported` gives. Also exports `OrderFilterField`, `ORDER_FILTER_FIELDS`, `orderFilterFields` and `assertOrderDateRange`.
- f819768: `receiptTemplates()` lists the store's renderable print templates; WooCommerce reads them from the WCPOS templates route and labels them with the `wcpos` data model.
- 2e691f2: `OrderBuilder.setCoupons` takes a store-priced coupon context (`StorePricedCouponContext`): the store's per-line amounts come off the lines in any rounding mode, `Order.coupons` and `display.coupons` carry each code's share of the settlement totals, and `couponPricesStale` flags an order changed since the store priced it, which `finalizeOrder` refuses; `couponPricingBasis` gives what the prices depend on. `parseInfoCapabilities` reads `coupons: true` from `/tally/v1/info` (#709).
- 3a6eb07: `SyncContext` takes an optional `fetch`, resolved per request and defaulting to `globalThis.fetch`, so a host can pass a wrapper such as `meteredFetch` to count requests.
  The WooCommerce connector sends every pull, reconcile, settings, payment-methods, receipt-templates and customers request through `context.fetch` when it is set.
- 41aa864: WooCommerce's tax location, the pure pieces (#722). `woocommerceTax.orderTaxLocation(base, taxBasedOn, order?)` resolves the address an order is taxed by, as `WC_Abstract_Order::get_tax_location()` does: `shipping` falls back to billing and then to the shop base, `billing` to the shop base, and the order's `_woocommerce_pos_tax_based_on` (`TAX_BASED_ON_META_KEY`) overrides the store's basis when valid; `normalizeTaxBasedOn` turns anything else into `base`. `StoreSettings` gains three optional fields a connector fills: `taxBasedOn`, `baseTaxAddress` and `taxRateTable` (the unfiltered WooCommerce rate table). `taxSettingsForLocation(settings, location)` in `@tallyui/pos` re-derives `taxRates` and `taxRatesPpm` for an address from `taxRateTable` (a class's ppm includes compound rates; a class with no matching rate is 0), and returns the settings unchanged when there is no table. Nothing uses them yet.

## 3.18.0

### Minor Changes

- 455c39f: `StoreSettings` gains an optional `allTaxRates`: every tax rate the store defines, with where it applies, for an app's "View all tax rates" table (`StoreTaxRate`, `StoreTaxRateLocation`). The WooCommerce connector fills it from the `/taxes` rates it already reads; the filtered `taxRates` and `taxRatesPpm` the cart uses are unchanged (#669).

## 3.17.0

## 3.16.0

## 3.15.0

### Minor Changes

- c2319ab: Fixes the connectivity label and the update-required latch from 3.14.0.

  - **`noResponse`** (`@tallyui/core`, new): a connector tags its fetch rejections with `fetch(url, init).catch(noResponse)`, so that the neutral rule reads them as offline. A bare `TypeError` no longer counts as offline, since our own code throws those too; a platform network code such as `ECONNREFUSED`, on the error or its `cause`, still does.
  - **Any answer from the store ends offline:** an error with a numeric `status`, such as a 401 or a 404, shows the store is reachable.
  - **The latch holds a push without dropping it.** While it is set, the pull returns empty pages and a push waits, with one error per latch and no retries, and neither calls the store. A push already in flight finishes and is not sent again. `resetUpdateRequired()` re-probes: the pull asks the store again and held writes go in order.
  - **A pause no longer loses or doubles a push** that is held, in flight or waiting to retry. The push waits, before and after the send, until the replication starts again. `startReplication` now retries a failed push itself, still with one error per failed attempt, so a pause during that wait loses no rows. This includes the pause after a sign-in error on the pull. Only a cancel ends the wait.

  Known limit: if a paused replication is cancelled after its rows were sent, the next replication sends them again, because RxDB never recorded them.

## 3.14.0

### Minor Changes

- c2319ab: Adds a connectivity label and an update-required latch.

  - **`classifyFailure()`:** a connector may map its own request failures to `offline`, `degraded` or an update-required refusal with this optional method. A connector without it gets a neutral rule: no response is offline, and a timeout or a 5xx is degraded.
  - **`createConnectivityTracker`** (`@tallyui/database`) turns request outcomes into a label for the UI. After 30 seconds of failures it reads `offline` or `degraded`, and it goes back to `online` on the first success. The label only reports: being offline or degraded does not stop replication.
  - **The update-required latch** is the only thing that holds sync. While it is set, `startReplication` neither pulls nor pushes, so unsent writes wait in the queue. It stays set until `resetUpdateRequired()` is called.

## 3.13.0

### Minor Changes

- 73387ab: Adds cashier permissions: a connector may describe the signed-in cashier with an optional `cashier()` that returns neutral permissions (`viewReports`, `manageClosures`, `approveVariance`, `refund`, `discount`). In `@tallyui/pos`, `can()` and the `useCashier` hook read them and give the blind-count flag and a Reports gate; a connector without `cashier()` still allows everything, as before.
- 0bf0072: Add an optional, online-only `updateCustomer(context, id, patch)` connector method with a `CustomerPatch` type, and let `Customer` and `CustomerInput` carry billing and shipping addresses (`CustomerAddress`) and tax ids (`CustomerTaxId`).
- 135eda4: `CustomerServiceError` now has an optional `status`: the HTTP status the store answered with, or undefined when no response came. The WooCommerce, Medusa and Vendure connectors set it, so a retry can check the status instead of parsing the message.
- 7e12633: Core now describes a payment method in a backend-neutral way (`PaymentMethodDescriptor`), and a connector may list its methods with an optional `paymentMethods()`. A connector without it still offers cash and the card terminal, through `defaultPaymentMethods()` and `paymentMethodOf()`.
- c31eef8: Add the core types for register contract 3 (ADR-082): `ServerCapabilities.registerApproval` (the store's approval threshold, read from `/tally/v1/info`), an optional opaque `approval` on the closure payload, and the `register_approval_required` and `register_approval_invalid` conflict codes with their data types.
- 9f04b1b: Connectors can now offer the store's register directory through an optional `listRegisters`, which returns each register's id, name, default float and expected close time. `@tallyui/pos` adds `suggestFloat`, which suggests a register's opening float: its default float, else the cash counted at the last close.
- 80c7a6b: A cashier can now add a note to a sale with `useSale().setNote()`; it is kept when the sale is parked and resumed, and cleared by a new sale. The note is sent to the store as `order.create` version 7, only to servers that advertise version 7 (ADR-083).

### Patch Changes

- dfda46e: `SUPPORTED_ORDER_CREATE_VERSIONS` now lists versions 5 and 6, which the till already sends. A new test keeps it in step with the order.create envelope's version type.

## 3.12.0

### Minor Changes

- b1397a3: `OrderCreateLine` takes `anyAttributes`, the names of the attributes the cashier picked for a variant's "Any" option groups. It is a version-6 field, checked by the precheck and the shape check (#495).
- e32dda1: Order history and reprint (G7, ADR-081). `TallyConnector` gains optional `listOrders` and `getOrders`, which read the store's orders online as `StoreOrder`s, with the store's line ids and prior refunds; a connector without them is unchanged. The WooCommerce connector implements both over WCPOS `wcpos/v2/orders`. `@tallyui/pos` adds `buildReceiptDataFromPosOrder` and `buildReceiptDataFromStoreOrder`, which build a receipt marked as a reprint (`fiscal.is_reprint`, `reprint_count`) from a stored order, and `Receipt` takes a prebuilt `receipt` and a `doneLabel`.

## 3.11.0

### Patch Changes

- 916055f: Remove an unused type import. No behaviour change.
- 1cebe19: Drop dead re-exports from internal modules. The package entry points export the same names as before.

## 3.10.0

> **Storage, one way: `pos_orders` moves from schema version 8 to 9.** Every stored order is kept byte for byte, but a till that goes back to a build on version 8 shows no orders and sends none of its pending ones until it is upgraded again. Nothing is deleted.

### Minor Changes

- 38d3032: A coupon sale is sent as `order.create` version 6 (#501, ADR-077 step d4a). No app passes a coupon source yet, so nothing changes for a cashier.
  - Version 6 is version 5 plus the order's `coupons` (`code`, `couponId`, `discountMinor`, `discountTaxMinor`), each line's `regularUnitPriceMinor` and `attributes` when stored, and the receipt's `display.coupons`. `precheckCommand` accepts it, refuses those fields below version 6, and checks that each receipt coupon row names a coupon in the payload, once.
  - In version 6, `subtotalMinor` and `taxMinor` are net of the coupons, and the top-level `discountMinor` still sums only the lines' discounts.
  - `CommandRejectionCode` gains `coupon_invalid` (with `OrderCreateCouponInvalidData`: `storeCode`, `couponCode`) and `total_mismatch` (with `OrderCreateTotalMismatchData`).
  - Only a coupon sale goes as 6. A sale without coupons is sent as before, byte for byte, whatever the store advertises.
  - A coupon sale never goes below 6: `useSale` offers coupons only when the store also accepts version 6, `finalizeOrder` refuses a coupon sale to a store below 6, and the outbox keeps a coupon sale at 6 after an `unsupported_version` answer, so an older store refuses it instead of receiving it without its coupons.
  - The till's highest `order.create` version (`ORDER_CREATE_MAX_VERSION` in `@tallyui/pos`'s command module, not exported from the package) is 6, and a test pins it to `pos_orders`' `sentVersion` and `downgradedFrom` maxima.

### Patch Changes

- f50fca2: `CatalogueReconcileAdapter.enqueue` entries may carry `refreshOnly`.

## 3.9.2

### Patch Changes

- fc37285: `@tallyui/pos` no longer imports from `@tallyui/core/server`, whose barrel reaches `node:crypto`. Browser bundlers such as Expo Snack could not build `@tallyui/pos`, and so `@tallyui/components`, because of it. `parseCommandResult` and `CommandResultError` are now exported from `@tallyui/core` as well as from `@tallyui/core/server`, and pos imports them from there. CI now checks that no browser-facing package's dist reaches `@tallyui/core/server` or a Node built-in.

## 3.9.1

## 3.9.0

### Minor Changes

- 39a4583: `@tallyui/core` exports the WooCommerce coupon engine as `woocommerceCoupons` (#501, ADR-077 phase b), next to `woocommerceTax`. It has `recalculateCoupons`, `validateCoupon`, `toCouponConfigs` and `enrichCategoriesWithAncestors`, with their input, result and rejection types. Nothing in TallyUI calls it yet; the sale builder will in phase (d).
- 3e2245a: `order.refund` version 1 (ADR-080), an online refund command on the command channel. `@tallyui/core` adds the envelope and payload types, `refundPayloadErrors` (the strict shape check), the `order.refund` type in `validateBatch`, an optional `orderRefund` list in `precheckCommand`, the `refund` result in `parseCommandResult`, the refusal codes (`nothing_to_refund`, `quantity_exceeds`, `amount_mismatch`, `order_state`, `not_till_order`, `forbidden`, `no_open_session`), the `orderRefund` capability from `/tally/v1/info`, and refunds in `deriveSessionFigures`: a session's expected figures fall by the refunds it made, and it returns `refundsTotalMinor` when refunds are passed (callers that pass none get the same result as before). `@tallyui/pos` adds `sendOrderRefund(transport, envelope)`, which sends one refund and never queues it. `@tallyui/connector-vendure`'s `getVendureOrder` also reads each line's placed quantity and prorated prices and each refund's amounts and metadata, and `vendureRefundable(order)` computes what is left to refund.
- a3dc028: The order builder can apply WooCommerce coupons (#501, ADR-077 step d1). `createOrderBuilder` takes an optional `couponContext` (the coupon configs, product categories and the store's sequential-discount setting), and `setCoupons(codes)` replays the codes through the ported engine on a WooCommerce tax context. The order then carries `coupons` (`{ code, discountMinor, discountTaxMinor }`), its lines and totals are the post-coupon figures, and `display.coupons` shows one row per coupon while the display lines keep their pre-coupon amounts. Codes are trimmed, lower-cased and deduplicated. An unknown code, or one that excludes sale items, throws a `RangeError`. Other tax contexts ignore the codes. Drafts do not save coupons yet (step d2), and `useSale` does not expose them yet (step d3). `@tallyui/core` also exports `woocommerceCoupons.calculateOrderTotals` and `StoreSettings.calcDiscountsSequentially`, which the WooCommerce connector now reads from the store's settings.
- 006cfb2: `ServerCapabilities` gains an optional `coupons` (#501, ADR-077 ruling R3). Absent means the store does not accept an order's coupons. The WooCommerce connector's `readWooCapabilities` now also reads `GET wcpos/v2/site`. `coupons` is true only when its `wcpos_version` is woocommerce-pos 1.9.0 or later; every unclear or failed read gives false. `orderCreate` is decided as before. Nothing reads `coupons` yet.
- 19093c2: The WooCommerce connector now has a `coupons` collection (#500, ADR-077 amendment 2). Its only source is a catalogue reconcile over the store's published coupons. Each coupon's fingerprint is `date_modified_gmt|usage_count|used_by`, because using a coupon does not move its modified time. A coupon whose fingerprint differs is refetched by id. A draft arrives deleted. A coupon that is trashed or no longer published is removed only after the store confirms it by id. `TallyConnector.reconcile` gains an optional `coupons` key. A connector without it has no coupons. Nothing reads the collection yet, and no app starts the coupons reconcile yet.

### Patch Changes

- c1bf800: Every exports entry gains a `default` condition so CommonJS and `require`-condition resolvers (Node `require`, webpack, Snack's bundler) resolve the packages; `smoke:pack` checks `require.resolve` for every entry.

## 3.8.0

### Minor Changes

- 6158b2a: Variation attributes through the product traits (#494). Core adds `VariantSummary.options` (the variant's value in each option group, keyed by group name; a group the variant accepts any value of has no key), the `VariantOptionGroup` type and the optional `ProductTraits.getVariantOptions` (the option groups in the backend's display order). The WooCommerce connector implements both: groups are the parent's attributes with `variation: true`, by `position`, with an `id` only for global attributes; replication now keeps each variation attribute's numeric `id`. Additive: no schema change, and variations stored before this release gain the id when they are next pulled.

## 3.7.1

## 3.7.0

## 3.6.0

### Minor Changes

- 2894a59: App and plugin authors can use the register v2 contract (ADR-078): optional open fields `deviceName` and `supersedes`, optional result fields `session.openedAt`, `session.openingFloatMinor`, `resumed` and `superseded`, the `superseded` session status, conflict codes `register_session_superseded` and `register_supersede_forbidden`, error-data types `RegisterSessionAlreadyOpenData` and `RegisterSessionSupersededData`, and the `register_session_unknown` order warning. Payload shape checks and warning readers support these fields; the till does not send v2 yet.

## 3.5.3

## 3.5.2

## 3.5.1

## 3.5.0

### Minor Changes

- a5b432e: Products report flat categories with string ids through the new optional `getCategories` trait (WooCommerce and Medusa categories, Vendure collections, Shopify product type). `@tallyui/pos` adds `productCategories`, `listCategories` and `inCategory`, which fall back to `getCategoryNames` for connectors without the trait.

## 3.4.0

## 3.3.0

### Minor Changes

- 820b8c2: `order.create` version 5 (ADR-075): fees, shipping and custom lines in the command types, with `precheckCommand` and the payload, bounds and fiscal-figure checks; v5 fields are refused below version 5.
- 585af9b: `woocommerceTax`: WooCommerce tax primitives ported from WCPOS's order-math (MIT): `calculateTaxes` (compound, priority order, PHP rounding), `filterTaxRates` (address matching), and the rounding and tax-class helpers, for the WooCommerce connector (ADR-076).
- 71be352: A `woocommerce` tax strategy (ADR-076): several rates per class with priority and compound tax, and WooCommerce's per-rate per-line rounding (or at subtotal), through `StoreSettings.taxRates` and `TaxContext.getTaxRates`; other strategies are unchanged.

### Patch Changes

- fcace3b: `ServerCapabilities.lineTax` and `parseLineTax`: a store's `/tally/v1/info` says whether it accepts tax-free and tax-classed fees, shipping and custom lines (order.create 5).
- 9f7cffe: A WooCommerce order can carry several payments when the store's plugin records the list
  (`order_payments_list`): the primary tender names the payment method and `_woocommerce_pos_payments` keeps all of
  them. `ServerCapabilities.multiplePayments` tells the app whether to offer split tender. The connector also reports `lineTax: { none: true, classes: true }` itself, since WCPOS has no `/tally/v1/info`.
- c7aa412: Woo products carry `tax_class` and `tax_status` (schema version 2: a till resyncs its products once) through the `getTaxClass`/`getTaxStatus` traits. Core adds the optional `getTaxStatus` trait, which the cart and `addProduct` pass to the line.
- 611ce1c: The connector now reads the store's tax settings and capabilities (the WooCommerce tax strategy, ADR-076); `parseTaxRounding` accepts the `woocommerce` granularity.

## 3.2.1

## 3.2.0

## 3.1.1

### Patch Changes

- 63a7431: `TallyConnector` gains an optional `emailReceipt(context, orderId, email, { saveToBilling? })` for connectors that can email a store order's receipt (online only, not idempotent).

## 3.1.0

## 3.0.4

## 3.0.3

## 3.0.2

## 3.0.1

## 3.0.0

### Major Changes

- 668f71f: Breaking: `precheckCommand` now takes the server's own supported versions as a required second argument, `{ orderCreate, register }`, and checks against them; its `unsupported_version` message and `data` name the server's list, not core's (#297). Plugins MUST pass their supported versions: `precheckCommand(envelope, { orderCreate: [1, 2, 3], register: [1] })`; an empty list throws a `TypeError`. This is part of 3.0.0's breaking changes and adds no extra major. `SUPPORTED_ORDER_CREATE_VERSIONS` and `SUPPORTED_REGISTER_VERSIONS` stay exported as the till's capability (what `toOrderCreateEnvelope` can produce), not what a server supports.

### Minor Changes

- 4de75c2: A batch over 50 commands is answered `413` with `{ code: 'batch_too_large', maxCommands: 50, message: 'At most 50 commands are allowed' }`, never `400` (ADR-038, Front desk ruling 18): `@tallyui/core/server`'s `validateBatch` returns that `body` on its `413` failure so plugins send it as is. `@tallyui/core/server` now also exports `MAX_COMMANDS_PER_BATCH`, and `@tallyui/core` and `@tallyui/core/server` export the `BatchTooLargeBody` type.
- 894b6ae: **One catalogue reconcile runner** replaces the id and fingerprint reconcile runners (#248, part A). `startIdReconcile` and `startFingerprintReconcile` remain as thin wrappers with their options and results.

  - **`startCatalogueReconcile` (new)** compares the backend's product listing with the till in one pass and hands what differs to the collection's pull. It:
    - stays within a request budget (30 a minute by default) instead of a page cap, so large catalogues never truncate;
    - keeps its daily gate and a resume cursor in RxDB local documents, so it does not run on every start, and it resumes after an interruption;
    - deletes only in an uninterrupted pass, and only what the connector confirms gone. The mass-delete brake is checked on the candidates _before_ the connector is asked, and the connector is asked in chunks (`confirmChunk`, default 100), each within the budget;
    - stops or skips by `errorKind`;
    - logs what it did through an optional `log` callback.
  - **Behaviour changes for the existing runners:**
    - there is no pass 5 s after every start: the daily gate is checked at the start delay and then hourly;
    - `maxPages` is ignored;
    - requests are paced by the budget;
    - differences are refetched page by page;
    - apps that run more than one runner on the same collection pass a distinct `stateId`.
  - **`createReconcileFeed`:**
    - it takes an optional `key` to match fetched documents by the local primary key, so it works where `doc.id` is not the primary key; `fetchByIds` then receives the queued entries;
    - a `tombstone` entry is deleted without a fetch;
    - a fetched document keeps a `_deleted` the connector set.
  - **`@tallyui/core`** adds `CatalogueReconcileAdapter` and `TallyConnector.reconcile.catalogue`.
  - **Connector collections** enable RxDB local documents.

- 04905ef: `Catalogue` now applies the provider's reconciled stock overlay itself (tiles, search and the variant chooser agree), and `useStockOverlaid` and `useStockOverlayAsOf` are new.
- faa7cda: Expose ConnectorUnauthorizedError for expired or rejected stored credentials in Vendure and Medusa requests.
- 9f34416: `@tallyui/core/server` adds the batch envelope check, the per-command version pre-check, the supported versions, `totalWarnings` and `parseCommandResult` (throwing `CommandResultError`), byte-identical to the medusapos plugin's.
- fb57e1d: `@tallyui/core/server` adds the register payload check (`registerPayloadErrors`), the expected-cash derivation (`deriveSessionFigures`, `deriveVariance`) and the register conflict codes (`RegisterConflictCode`, `RegisterOutcome`), byte-identical to the medusapos plugin's.
- 898e98b: Add `@tallyui/core/server`, the plugins' shared contract: money, fingerprint, the `order.create` payload shape and fiscal figures, byte-identical to the medusapos plugin's.
- 75c5dce: `@tallyui/core/server`'s envelope types now admit register commands and any validated version, and it exports `BatchOutcome` with `inProgressOutcome` and `transientOutcome`. It also exports `CommandRejectionCode` and `platformErrorResult` (a new `platform_error` code).
- ba63f04: `CommandWarning` gains `{ code: 'customer_ignored'; customerId: string }` (#266): a sale whose `customerId` doesn't resolve is kept as a guest sale. `knownWarnings` keeps it and `parseCommandResult` accepts it when `customerId` is 1 to 64 characters; the orders list renders it.
- 0d04d13: Add neutral Customer, CustomerInput and CustomerServiceError exports and optional online-only customer search, create and get connector methods.

  Implement customer search, create and get for Medusa's admin-user connector.

- 78d324e: Add useSale.setCustomer and ReceiptData.header.customer, customerTraits, CustomerPicker, generic CustomerSelect/CustomerCard with traits overrides, CustomerForm.showAddress, and the receipt's customer line.

  CustomerSelect rows are now pressable, so choosing a result works on the web (it previously did nothing).

- 7fee0c1: A WooCommerce product whose uuid changed in the store is replaced on the till in one pass (#331). The till delivers it under its new uuid and removes the old copy. Before this fix, it removed the old copy and dropped the new one, so the product was missing until the next daily check, and it was removed without the usual by-id check.

  - **The reconcile feed:** when an entry that has a local copy is fetched back under a different primary key but the same remote id, the feed delivers that document as well as removing the old copy.
  - **`combinePullAdapters`** takes an optional `key` for resolving duplicates across its sub-adapters. It defaults to `doc.id`, as before. WooCommerce passes the uuid (its primary key): two documents that share a store id, such as a product's new copy and its old copy's removal, must both reach the collection.

- 24b74fd: `CommandWarning` gains `{ code: 'figures_mismatch'; fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor' | (string & {}); tillMinor: number; serverMinor: number }> }` (#257): one warning per sale listing each of the till's figures that differs from the server's own computation. `parseCommandResult` accepts it when `fields` is non-empty, each `field` is one of the three names with none repeated, and each entry's two values are different safe integers. `knownWarnings` applies the same rules but keeps a field name it doesn't know (any non-empty string), since a newer store may send one; the orders list renders it, an unknown field by its raw name.
- eb5a032: A `/tally/v1/info` answer that says nothing about the store no longer means the default tax rounding (a follow-up to #339).

  - **Unknown:** a 2xx that is not JSON, and a `taxRounding` value that is present but malformed, now read as "unknown" (`undefined`), like a network failure or a 5xx. The till's store settings wait and retry instead of selling on a guessed rounding.
  - **Unchanged:** a 404 still means an older plugin (`orderCreate: 1`, the default rounding), and so does a well-formed body with no `taxRounding` key.
  - **Type change:** `parseInfoCapabilities` now returns `ServerCapabilities | undefined`. It is `undefined` when the body carries a malformed `taxRounding`.

- 54ee98a: `@tallyui/core/server` adds the `internal_error` rejection code and `internalErrorResult`.
- 27d736e: `CommandWarning` gains `bridgeMinor` on `total_mismatch` and a new `tax_rate_mismatch` code, and the till now ignores warning codes it doesn't know (`knownWarnings`), instead of showing them as a store total.
- e59ebec: Each line is taxed at its product's tax class, not the store's default (#288). `ProductTraits` gains an optional `getTaxClass(doc, variantId?)`, the backend's tax class id, a key of `StoreSettings.taxRatesPpm`. `addProduct` and `addEntryToCart` pass it to `addLine` through the new `AddLineInput.taxClass`, which the tax context resolves; a connector without the accessor is unchanged (the default rate). `TaxProvider` taxes a class with no rate at the default rate and warns once per class through the new `taxLogger`. connector-vendure replicates each variant's `taxCategory { id }` and implements the accessor, and its store settings give every tax category with no enabled rate in the default zone an explicit 0 rate, as Vendure charges; its product schema goes to version 2, so the products collection is dropped and downloaded again on the first sync after the upgrade.
- 2ecaa36: A replication adapter can set `pull.batchSize`, and the Medusa connector pulls 500 products per page.
- 901fa66: Add `order.create` envelope version 3, its display and tax-rate wire types, and the payload's `sessionId` and customer reference.

  At capability 3, `finalizeOrder` copies the receipt's `display` and `taxByRate` into the sale. Version 3 sends those figures and the sale's session (stamped or late) as `sessionId`. Older orders keep their existing envelope version.

  Move `pos_orders` to schema version 3 with a `sessionId` index and the optional `sentVersion` and `downgradedFrom` fields (declared for the outbox's version fallback, not yet written). Apps must open `pos_orders` with `addPosOrderCollection`, which migrates it.

- bf2d805: `order.create` version 4 (#286): every `discountMinor`, the order's and each line's, is tax-exclusive, so their sum still holds. Core accepts version 4 with version 3's fields. The till's envelope builder (`toOrderCreateEnvelope`) produces version 4 when capped at 4 or more and the order's `sentVersion` doesn't hold it lower. The till doesn't send version 4 yet: the outbox doesn't pass the server's max, so it still sends version 3 or lower with the same figures, byte-identical.
- ca0beac: Fall back to the server's supported order.create version while preserving stored fiscal figures and command IDs. Record the sent version and downgrade in the order audit, and expose command error details.
- af623c9: The order.create string lengths move from `payloadShapeErrors` to the new `payloadBoundErrors`, which `precheckCommand` calls after the replay lookup, so an applied order resent with a long title replays as `duplicate`; `payloadShapeErrors` keeps the types, the `customerId` and `sessionId` bounds and the NUL check. `useSale` applies a tender before logging a dropped reference, and `add()` refuses a product whose id or v3 tax code finalize would refuse; the tender's reference field caps at 255 characters. `finalizeOrder` now freezes the sent form (names and discount labels cut, an unsendable customer email or id left out) and `toOrderCreateEnvelope` sends the stored order unchanged, so every resend is byte-identical.
- ef2f64e: The shared order.create shape check bounds string lengths and refuses NUL, and so does the v3 fiscal-figures check for its display and tax-code strings. The till cuts long names when it stores the order, refuses over-long pass-through references at finalize (and a payment reference as it's entered), refuses a searched or parked customer whose email or id the server would refuse, and validates the customer email at entry. Tills should ship this clamp before plugins adopt the new bounds, so no till sends a sale the server would now refuse.
- 457162d: **One reconcile feed per store session** (#307, a release gate). The WooCommerce and Medusa reconcile feeds were module-level singletons, so after a store switch in one runtime, store A's queued tombstones and refetches could reach store B's database.

  - **New factories.** `createWooCommerceConnector()`, `createMedusaConnector()` and `createMedusaAdminUserConnector()` each build their own feed; `createVendureConnector(options)` already did. **Build a connector per store session**, anew on each sign-in or store change.
  - **Deprecated exports.** `woocommerceConnector`, `medusaConnector`, `medusaAdminUserConnector` and `vendureConnector` are deprecated: one instance for the whole app can leak queued reconcile work across stores. **They are removed in 4.0.**
  - **A development warning.** `startReplication` warns once when the same adapter object replicates into two collections at once.
  - **Refetch budget by requests.** `refetchBatchSize` on the reconcile adapters makes a page that enqueues `n` refetches take `ceil(n / refetchBatchSize)` request-budget slots (WooCommerce 100, Medusa 100, Vendure 1,000).
  - **WooCommerce 426 errors.** A foreign (non-WCPOS) 426 keeps the store's `code` beside its message, and the message is capped at 200 characters.

- 222543b: Add `RegisterCommandType`, `RegisterCommandEnvelope` and `AnyCommandEnvelope`, register payloads and results, and the register server capability. `CommandType` and `CommandEnvelope` are unchanged.

  Record the local `register_commands` ledger through `reconcileRegisterCommands`, gated in `useRegisterSession` by its new `commands` and `capabilities` options. Commands are recorded but not sent. Medusa reads the `register` contract.

- 8141c1c: Guard register commands, movement reasons and register ids, exporting RegisterMovementReasonError and RegisterIdInvalidError. Harden register outbox result handling and batch limits.

  Make CommandBatchRequest generic while preserving its existing default envelope type.

- ce4f796: Replication pull errors are handled according to who can fix them, instead of every error being retried every 5 s forever. A till repeating a rejected token is the traffic a store's security plugin blocks.

  - `@tallyui/core`:
    - An error class declares `fixedBy: 'till' | 'store'` with a string `code`; `errorKind(error)` returns `'till'`, `'store'` or `'transient'`.
    - `SyncNotice` (`{ code, since, fixedBy, software?, minVersion?, fix? }`) describes a stopped pull.
    - `ConnectorUnauthorizedError` is fixed by the till.
  - `@tallyui/database` `startReplication` handles the three kinds and returns RxDB's state plus `notice$` and `resume()`:
    - **till:** one request, one notice, then the pull stays stopped until the app calls `resume()`, after sign-in. The pull stays stopped even when RxDB restarts the loop on page visibility.
    - **store:** one notice, then one attempt every 5 minutes (or the error's `retryAfterMs`, up to 1 hour). The notice clears itself on the first success, so a till recovers within 5 minutes of the owner's fix.
    - **transient:** a doubling delay from `retryTime` to 5 minutes. It waits at least a valid `retryAfterMs` (a finite number of zero or more), capped at 1 hour.
  - `@tallyui/components`: `SyncStatus` takes an optional `pullNotice` and tells the cashier in plain words that they can keep selling and who needs to act. It never shows a code, a backend name or a version the notice doesn't carry.
  - `@tallyui/connector-woocommerce`:
    - `WooDateFilterError` is fixed by the store, and carries `software` and `minVersion`.
    - `WooMissingUuidError` gains `code: 'missing_plugin'` and is fixed by the store.
  - `@tallyui/connector-vendure`: a new `VendureTimezoneConfigError` (`store_misconfigured`, with a plain `fix`) replaces the plain error when the `updatedAt` probe shows a server that isn't in UTC.

- 5ed6281: The till computes tax with the store's rounding strategy (#287, ADR-071). `ServerCapabilities` gains `taxRounding` (core exports `TaxRounding`): `per_order`, `per_line_items` or `per_rate_group_items`, each with `half_away_from_zero` or `half_up`, or `custom`. Absent, and `custom`, mean today's `per_order` with half away from zero. `TaxProvider` takes `rounding` and `rateCodes` (tax class → the backend's rate name, for `per_rate_group_items`); the order records the strategy as `taxRounding`, and `taxLinesByRate` takes it as a fourth argument. The algorithms are in `docs/contract/field-kinds.md`.
- 5a204a9: `StoreSettings` gains a derived `taxRounding`. `useStoreSettings` fills it from the context's capabilities, or else from one read of the connector's `capabilities()` made before the settings are ready, so each sign-in emits the settings once with the rounding known and no later change holds a sale; a failed read or a connector without `capabilities` gives the default rounding. `taxProviderProps` passes it to `TaxProvider` as `rounding`, so the till rounds tax like the store with no app code (#324). `custom` passes no rounding, and an explicit `rounding` prop still wins.
- 7d1bc98: Add `parseTaxRounding` and `parseInfoCapabilities`, which read `/tally/v1/info` including its top-level `taxRounding` (#287). The Medusa connector's capability read now carries the store's `taxRounding`.
- 8cf3ea4: A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

  - **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
    - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
    - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
    - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
  - **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
  - **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.

- e15f389: The Vendure connector supplies its tax rate names, so a `per_rate_group_items` store groups a sale's tax the way Vendure does (#324). Apps no longer fetch the names themselves.

  - **`StoreSettings.taxRateCodes`** (core, optional): the backend's tax rate name per tax class, keyed like `taxRatesPpm`, including `default`.
  - **`vendureStoreSettings`** reads each rate's `name` in the tax-rate query it already runs, so no extra request is made. Only the rates `taxRatesPpm` uses count, and `default` follows the same default-category rule. `taxRateCodes` is left out when no names come back.
  - **`taxProviderProps(settings)`** passes `taxRateCodes` to `<TaxProvider>` as `rateCodes`.

- ddd9e85: The WooCommerce catalogue reconcile uses the WCPOS products fast path (#313). When `wcpos/v2/status` lists `products_id_fast_path` in `capabilities`, the whole catalogue is listed in one request (`per_page=-1`, `_fields=id,date_modified_gmt,stock_quantity,stock_status`) instead of pages of 100. A store that refuses it, or answers with something that is not a list, is listed page by page in the same pass.

  - **Keyed on the remote id:** both WooCommerce listings key on the numeric product id, never the till-local uuid.
  - **`CatalogueReconcileAdapter.matchKey`** (core, optional): an adapter whose listing carries no primary key declares how to match a local document. The catalogue runner indexes the local documents by it for each pass. Deletion is unchanged: `confirmGone`, then the mass-delete brake, by primary key.
  - **`remote` on the keyed reconcile feed** (core, optional): a listed product the till does not hold yet is matched back by its remote id, so it is delivered rather than dropped.

### Patch Changes

- 5c90aed: `parseCommandResult` now accepts a `total_mismatch`'s `bridgeMinor` and the `tax_rate_mismatch` warning code, so a plugin replaying a stored v3 result no longer fails. `knownWarnings` is lenient about a bad optional `bridgeMinor` (dropping just that field, not the whole warning) and about a non-array `warnings` value. `OrdersList`'s rounding line now reads "Store calculated …; a rounding line of … brought it to …". `Catalogue` keeps its input array's identity when the stock overlay changes nothing, and takes the latest of `lastStockCheckAt`, the provider's `stockOverlayAsOf` and `lastSyncedAt` for its "stock as of" time.
- 6673faf: RxDB 17.5.0.

  - **`@tallyui/storage-sqlite`:**
    - Its `rxdb-premium` peer is now `17.5.0`. Apps install `rxdb-premium@17.5.0` together with `rxdb@17.5.0`.
    - Its storages set RxDB 17's premium flag at import and when called, so the 13-collection cap never applies.
  - **`@tallyui/pos`:**
    - Its `rxdb` peer is now `~17.5.0`.
    - Opening `pos_orders` rejects with `PosOrderOpenClosedError` when the database closes during a migration: RxDB 17.5.0 cancels the migration on close. The open first waits for any write already in flight, so none reaches a closed store.
    - An open that needs no migration resolves only once RxDB allows writes, so a sale saved straight after it is never refused with COL25.
  - **`@tallyui/database`:**
    - `createTallyDatabase` returns an RxDB 17 database.
    - In development it adds RxDB's dev-mode plugin when a database is created, not at import.
  - **Stored data:** a till's SQLite data written by RxDB 16.21.1 opens unchanged under 17.5.0, and migrates its schema versions.

  **Upgrade notes**

  - **Storage is one-way.** Once a till has opened this version, `pos_orders` is at schema version 4, and an older build
    (such as `@tallyui/pos` 2.0.0 on RxDB 16.21.1) opens it without an error but shows no orders, so it sends none of the
    pending ones until the till is upgraded again. Nothing is deleted: the next upgrade recovers every order, including a
    sale rung during the rollback. Never roll an app back across this version, and never re-ring sales it hides: a
    re-rung sale is a second sale, and the upgrade sends both. See ADR-069 in `docs/DECISIONS.md`.
  - Web apps ship the 17.5.0 storage worker with the 17.5.0 main thread. A cached 16.x worker with a 17.5.0 main
    thread is untested and unsupported.
  - Apps pin `rxdb` and `rxdb-premium` to exactly `17.5.0`.
  - RxDB 17 defaults a replication's `toggleOnDocumentVisible` to true (16.21.1: false). It then resyncs when the tab
    becomes visible, and no longer simulates activity to keep a hidden tab awake, so a browser may throttle a hidden
    tab's pull. RxDB pauses a hidden tab's replication only when that tab isn't the leader; a single-instance database
    is always the leader (read in 17.5.0's `plugins/replication` source, not tested).

- c48e1dd: Store settings follow-ups to #339 and #341 (#340):

  - **A signed-out till is asked to sign in**, not shown "Retrying…". When the capabilities read fails with an error only the till can fix, `useStoreSettings` gives `error` without `nextRetryAt` and doesn't retry by itself, so the app prompts. That covers a till-class error (a 401, or a till that needs updating) and a `SignInError` with `code: 'invalid_credentials'`; any other sign-in error still waits and retries. Every other failure still waits and retries.
  - **A `/tally/v1/info` JSON body that isn't an object** (`null`, an array or a scalar) is unknown, not the default rounding.

- 1f4d0ab: `isStorageWorkerStartError` and `isStorageWorkerFailure` also recognise RxDB's RM1, a stale storage worker built on another RxDB version (for example a cached old worker after an upgrade), so apps show their reload advice for it. Both call the new `isRxdbRemoteVersionMismatch` in `@tallyui/core`, which recognises RM1 by structure only: an RxError's own `code`, or the remote storage's `could not create instance ` wrapping of an RxError's JSON. `@tallyui/storage-sqlite` now has `@tallyui/core` as a peer dependency.
- 3cf5452: Follow-ups to the 401/403 split (#345):

  - **Vendure:** a signed-in user missing a permission (confirmed by the session probe) is now `ConnectorUnauthorizedError` with `status: 403`, the `forbidden` notice, instead of a plain transient error.
  - **WooCommerce:** a 403 from the JWT-auth plugin (`jwt_auth_*`) reaches the till only with a valid token on WCPOS 1.10.0–1.10.7 (wcpos/woocommerce-pos#1863). It is now `WooPluginUpdateRequiredError` (`unsupported_store`, WCPOS 1.10.8): the store owner updates WCPOS, and the till is never sent into a sign-in loop.
  - **`ConnectorUnauthorizedError`:** only a 403 is `forbidden`. A caller that omits `status` gets `unauthorized`, as before 3.0.
  - **Docs:** the customer picker's `onError`, the replication guide's error classes, and the connector comments now say that only a 401 means sign in again.

## 3.0.0-next.2

### Patch Changes

- [#351](https://github.com/TallyUI/tallyui/pull/351) [`c48e1dd`](https://github.com/TallyUI/tallyui/commit/c48e1dd808622191fb97104ecd58cc8cde7dde0d) Thanks [@kilbot](https://github.com/kilbot)! - Store settings follow-ups to #339 and #341 (#340):

  - **A signed-out till is asked to sign in**, not shown "Retrying…". When the capabilities read fails with an error only the till can fix, `useStoreSettings` gives `error` without `nextRetryAt` and doesn't retry by itself, so the app prompts. That covers a till-class error (a 401, or a till that needs updating) and a `SignInError` with `code: 'invalid_credentials'`; any other sign-in error still waits and retries. Every other failure still waits and retries.
  - **A `/tally/v1/info` JSON body that isn't an object** (`null`, an array or a scalar) is unknown, not the default rounding.

- [#349](https://github.com/TallyUI/tallyui/pull/349) [`3cf5452`](https://github.com/TallyUI/tallyui/commit/3cf5452ba0f6a2f25e88c230201d0e0e68e2e5b5) Thanks [@kilbot](https://github.com/kilbot)! - Follow-ups to the 401/403 split (#345):

  - **Vendure:** a signed-in user missing a permission (confirmed by the session probe) is now `ConnectorUnauthorizedError` with `status: 403`, the `forbidden` notice, instead of a plain transient error.
  - **WooCommerce:** a 403 from the JWT-auth plugin (`jwt_auth_*`) reaches the till only with a valid token on WCPOS 1.10.0–1.10.7 (wcpos/woocommerce-pos#1863). It is now `WooPluginUpdateRequiredError` (`unsupported_store`, WCPOS 1.10.8): the store owner updates WCPOS, and the till is never sent into a sign-in loop.
  - **`ConnectorUnauthorizedError`:** only a 403 is `forbidden`. A caller that omits `status` gets `unauthorized`, as before 3.0.
  - **Docs:** the customer picker's `onError`, the replication guide's error classes, and the connector comments now say that only a 401 means sign in again.

## 3.0.0-next.1

### Minor Changes

- [#333](https://github.com/TallyUI/tallyui/pull/333) [`7fee0c1`](https://github.com/TallyUI/tallyui/commit/7fee0c19d57eb45130549101e5dd32cf593fdeea) Thanks [@kilbot](https://github.com/kilbot)! - A WooCommerce product whose uuid changed in the store is replaced on the till in one pass (#331). The till delivers it under its new uuid and removes the old copy. Before this fix, it removed the old copy and dropped the new one, so the product was missing until the next daily check, and it was removed without the usual by-id check.

  - **The reconcile feed:** when an entry that has a local copy is fetched back under a different primary key but the same remote id, the feed delivers that document as well as removing the old copy.
  - **`combinePullAdapters`** takes an optional `key` for resolving duplicates across its sub-adapters. It defaults to `doc.id`, as before. WooCommerce passes the uuid (its primary key): two documents that share a store id, such as a product's new copy and its old copy's removal, must both reach the collection.

- [#341](https://github.com/TallyUI/tallyui/pull/341) [`eb5a032`](https://github.com/TallyUI/tallyui/commit/eb5a0322fe11b55e9158fb3374be14a12ac6b78b) Thanks [@kilbot](https://github.com/kilbot)! - A `/tally/v1/info` answer that says nothing about the store no longer means the default tax rounding (a follow-up to #339).

  - **Unknown:** a 2xx that is not JSON, and a `taxRounding` value that is present but malformed, now read as "unknown" (`undefined`), like a network failure or a 5xx. The till's store settings wait and retry instead of selling on a guessed rounding.
  - **Unchanged:** a 404 still means an older plugin (`orderCreate: 1`, the default rounding), and so does a well-formed body with no `taxRounding` key.
  - **Type change:** `parseInfoCapabilities` now returns `ServerCapabilities | undefined`. It is `undefined` when the body carries a malformed `taxRounding`.

- [#342](https://github.com/TallyUI/tallyui/pull/342) [`8cf3ea4`](https://github.com/TallyUI/tallyui/commit/8cf3ea4a442a67ff0b229a6498503fd8b65a2ae5) Thanks [@kilbot](https://github.com/kilbot)! - A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

  - **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
    - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
    - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
    - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
  - **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
  - **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.

- [#334](https://github.com/TallyUI/tallyui/pull/334) [`e15f389`](https://github.com/TallyUI/tallyui/commit/e15f389e077a535b06a65e00c3989e7a652d7990) Thanks [@kilbot](https://github.com/kilbot)! - The Vendure connector supplies its tax rate names, so a `per_rate_group_items` store groups a sale's tax the way Vendure does (#324). Apps no longer fetch the names themselves.

  - **`StoreSettings.taxRateCodes`** (core, optional): the backend's tax rate name per tax class, keyed like `taxRatesPpm`, including `default`.
  - **`vendureStoreSettings`** reads each rate's `name` in the tax-rate query it already runs, so no extra request is made. Only the rates `taxRatesPpm` uses count, and `default` follows the same default-category rule. `taxRateCodes` is left out when no names come back.
  - **`taxProviderProps(settings)`** passes `taxRateCodes` to `<TaxProvider>` as `rateCodes`.

- [#330](https://github.com/TallyUI/tallyui/pull/330) [`ddd9e85`](https://github.com/TallyUI/tallyui/commit/ddd9e85008f43e780cc0ee3754463eb7aa819a2a) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce catalogue reconcile uses the WCPOS products fast path (#313). When `wcpos/v2/status` lists `products_id_fast_path` in `capabilities`, the whole catalogue is listed in one request (`per_page=-1`, `_fields=id,date_modified_gmt,stock_quantity,stock_status`) instead of pages of 100. A store that refuses it, or answers with something that is not a list, is listed page by page in the same pass.

  - **Keyed on the remote id:** both WooCommerce listings key on the numeric product id, never the till-local uuid.
  - **`CatalogueReconcileAdapter.matchKey`** (core, optional): an adapter whose listing carries no primary key declares how to match a local document. The catalogue runner indexes the local documents by it for each pass. Deletion is unchanged: `confirmGone`, then the mass-delete brake, by primary key.
  - **`remote` on the keyed reconcile feed** (core, optional): a listed product the till does not hold yet is matched back by its remote id, so it is delivered rather than dropped.

## 3.0.0-next.0

### Major Changes

- [#298](https://github.com/TallyUI/tallyui/pull/298) [`668f71f`](https://github.com/TallyUI/tallyui/commit/668f71f6cf06af4a41fe686e98546f25e2e191ee) Thanks [@kilbot](https://github.com/kilbot)! - Breaking: `precheckCommand` now takes the server's own supported versions as a required second argument, `{ orderCreate, register }`, and checks against them; its `unsupported_version` message and `data` name the server's list, not core's (#297). Plugins MUST pass their supported versions: `precheckCommand(envelope, { orderCreate: [1, 2, 3], register: [1] })`; an empty list throws a `TypeError`. This is part of 3.0.0's breaking changes and adds no extra major. `SUPPORTED_ORDER_CREATE_VERSIONS` and `SUPPORTED_REGISTER_VERSIONS` stay exported as the till's capability (what `toOrderCreateEnvelope` can produce), not what a server supports.

### Minor Changes

- [#249](https://github.com/TallyUI/tallyui/pull/249) [`4de75c2`](https://github.com/TallyUI/tallyui/commit/4de75c2e844d53fdbccd40c4ad4d4004a0641f57) Thanks [@kilbot](https://github.com/kilbot)! - A batch over 50 commands is answered `413` with `{ code: 'batch_too_large', maxCommands: 50, message: 'At most 50 commands are allowed' }`, never `400` (ADR-038, Front desk ruling 18): `@tallyui/core/server`'s `validateBatch` returns that `body` on its `413` failure so plugins send it as is. `@tallyui/core/server` now also exports `MAX_COMMANDS_PER_BATCH`, and `@tallyui/core` and `@tallyui/core/server` export the `BatchTooLargeBody` type.

- [#284](https://github.com/TallyUI/tallyui/pull/284) [`894b6ae`](https://github.com/TallyUI/tallyui/commit/894b6aec27fcc157e65e68fee1f8134ef201712f) Thanks [@kilbot](https://github.com/kilbot)! - **One catalogue reconcile runner** replaces the id and fingerprint reconcile runners (#248, part A). `startIdReconcile` and `startFingerprintReconcile` remain as thin wrappers with their options and results.

  - **`startCatalogueReconcile` (new)** compares the backend's product listing with the till in one pass and hands what differs to the collection's pull. It:
    - stays within a request budget (30 a minute by default) instead of a page cap, so large catalogues never truncate;
    - keeps its daily gate and a resume cursor in RxDB local documents, so it does not run on every start, and it resumes after an interruption;
    - deletes only in an uninterrupted pass, and only what the connector confirms gone. The mass-delete brake is checked on the candidates _before_ the connector is asked, and the connector is asked in chunks (`confirmChunk`, default 100), each within the budget;
    - stops or skips by `errorKind`;
    - logs what it did through an optional `log` callback.
  - **Behaviour changes for the existing runners:**
    - there is no pass 5 s after every start: the daily gate is checked at the start delay and then hourly;
    - `maxPages` is ignored;
    - requests are paced by the budget;
    - differences are refetched page by page;
    - apps that run more than one runner on the same collection pass a distinct `stateId`.
  - **`createReconcileFeed`:**
    - it takes an optional `key` to match fetched documents by the local primary key, so it works where `doc.id` is not the primary key; `fetchByIds` then receives the queued entries;
    - a `tombstone` entry is deleted without a fetch;
    - a fetched document keeps a `_deleted` the connector set.
  - **`@tallyui/core`** adds `CatalogueReconcileAdapter` and `TallyConnector.reconcile.catalogue`.
  - **Connector collections** enable RxDB local documents.

- [#210](https://github.com/TallyUI/tallyui/pull/210) [`04905ef`](https://github.com/TallyUI/tallyui/commit/04905efd0c23a77159ce0682ed34df4567896bf0) Thanks [@kilbot](https://github.com/kilbot)! - `Catalogue` now applies the provider's reconciled stock overlay itself (tiles, search and the variant chooser agree), and `useStockOverlaid` and `useStockOverlayAsOf` are new.

- [#196](https://github.com/TallyUI/tallyui/pull/196) [`faa7cda`](https://github.com/TallyUI/tallyui/commit/faa7cda925c6ca52e47357bd09d920813051c62b) Thanks [@kilbot](https://github.com/kilbot)! - Expose ConnectorUnauthorizedError for expired or rejected stored credentials in Vendure and Medusa requests.

- [#206](https://github.com/TallyUI/tallyui/pull/206) [`9f34416`](https://github.com/TallyUI/tallyui/commit/9f34416619db35733ef85d98b225be5c046d12d5) Thanks [@kilbot](https://github.com/kilbot)! - `@tallyui/core/server` adds the batch envelope check, the per-command version pre-check, the supported versions, `totalWarnings` and `parseCommandResult` (throwing `CommandResultError`), byte-identical to the medusapos plugin's.

- [#208](https://github.com/TallyUI/tallyui/pull/208) [`fb57e1d`](https://github.com/TallyUI/tallyui/commit/fb57e1d8d97c3e03603a3bcc49470ce73bdb3b6d) Thanks [@kilbot](https://github.com/kilbot)! - `@tallyui/core/server` adds the register payload check (`registerPayloadErrors`), the expected-cash derivation (`deriveSessionFigures`, `deriveVariance`) and the register conflict codes (`RegisterConflictCode`, `RegisterOutcome`), byte-identical to the medusapos plugin's.

- [#206](https://github.com/TallyUI/tallyui/pull/206) [`898e98b`](https://github.com/TallyUI/tallyui/commit/898e98ba31387bbece8b79c5c0cc50d27f8cd3af) Thanks [@kilbot](https://github.com/kilbot)! - Add `@tallyui/core/server`, the plugins' shared contract: money, fingerprint, the `order.create` payload shape and fiscal figures, byte-identical to the medusapos plugin's.

- [#211](https://github.com/TallyUI/tallyui/pull/211) [`75c5dce`](https://github.com/TallyUI/tallyui/commit/75c5dced41a1c99da03614304fc87adad4bc684c) Thanks [@kilbot](https://github.com/kilbot)! - `@tallyui/core/server`'s envelope types now admit register commands and any validated version, and it exports `BatchOutcome` with `inProgressOutcome` and `transientOutcome`. It also exports `CommandRejectionCode` and `platformErrorResult` (a new `platform_error` code).

- [#273](https://github.com/TallyUI/tallyui/pull/273) [`ba63f04`](https://github.com/TallyUI/tallyui/commit/ba63f04ef725774ec762a34a619534abb3bf2339) Thanks [@kilbot](https://github.com/kilbot)! - `CommandWarning` gains `{ code: 'customer_ignored'; customerId: string }` (#266): a sale whose `customerId` doesn't resolve is kept as a guest sale. `knownWarnings` keeps it and `parseCommandResult` accepts it when `customerId` is 1 to 64 characters; the orders list renders it.

- [#204](https://github.com/TallyUI/tallyui/pull/204) [`0d04d13`](https://github.com/TallyUI/tallyui/commit/0d04d13eff8a3bf7aed7cf747464e145a74dea35) Thanks [@kilbot](https://github.com/kilbot)! - Add neutral Customer, CustomerInput and CustomerServiceError exports and optional online-only customer search, create and get connector methods.

  Implement customer search, create and get for Medusa's admin-user connector.

- [#205](https://github.com/TallyUI/tallyui/pull/205) [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4) Thanks [@kilbot](https://github.com/kilbot)! - Add useSale.setCustomer and ReceiptData.header.customer, customerTraits, CustomerPicker, generic CustomerSelect/CustomerCard with traits overrides, CustomerForm.showAddress, and the receipt's customer line.

  CustomerSelect rows are now pressable, so choosing a result works on the web (it previously did nothing).

- [#281](https://github.com/TallyUI/tallyui/pull/281) [`24b74fd`](https://github.com/TallyUI/tallyui/commit/24b74fdfe39198c124cac707c31106affd7cc93b) Thanks [@kilbot](https://github.com/kilbot)! - `CommandWarning` gains `{ code: 'figures_mismatch'; fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor' | (string & {}); tillMinor: number; serverMinor: number }> }` (#257): one warning per sale listing each of the till's figures that differs from the server's own computation. `parseCommandResult` accepts it when `fields` is non-empty, each `field` is one of the three names with none repeated, and each entry's two values are different safe integers. `knownWarnings` applies the same rules but keeps a field name it doesn't know (any non-empty string), since a newer store may send one; the orders list renders it, an unknown field by its raw name.

- [#216](https://github.com/TallyUI/tallyui/pull/216) [`54ee98a`](https://github.com/TallyUI/tallyui/commit/54ee98a583d5543538fb0641aa322a87e5f8cfaf) Thanks [@kilbot](https://github.com/kilbot)! - `@tallyui/core/server` adds the `internal_error` rejection code and `internalErrorResult`.

- [#207](https://github.com/TallyUI/tallyui/pull/207) [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1) Thanks [@kilbot](https://github.com/kilbot)! - `CommandWarning` gains `bridgeMinor` on `total_mismatch` and a new `tax_rate_mismatch` code, and the till now ignores warning codes it doesn't know (`knownWarnings`), instead of showing them as a store total.

- [#292](https://github.com/TallyUI/tallyui/pull/292) [`e59ebec`](https://github.com/TallyUI/tallyui/commit/e59ebecfc580bc5bca706c8e37fc825281a88cef) Thanks [@kilbot](https://github.com/kilbot)! - Each line is taxed at its product's tax class, not the store's default (#288). `ProductTraits` gains an optional `getTaxClass(doc, variantId?)`, the backend's tax class id, a key of `StoreSettings.taxRatesPpm`. `addProduct` and `addEntryToCart` pass it to `addLine` through the new `AddLineInput.taxClass`, which the tax context resolves; a connector without the accessor is unchanged (the default rate). `TaxProvider` taxes a class with no rate at the default rate and warns once per class through the new `taxLogger`. connector-vendure replicates each variant's `taxCategory { id }` and implements the accessor, and its store settings give every tax category with no enabled rate in the default zone an explicit 0 rate, as Vendure charges; its product schema goes to version 2, so the products collection is dropped and downloaded again on the first sync after the upgrade.

- [#192](https://github.com/TallyUI/tallyui/pull/192) [`2ecaa36`](https://github.com/TallyUI/tallyui/commit/2ecaa3661eae0ad8ec5d0ce3a344dc24262f387b) Thanks [@kilbot](https://github.com/kilbot)! - A replication adapter can set `pull.batchSize`, and the Medusa connector pulls 500 products per page.

- [#179](https://github.com/TallyUI/tallyui/pull/179) [`901fa66`](https://github.com/TallyUI/tallyui/commit/901fa666f4ab345bf07b2d6b38c6e5dc58596f39) Thanks [@kilbot](https://github.com/kilbot)! - Add `order.create` envelope version 3, its display and tax-rate wire types, and the payload's `sessionId` and customer reference.

  At capability 3, `finalizeOrder` copies the receipt's `display` and `taxByRate` into the sale. Version 3 sends those figures and the sale's session (stamped or late) as `sessionId`. Older orders keep their existing envelope version.

  Move `pos_orders` to schema version 3 with a `sessionId` index and the optional `sentVersion` and `downgradedFrom` fields (declared for the outbox's version fallback, not yet written). Apps must open `pos_orders` with `addPosOrderCollection`, which migrates it.

- [#291](https://github.com/TallyUI/tallyui/pull/291) [`bf2d805`](https://github.com/TallyUI/tallyui/commit/bf2d805334c83d4f20f408e185add336331de38e) Thanks [@kilbot](https://github.com/kilbot)! - `order.create` version 4 (#286): every `discountMinor`, the order's and each line's, is tax-exclusive, so their sum still holds. Core accepts version 4 with version 3's fields. The till's envelope builder (`toOrderCreateEnvelope`) produces version 4 when capped at 4 or more and the order's `sentVersion` doesn't hold it lower. The till doesn't send version 4 yet: the outbox doesn't pass the server's max, so it still sends version 3 or lower with the same figures, byte-identical.

- [#182](https://github.com/TallyUI/tallyui/pull/182) [`ca0beac`](https://github.com/TallyUI/tallyui/commit/ca0beacdafb14f3b5cae7c7593de23ed82b0d2d5) Thanks [@kilbot](https://github.com/kilbot)! - Fall back to the server's supported order.create version while preserving stored fiscal figures and command IDs. Record the sent version and downgrade in the order audit, and expose command error details.

- [#224](https://github.com/TallyUI/tallyui/pull/224) [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f) Thanks [@kilbot](https://github.com/kilbot)! - The order.create string lengths move from `payloadShapeErrors` to the new `payloadBoundErrors`, which `precheckCommand` calls after the replay lookup, so an applied order resent with a long title replays as `duplicate`; `payloadShapeErrors` keeps the types, the `customerId` and `sessionId` bounds and the NUL check. `useSale` applies a tender before logging a dropped reference, and `add()` refuses a product whose id or v3 tax code finalize would refuse; the tender's reference field caps at 255 characters. `finalizeOrder` now freezes the sent form (names and discount labels cut, an unsendable customer email or id left out) and `toOrderCreateEnvelope` sends the stored order unchanged, so every resend is byte-identical.

- [#222](https://github.com/TallyUI/tallyui/pull/222) [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8) Thanks [@kilbot](https://github.com/kilbot)! - The shared order.create shape check bounds string lengths and refuses NUL, and so does the v3 fiscal-figures check for its display and tax-code strings. The till cuts long names when it stores the order, refuses over-long pass-through references at finalize (and a payment reference as it's entered), refuses a searched or parked customer whose email or id the server would refuse, and validates the customer email at entry. Tills should ship this clamp before plugins adopt the new bounds, so no till sends a sale the server would now refuse.

- [#315](https://github.com/TallyUI/tallyui/pull/315) [`457162d`](https://github.com/TallyUI/tallyui/commit/457162d04dcd3c6f588cdb6ab90efea36081f4df) Thanks [@kilbot](https://github.com/kilbot)! - **One reconcile feed per store session** (#307, a release gate). The WooCommerce and Medusa reconcile feeds were module-level singletons, so after a store switch in one runtime, store A's queued tombstones and refetches could reach store B's database.

  - **New factories.** `createWooCommerceConnector()`, `createMedusaConnector()` and `createMedusaAdminUserConnector()` each build their own feed; `createVendureConnector(options)` already did. **Build a connector per store session**, anew on each sign-in or store change.
  - **Deprecated exports.** `woocommerceConnector`, `medusaConnector`, `medusaAdminUserConnector` and `vendureConnector` are deprecated: one instance for the whole app can leak queued reconcile work across stores. **They are removed in 4.0.**
  - **A development warning.** `startReplication` warns once when the same adapter object replicates into two collections at once.
  - **Refetch budget by requests.** `refetchBatchSize` on the reconcile adapters makes a page that enqueues `n` refetches take `ceil(n / refetchBatchSize)` request-budget slots (WooCommerce 100, Medusa 100, Vendure 1,000).
  - **WooCommerce 426 errors.** A foreign (non-WCPOS) 426 keeps the store's `code` beside its message, and the message is capped at 200 characters.

- [#188](https://github.com/TallyUI/tallyui/pull/188) [`222543b`](https://github.com/TallyUI/tallyui/commit/222543b8c9130d2c79a294603195940143bd611c) Thanks [@kilbot](https://github.com/kilbot)! - Add `RegisterCommandType`, `RegisterCommandEnvelope` and `AnyCommandEnvelope`, register payloads and results, and the register server capability. `CommandType` and `CommandEnvelope` are unchanged.

  Record the local `register_commands` ledger through `reconcileRegisterCommands`, gated in `useRegisterSession` by its new `commands` and `capabilities` options. Commands are recorded but not sent. Medusa reads the `register` contract.

- [#202](https://github.com/TallyUI/tallyui/pull/202) [`8141c1c`](https://github.com/TallyUI/tallyui/commit/8141c1cb1591a8b8299ffc00fe4f9a77a7cd8289) Thanks [@kilbot](https://github.com/kilbot)! - Guard register commands, movement reasons and register ids, exporting RegisterMovementReasonError and RegisterIdInvalidError. Harden register outbox result handling and batch limits.

  Make CommandBatchRequest generic while preserving its existing default envelope type.

- [#259](https://github.com/TallyUI/tallyui/pull/259) [`ce4f796`](https://github.com/TallyUI/tallyui/commit/ce4f796aff7c739cb555b61f9a167cc803d8b5c2) Thanks [@kilbot](https://github.com/kilbot)! - Replication pull errors are handled according to who can fix them, instead of every error being retried every 5 s forever. A till repeating a rejected token is the traffic a store's security plugin blocks.

  - `@tallyui/core`:
    - An error class declares `fixedBy: 'till' | 'store'` with a string `code`; `errorKind(error)` returns `'till'`, `'store'` or `'transient'`.
    - `SyncNotice` (`{ code, since, fixedBy, software?, minVersion?, fix? }`) describes a stopped pull.
    - `ConnectorUnauthorizedError` is fixed by the till.
  - `@tallyui/database` `startReplication` handles the three kinds and returns RxDB's state plus `notice$` and `resume()`:
    - **till:** one request, one notice, then the pull stays stopped until the app calls `resume()`, after sign-in. The pull stays stopped even when RxDB restarts the loop on page visibility.
    - **store:** one notice, then one attempt every 5 minutes (or the error's `retryAfterMs`, up to 1 hour). The notice clears itself on the first success, so a till recovers within 5 minutes of the owner's fix.
    - **transient:** a doubling delay from `retryTime` to 5 minutes. It waits at least a valid `retryAfterMs` (a finite number of zero or more), capped at 1 hour.
  - `@tallyui/components`: `SyncStatus` takes an optional `pullNotice` and tells the cashier in plain words that they can keep selling and who needs to act. It never shows a code, a backend name or a version the notice doesn't carry.
  - `@tallyui/connector-woocommerce`:
    - `WooDateFilterError` is fixed by the store, and carries `software` and `minVersion`.
    - `WooMissingUuidError` gains `code: 'missing_plugin'` and is fixed by the store.
  - `@tallyui/connector-vendure`: a new `VendureTimezoneConfigError` (`store_misconfigured`, with a plain `fix`) replaces the plain error when the `updatedAt` probe shows a server that isn't in UTC.

- [#309](https://github.com/TallyUI/tallyui/pull/309) [`5ed6281`](https://github.com/TallyUI/tallyui/commit/5ed62816fe28a3ef3b001600b9d6a08de22d4a7e) Thanks [@kilbot](https://github.com/kilbot)! - The till computes tax with the store's rounding strategy (#287, ADR-071). `ServerCapabilities` gains `taxRounding` (core exports `TaxRounding`): `per_order`, `per_line_items` or `per_rate_group_items`, each with `half_away_from_zero` or `half_up`, or `custom`. Absent, and `custom`, mean today's `per_order` with half away from zero. `TaxProvider` takes `rounding` and `rateCodes` (tax class → the backend's rate name, for `per_rate_group_items`); the order records the strategy as `taxRounding`, and `taxLinesByRate` takes it as a fourth argument. The algorithms are in `docs/contract/field-kinds.md`.

- [#326](https://github.com/TallyUI/tallyui/pull/326) [`5a204a9`](https://github.com/TallyUI/tallyui/commit/5a204a949e33f53d6087845d59e4bab1fe4a1474) Thanks [@kilbot](https://github.com/kilbot)! - `StoreSettings` gains a derived `taxRounding`. `useStoreSettings` fills it from the context's capabilities, or else from one read of the connector's `capabilities()` made before the settings are ready, so each sign-in emits the settings once with the rounding known and no later change holds a sale; a failed read or a connector without `capabilities` gives the default rounding. `taxProviderProps` passes it to `TaxProvider` as `rounding`, so the till rounds tax like the store with no app code (#324). `custom` passes no rounding, and an explicit `rounding` prop still wins.

- [#322](https://github.com/TallyUI/tallyui/pull/322) [`7d1bc98`](https://github.com/TallyUI/tallyui/commit/7d1bc98b842258d67f6d5d380bc925e16e649ca2) Thanks [@kilbot](https://github.com/kilbot)! - Add `parseTaxRounding` and `parseInfoCapabilities`, which read `/tally/v1/info` including its top-level `taxRounding` (#287). The Medusa connector's capability read now carries the store's `taxRounding`.

### Patch Changes

- [#213](https://github.com/TallyUI/tallyui/pull/213) [`5c90aed`](https://github.com/TallyUI/tallyui/commit/5c90aed083d8245e12a645aafa9c9e6a3e7bbc61) Thanks [@kilbot](https://github.com/kilbot)! - `parseCommandResult` now accepts a `total_mismatch`'s `bridgeMinor` and the `tax_rate_mismatch` warning code, so a plugin replaying a stored v3 result no longer fails. `knownWarnings` is lenient about a bad optional `bridgeMinor` (dropping just that field, not the whole warning) and about a non-array `warnings` value. `OrdersList`'s rounding line now reads "Store calculated …; a rounding line of … brought it to …". `Catalogue` keeps its input array's identity when the stock overlay changes nothing, and takes the latest of `lastStockCheckAt`, the provider's `stockOverlayAsOf` and `lastSyncedAt` for its "stock as of" time.

- [#223](https://github.com/TallyUI/tallyui/pull/223) [`6673faf`](https://github.com/TallyUI/tallyui/commit/6673fafcc682e825c94cfc66932da07cabd24e35) Thanks [@kilbot](https://github.com/kilbot)! - RxDB 17.5.0.

  - **`@tallyui/storage-sqlite`:**
    - Its `rxdb-premium` peer is now `17.5.0`. Apps install `rxdb-premium@17.5.0` together with `rxdb@17.5.0`.
    - Its storages set RxDB 17's premium flag at import and when called, so the 13-collection cap never applies.
  - **`@tallyui/pos`:**
    - Its `rxdb` peer is now `~17.5.0`.
    - Opening `pos_orders` rejects with `PosOrderOpenClosedError` when the database closes during a migration: RxDB 17.5.0 cancels the migration on close. The open first waits for any write already in flight, so none reaches a closed store.
    - An open that needs no migration resolves only once RxDB allows writes, so a sale saved straight after it is never refused with COL25.
  - **`@tallyui/database`:**
    - `createTallyDatabase` returns an RxDB 17 database.
    - In development it adds RxDB's dev-mode plugin when a database is created, not at import.
  - **Stored data:** a till's SQLite data written by RxDB 16.21.1 opens unchanged under 17.5.0, and migrates its schema versions.

  **Upgrade notes**

  - **Storage is one-way.** Once a till has opened this version, `pos_orders` is at schema version 4, and an older build
    (such as `@tallyui/pos` 2.0.0 on RxDB 16.21.1) opens it without an error but shows no orders, so it sends none of the
    pending ones until the till is upgraded again. Nothing is deleted: the next upgrade recovers every order, including a
    sale rung during the rollback. Never roll an app back across this version, and never re-ring sales it hides: a
    re-rung sale is a second sale, and the upgrade sends both. See ADR-069 in `docs/DECISIONS.md`.
  - Web apps ship the 17.5.0 storage worker with the 17.5.0 main thread. A cached 16.x worker with a 17.5.0 main
    thread is untested and unsupported.
  - Apps pin `rxdb` and `rxdb-premium` to exactly `17.5.0`.
  - RxDB 17 defaults a replication's `toggleOnDocumentVisible` to true (16.21.1: false). It then resyncs when the tab
    becomes visible, and no longer simulates activity to keep a hidden tab awake, so a browser may throttle a hidden
    tab's pull. RxDB pauses a hidden tab's replication only when that tab isn't the leader; a single-instance database
    is always the leader (read in 17.5.0's `plugins/replication` source, not tested).

- [#280](https://github.com/TallyUI/tallyui/pull/280) [`1f4d0ab`](https://github.com/TallyUI/tallyui/commit/1f4d0ab8006f41586740195831aaa0c9adc17f15) Thanks [@kilbot](https://github.com/kilbot)! - `isStorageWorkerStartError` and `isStorageWorkerFailure` also recognise RxDB's RM1, a stale storage worker built on another RxDB version (for example a cached old worker after an upgrade), so apps show their reload advice for it. Both call the new `isRxdbRemoteVersionMismatch` in `@tallyui/core`, which recognises RM1 by structure only: an RxError's own `code`, or the remote storage's `could not create instance ` wrapping of an RxError's JSON. `@tallyui/storage-sqlite` now has `@tallyui/core` as a peer dependency.

## 2.0.0

### Minor Changes

- [#23](https://github.com/TallyUI/tallyui/pull/23) [`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b) Thanks [@kilbot](https://github.com/kilbot)! - **Breaking:** the cart and checkout components are presentational and take `Money`. `CartLine` takes `name`, `quantity`, `unitPrice` and `lineTotal`. `CartTotal` takes `subtotal`, `taxLines`, `discount` and `total`. `CashTendered` and `ChangeDisplay` take `Money` amounts. All of them format with `formatMoney`, so there is no `getPrice`, float arithmetic or hard-coded `'$'`. `CartPanel` is generic, and `CartLineItem` is removed. Totals come from `@tallyui/pos`; the components no longer compute tax. The cash input keeps the text as typed and emits integer minor units.

  `@tallyui/core` adds `moneyFromDecimalString`, which parses typed decimal text into `Money` using integer arithmetic.

- [#54](https://github.com/TallyUI/tallyui/pull/54) [`50317c8`](https://github.com/TallyUI/tallyui/commit/50317c8520ebc04f2f6cdd47b9b9c6a0ed3efdd6) Thanks [@kilbot](https://github.com/kilbot)! - Connectors can sign a user in: `ConnectorAuth` gains an optional `signIn(baseUrl, { email, password }, init?)` that resolves to a `SignInResult` (`token`, optional ISO 8601 `expiresAt`) and rejects with a `SignInError` whose `code` is `invalid_credentials`, `unsupported` or `failed`. The app stores the token and passes it back to `getHeaders` as `token`.

  Vendure's auth gains a sign-in flow: it runs the Admin API `login` mutation and takes the token from the `vendure-auth-token` header (the server's `tokenMethod` must include `'bearer'`). Its fields are now `url`, `email`, `password` and an optional `channel_token`. `getHeaders` sends `credentials.api_key` as `vendure-api-key`, otherwise `credentials.token` as a Bearer token, plus `vendure-token` when `channel_token` is set. The old `auth_token` credential is still accepted as a deprecated alias for `token`.

  Medusa's `medusaAdminUserAuth` signs in through `POST /auth/user/emailpass` and reads `expiresAt` from the JWT's `exp`. `medusaSecretKeyAuth` has no sign-in.

- [#58](https://github.com/TallyUI/tallyui/pull/58) [`3e09957`](https://github.com/TallyUI/tallyui/commit/3e099573c771f130ffb6a5a3736527e908899257) Thanks [@kilbot](https://github.com/kilbot)! - Add `combinePullAdapters` to `@tallyui/core`: it combines several pull adapters into the one adapter a collection replicates with, calling them one after another with a checkpoint per sub-adapter. Two replications on one collection can skip each other's pulled versions, so run one per collection.

  Vendure's `replication.products` now includes a variant feed that re-delivers parent products whose variants changed. Vendure does not bump `Product.updatedAt` on a variant price or stock edit, so the product feed alone misses those changes. An existing install's product-feed checkpoint carries over; the variant feed runs one full pass on first sync.

- [#18](https://github.com/TallyUI/tallyui/pull/18) [`a219ae0`](https://github.com/TallyUI/tallyui/commit/a219ae03588234d6e1a685a9924b52e115dcb7d1) Thanks [@kilbot](https://github.com/kilbot)! - Adds the TallyUI Sync Protocol command contract: the `CommandEnvelope`, `CommandResult`, `CommandWarning` and `OrderCreatePayload` types (with their line and payment types), the batch request and response types, the constants `COMMANDS_PATH`, `PROTOCOL_HEADER`, `PROTOCOL_VERSION` and `MAX_COMMANDS_PER_BATCH`, and the `isCommandBatchResponse` guard. These are the shapes pinned in ADR-038 and ADR-039, shared by the POS outbox and backend plugins.

- [#115](https://github.com/TallyUI/tallyui/pull/115) [`4df9be4`](https://github.com/TallyUI/tallyui/commit/4df9be400debddb67859482c17f9e68dadbf46d1) Thanks [@kilbot](https://github.com/kilbot)! - Discounts are pre-tax (ADR-062). An order discount is allocated across the lines in proportion to their own-mode amounts (the new `allocateOrderDiscount`, largest-remainder rounding), each line carries its share in `orderDiscountMinor` and is taxed after it, so an order discount now lowers the tax instead of coming off the total after tax. A discounted `order.create` is version 2, with `discountMinor` on each discounted line and on the payload; a discount-free payload stays version 1, byte-identical. `finalize` still rejects discounts until the plugins honour version 2. Receipt lines show their `discountMinor`. Stacked percentage order discounts are additive, each computed on the pre-order-discount base rather than compounding on what an earlier discount leaves, and every discount (line or order, percentage or fixed) is clamped to 0 so a negative value can never raise a price.

- [#99](https://github.com/TallyUI/tallyui/pull/99) [`9649259`](https://github.com/TallyUI/tallyui/commit/96492599bdb93fa573f588ae84585dc027289da8) Thanks [@kilbot](https://github.com/kilbot)! - `ReconcileFeedEntry` (core) gains `refreshOnly?: boolean`: a missing product is skipped instead of tombstoned when its entry is refresh-only, so only the id reconcile's braked entries can delete (ADR-060, backlog 43). Merging in `enqueue` keeps `refreshOnly` true only when every entry queued for that id was refresh-only, so a deletable id-reconcile entry is never downgraded by a later refresh-only one. The fingerprint runner (`startFingerprintReconcile`, database) now enqueues its entries this way; the id runner is unchanged.

  `FingerprintReconcileState` (database) gains `lastResultAt`/`lastErrorAt`, stamped from an injectable `now` (default `Date.now`), so a kept `lastResult` next to a newer `lastError` can be told apart from a current one. The new `isFingerprintResultCurrent(state)` helper does that comparison (backlog 46).

- [#85](https://github.com/TallyUI/tallyui/pull/85) [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09) Thanks [@kilbot](https://github.com/kilbot)! - Add the fingerprint reconcile (ADR-060 amendment 8): a neutral runner that compares a remote fingerprint per product against the local documents and re-delivers products whose fingerprint differs, through the collection's pull. `@tallyui/core` adds the `FingerprintReconcileAdapter` contract (`fetchPages`, a pure `fingerprint` and `enqueue`) and an optional `reconcile.prices` on `TallyConnector`. `@tallyui/database` adds `startFingerprintReconcile`, which runs no pass at start by default and otherwise mirrors the id reconcile: a complete, successful pass only, `state$` (`running`, `lastResult`, `lastError`), and `stop()`. `@tallyui/connector-medusa` adds `reconcile.prices`, a nightly base-price backstop (`MEDUSA_PRICE_RECONCILE_INTERVAL_MS`) for the variant feed (ADR-060 job D1): it fingerprints each product's base prices (variant id, currency and amount, sorted, price-list prices excluded) from `/admin/product-variants`. Nothing is written locally; corrections arrive only through the reconcile feed's pull.

- [#97](https://github.com/TallyUI/tallyui/pull/97) [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005) Thanks [@kilbot](https://github.com/kilbot)! - A fresh install downloads the catalogue once. A pull adapter can now declare `pull.seedCheckpoint`; on a fresh install (no stored checkpoint) `combinePullAdapters` reads every seed before any feed runs and starts that feed from it. The Medusa and Vendure variant feeds seed their cursor at the newest variant's `updated_at`, so their first pass no longer re-delivers every product the product feed has just delivered, and a variant edit made during the product feed's first pass still arrives. An install upgrading from a stored checkpoint is never seeded and keeps the variant feed's full healing pass.

- [#65](https://github.com/TallyUI/tallyui/pull/65) [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e) Thanks [@kilbot](https://github.com/kilbot)! - `@tallyui/core` adds `resolvePriceRange(variants, currency?)`, the lowest and
  highest current price across a product's variants. `ProductPrice` uses it to
  show `from <lowest price>` when a product's variants are priced differently,
  instead of just the default variant's price. New `showFromPrice` (default
  `true`) and `fromLabel` (default `'from'`) props control and opt out of this.

- [#61](https://github.com/TallyUI/tallyui/pull/61) [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8) Thanks [@kilbot](https://github.com/kilbot)! - Add the id reconcile (ADR-060): a periodic pass that reads every live product id and its live variant ids, so a deleted product or a deleted variant (whose parent's `updatedAt` does not change) reaches the local copy. `@tallyui/core` adds the `IdReconcileAdapter` contract and `createReconcileFeed`, which turns queued corrections into a pull-only adapter meant as the last key of `combinePullAdapters`. `@tallyui/database` adds the `startIdReconcile` runner. `@tallyui/connector-vendure` implements the Vendure side and wires it into `replication.products` and `reconcile.ids`. Nothing is written locally into the replicated collection; corrections arrive only through the collection's own pull.

- [#92](https://github.com/TallyUI/tallyui/pull/92) [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17) Thanks [@kilbot](https://github.com/kilbot)! - Medusa prices as Medusa charges them (ADR-060 D2b). `SyncContext` gains an optional `pricingContext` (from `storeSettings()`), `ProductPrice` an optional `taxInclusive`, and `TallyConnector.reconcile` a `calculatedPrices` slot. With a pricing context, every Medusa product document build fills each variant's `calculated_price` from the store API (`null` when the sales channel or region does not sell it), and the traits price from it: sale lists as a sale against the original price, override lists as the base price, `null` as unsellable. `reconcile.calculatedPrices` re-delivers products whose calculated prices changed with no timestamp bump; run it every `MEDUSA_CALCULATED_PRICE_RECONCILE_INTERVAL_MS` (30 minutes) with `maxPages: 1000`. Without a pricing context, documents and prices are unchanged.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99) Thanks [@kilbot](https://github.com/kilbot)! - Add backend-neutral price and stock traits. `ProductTraits` gains `getPrices` (a price list of integer minor-unit `Money` entries, `base` or `sale`, per currency) and `getStock` (`in_stock | out_of_stock | backorder | unknown` plus an optional quantity). Core adds `resolvePrice`, `moneyFromMajor`, `moneyToMajor` and `minorUnitDigits`. Every connector maps its own shape into them; WooCommerce's `instock`/`outofstock`/`onbackorder` strings now stay inside the WooCommerce connector. The string-price and WooCommerce-style stock accessors remain and are deprecated.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a) Thanks [@kilbot](https://github.com/kilbot)! - Build the product components on the neutral traits. `ProductPrice` resolves the price list and formats it with Intl in the price's own currency (new `currency` and `locale` props; `currencySymbol` is now only the fallback for an unknown currency). `ProductStockBadge` reads `getStock`. `ProductImage` gains `showPlaceholder`, an initial tile for products without images. Core adds `formatMoney`, a `traitContext` prop on `ConnectorProvider` for store-level facts like the store currency, and `useTraitContext`. `@tallyui/pos` adds `searchProducts`, name/SKU/barcode search through traits that works the same on every backend.

- [#120](https://github.com/TallyUI/tallyui/pull/120) [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764) Thanks [@kilbot](https://github.com/kilbot)! - A per-store `order.create` capability check replaces the global discount guard (ADR-062). `@tallyui/core` gains `ServerCapabilities`, `SignInResult.capabilities`, `SyncContext.capabilities`, `TallyConnector.capabilities?()` and `resolveCapabilities(fresh, stored)`. `@tallyui/connector-medusa` reads the store's supported `order.create` versions from `GET /tally/v1/info`: a 404 or a malformed response means an old plugin (version 1), a network failure or a 5xx is unknown and keeps the last known value, and a 401 throws. `medusaSignIn` returns the read capabilities, and both Medusa connectors expose `capabilities(context)` for a restored session. `finalizeOrder` in `@tallyui/pos` now rejects a discount only when the store's capability is below 2, so a store whose plugin has caught up finalizes a discounted order as `order.create` version 2.

- [#95](https://github.com/TallyUI/tallyui/pull/95) [`f1af98c`](https://github.com/TallyUI/tallyui/commit/f1af98ce0161ded267e873ead952e8d7deafe471) Thanks [@kilbot](https://github.com/kilbot)! - `OrderCreateLine` gains an optional `taxInclusive` (ADR-038 amendment 2). It is the line's own tax mode, sent only when that mode differs from the order's `pricesIncludeTax`. Single-mode orders produce byte-identical payloads. `finalize` still rejects converted lines until the Medusa plugin honours the field.

- [#157](https://github.com/TallyUI/tallyui/pull/157) [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766) Thanks [@kilbot](https://github.com/kilbot)! - `readFresh`, `countFresh` and `watchFresh` move to a new, side-effect-free subpath, `@tallyui/core/rxdb`. Core now lists `rxdb` (`>=16`) and `rxjs` (`>=7`) as optional peer dependencies, needed only by that subpath; core's main entry stays free of both. `@tallyui/pos` re-exports the helpers unchanged. The id and fingerprint reconciles in `@tallyui/database` read the local products with `readFresh` instead of a cached `find()`, so a product the pull inserts or deletes while a pass reads them no longer leaves every later pass reading a stale list (RxDB 16.21.1 bug 4): an inserted product is now checked, and tombstoned or re-fetched, on the next pass, and a deleted one is no longer re-enqueued or counted towards the mass-delete brake.

- [#164](https://github.com/TallyUI/tallyui/pull/164) [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588) Thanks [@kilbot](https://github.com/kilbot)! - Register screens (WCPOS `next` port, ADR-032), driven by `useRegisterSession`: `RegisterPicker`, `OpenRegisterCard`, `RegisterBar` (one status pill; "Register ›"), `MovementSheet` (labelled "Amount" and "Reason"; a reason for every movement; same-tick taps coalesced), `RegisterPanel` (expected in the drawer; Undo by reversal; blind mode hides amounts) and `RegisterColumn`. `@tallyui/core` adds `currencySymbol(currency, locale?)`.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4) Thanks [@kilbot](https://github.com/kilbot)! - Add `isSellable` and `getVariantCount` product traits to core and all four connectors.

- [#57](https://github.com/TallyUI/tallyui/pull/57) [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9) Thanks [@kilbot](https://github.com/kilbot)! - `SignInErrorCode` splits the old `failed` in two: `failed` now means no response arrived (a network error), and the new `server_error` means a response arrived but was unusable (a bad status, a malformed body, or a missing token). `SignInError` gains an optional `status` from a third constructor argument. Callers that switch on `code` should handle `server_error`.

  Medusa's sign-in now treats `mfa_required: true` and `verification_required: true` the same as a `location` body: `unsupported`, and no token is ever returned from a body like that. A malformed response body, any other non-OK status and a missing or non-string token are now `server_error` with the HTTP status.

  Vendure's sign-in now treats `NATIVE_AUTH_STRATEGY_ERROR` as `unsupported`, since native email/password auth is disabled on the server. A malformed response body, a non-OK status, GraphQL errors, a missing `data.login` and any other `ErrorResult` are now `server_error` with the HTTP status.

- [#64](https://github.com/TallyUI/tallyui/pull/64) [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9) Thanks [@kilbot](https://github.com/kilbot)! - Both connectors now store a product's variants sorted by id, since neither Medusa nor Vendure guarantees variant order across requests: `@tallyui/core` adds `compareIds`, and the Medusa and Vendure product projections (`toDocument`, `toProductDocument`) sort `variants` with it before the document is stored. Traits that read `variants[0]` (`getPrices`, `getSku`, `getPrice`, `getStockQuantity`, `getBarcode` and others) now see a stable variant across runs.

  Already-stored documents take the new order the next time they are delivered. Vendure's variant feed re-delivers every product on its first pass anyway, so it heals immediately.

- [#55](https://github.com/TallyUI/tallyui/pull/55) [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5) Thanks [@kilbot](https://github.com/kilbot)! - Stock reads use the reconciled overlay (ADR-060) and show how fresh it is. `@tallyui/core` now holds `withStockOverlay` and `getProductStock` (`@tallyui/pos` re-exports them), adds `STOCK_LEVELS_LAST_PASS`, `stockOverlay` and `stockOverlayAsOf` props on `ConnectorProvider`, and a `useProductStock(doc)` hook that returns overlay stock plus `asOf`, or `getStock(doc)` when no overlay is given. `@tallyui/database`: `startStockReconcile` also returns `state$` (`running`, `truncated`, `lastError`, `lastCompletedAt`), `reconcileStock()` resolves with `completedAt`, and each successful pass stores `{ completedAt }` in the `last-pass` local document of `stock_levels`, which `createTallyDatabase` now creates with local documents (apps that create the collection themselves use the new `stockLevelsCollection` config; without local documents a pass rejects with a clear error); a restarted runner seeds `lastCompletedAt` from it. `@tallyui/pos` adds `stockOverlayAsOf$`. `ProductStockBadge` reads stock through `useProductStock` and appends " · as of <time>" when an overlay is given (`showAsOf={false}` hides it).

- [#53](https://github.com/TallyUI/tallyui/pull/53) [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6) Thanks [@kilbot](https://github.com/kilbot)! - Add a stock reconcile pass (ADR-060). `@tallyui/core` adds the `StockReconcileAdapter` contract (`fetchPages` and a pure `overlay`) and an optional `reconcile.stock` on `TallyConnector`. `@tallyui/database` adds the local-only `stock_levels` collection (`STOCK_LEVELS_COLLECTION`, `stockLevelsSchema`), which `createTallyDatabase` creates for connectors with `reconcile.stock`, and `startStockReconcile`, which re-reads stock every 5 minutes (and on demand through `reconcileStock()`) into that collection: it writes only changed rows, removes keys the backend no longer returns, writes nothing after a failed, truncated or stopped read, and never writes the replicated products. `@tallyui/pos` adds `stockOverlay$`, `withStockOverlay` and `getProductStock`, which read stock from the overlay where it has an entry and from the replicated product otherwise. The Vendure connector reconciles variant `stockLevels`, and the Medusa connector reconciles inventory item location levels, so stock changes that bump no product timestamp reach the POS.

- [#87](https://github.com/TallyUI/tallyui/pull/87) [`ac2a24a`](https://github.com/TallyUI/tallyui/commit/ac2a24a147d1a759e7c5e28e73d0be90caa5e29b) Thanks [@kilbot](https://github.com/kilbot)! - `TallyConnector` gains an optional `storeSettings(context, choice?)` (TV4): one read-only call for the store's currency, `pricesIncludeTax`, `taxRatesPpm` and an opaque connector-specific `pricingContext`, so the app can feed the connector's own tax-inclusivity option and the POS `TaxProvider` from a single source of truth instead of two hand-matched settings. Rejects with a `StoreSettingsError` (`choice_required` with `choices`, or `failed`).

  Vendure's `storeSettings` reads the active channel's currency and `pricesIncludeTax`, and the default tax zone's enabled, non-customer-group rates keyed by tax category id (rounded to integer ppm once, at the connector's edge). `default` is the `isDefault` category's rate, or, when none is flagged, the first category Vendure's own `taxCategories` lists — the same fallback Vendure uses for a variant created without a category — and is 0 when that category has no rate in the zone. `createVendureConnector`'s `pricesIncludeTax` option is unchanged; pass `settings.pricesIncludeTax` from `storeSettings` instead of hand-matching it to the POS.

- [#19](https://github.com/TallyUI/tallyui/pull/19) [`8df0569`](https://github.com/TallyUI/tallyui/commit/8df0569d849f6099ec260eeb06e5c230172e12b5) Thanks [@kilbot](https://github.com/kilbot)! - Adds variant traits. `VariantSummary` (`id`, `title`, `sku`, `barcode`, `prices`, `stock`) and the optional `ProductTraits.getVariants` describe every purchasable variant of a product, and `findVariantByCode` finds a variant by barcode or SKU for scanning. The Medusa connector implements `getVariants`; its product-level `getPrices` and `getStock` results are unchanged.

### Patch Changes

- [#94](https://github.com/TallyUI/tallyui/pull/94) [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be) Thanks [@kilbot](https://github.com/kilbot)! - `resolvePrice` keeps a price's `taxInclusive` flag on `current` and `was`. Each order-builder line keeps its price's own tax mode (`LineItem.taxInclusive`, plus `priceTaxModeConverted` when it differs from the store's `pricesIncludeTax`), so a customer pays exactly the shelf price and an inclusive price in an exclusive store is no longer taxed twice. Orders whose prices carry no flag, or one that agrees with the store, total exactly as before. The receipt shows a converted line in the order's mode, by its share of the order's once-rounded tax, so the lines still add up.

  In priced mode, the Medusa traits' deprecated `getPrice` and `getRegularPrice` return the resolved calculated price instead of the admin prices, and `isSellable` is false when no variant yields a price (for example a `calculated_price` with null amounts).

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d) Thanks [@kilbot](https://github.com/kilbot)! - Report product-level stock across all variants, showing the total quantity only when every variant has tracked, known stock.
  Draw the search magnifier with an attached, rounded handle and a larger ring.

## 0.2.0

### Minor Changes

- [#4](https://github.com/TallyUI/tallyui/pull/4) [`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90) Thanks [@kilbot](https://github.com/kilbot)! - Initial npm release with build tooling
