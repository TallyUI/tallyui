# @tallyui/pos

## 3.5.3

### Patch Changes

- @tallyui/core@3.5.3

## 3.5.2

### Patch Changes

- @tallyui/core@3.5.2

## 3.5.1

### Patch Changes

- @tallyui/core@3.5.1

## 3.5.0

### Minor Changes

- f93720a: `Catalogue` gains an opt-in category nav (`showCategoryNav`, optional `categories`). "All products" comes first, then the categories of the listed products. The choice is kept in the view state as `categoryId` (new in `CatalogueViewState`, with the `setCategory` action). Visual change: `CategoryNav` chips are now rectangular (`rounded-md`) instead of pill-shaped (`rounded-full`), in every app that renders it.
  `CategoryNav` chips are also exposed as radios (`role="radio"`, `aria-checked`) in a radiogroup labelled "Categories".
- 4579599: `Catalogue` can switch between grid and table (`showViewToggle`), take a grid column count, and keep a view state the app controls or persists (`viewState`, `defaultViewState`, `loadViewState`, `saveViewState`, `onStateChange`, `items`, `onQueryChange`); new `ViewToggle` primitive and pure `catalogueViewReducer` / `normalizeCatalogueViewState` / `resolveGridColumns`. Without the new props the Catalogue is unchanged.
- a5b432e: Products report flat categories with string ids through the new optional `getCategories` trait (WooCommerce and Medusa categories, Vendure collections, Shopify product type). `@tallyui/pos` adds `productCategories`, `listCategories` and `inCategory`, which fall back to `getCategoryNames` for connectors without the trait.
- 6b2277c: Add `ProductTable` (a virtualised product table with default trait columns and header sort) and the pure `sortProducts` / `productSortValue` helpers.

### Patch Changes

- Updated dependencies [a5b432e]
  - @tallyui/core@3.5.0

## 3.4.0

### Minor Changes

- c3acce9: Include fees and shipping in Z report tax rates, expose store capabilities from useSale, and tax WooCommerce shipping using the store's shipping tax class as the cart changes.

### Patch Changes

- @tallyui/core@3.4.0

## 3.3.0

### Minor Changes

- f604f87: Orders with fees, shipping or custom lines can be completed and sent as `order.create` version 5 to a store that
  accepts it (others refuse at completion, naming the plugin upgrade). `pos_orders` moves to version 8, which also
  records the woocommerce tax rounding (ADR-075, ADR-076). **Version 8 is one-way: a till that opens this release
  can't go back.**
- 71be352: A `woocommerce` tax strategy (ADR-076): several rates per class with priority and compound tax, and WooCommerce's per-rate per-line rounding (or at subtotal), through `StoreSettings.taxRates` and `TaxContext.getTaxRates`; other strategies are unchanged.

### Patch Changes

- db9d97a: `buildClosureDocument`'s `has_sales` is true only when the period had a sale or refund (it was true for every closure, because the period totals are always strings such as "0.00").
- cec1088: The WooCommerce transport pushes tax-inclusive lines with the till's 6dp ex-tax net, as WooCommerce rebuilds a line's tax from it (ADR-076); a discounted tax-inclusive line is still refused. `CommandTransport.send` takes an optional, local-only `OrderTransportContext`.
- c7aa412: Woo products carry `tax_class` and `tax_status` (schema version 2: a till resyncs its products once) through the `getTaxClass`/`getTaxStatus` traits. Core adds the optional `getTaxStatus` trait, which the cart and `addProduct` pass to the line.
- Updated dependencies [820b8c2]
- Updated dependencies [fcace3b]
- Updated dependencies [9f7cffe]
- Updated dependencies [c7aa412]
- Updated dependencies [611ce1c]
- Updated dependencies [585af9b]
- Updated dependencies [71be352]
  - @tallyui/core@3.3.0

## 3.2.1

### Patch Changes

- a187b61: Fees, shipping and custom lines on the order (ADR-075 phase a):
  `useSale` `addFee`, `addShipping`, `addCustomLine` and their update/remove, with tax, totals, display and receipt
  rows. Orders carrying them can't be completed until a later release sends `order.create` version 5.
  - @tallyui/core@3.2.1

## 3.2.0

### Minor Changes

- 2a3a3f0: `useSale` takes an optional `currentPrice(variantId)` and `resume()` then re-prices a parked sale's lines to today's prices (with a non-blocking 'Prices changed' message; `resume(id, { keepParkedPrices: true })` keeps them); `ParkedSales` takes optional `onPark`/`onResume`, so an app can drive it from its own parked store.

### Patch Changes

- @tallyui/core@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [63a7431]
  - @tallyui/core@3.1.1

## 3.1.0

### Minor Changes

- 8471546: The stored order keeps the sale's id as `saleId` (`pos_orders` version 7, ADR-072; never sent). Version 7 is one-way: a till that opens 3.1.0 can't go back to 3.0.x.
- 423bf42: Split tender: `useSale().addTender()` and `removeTender()` take several payments for one sale. Change comes only from cash, and a card tender is capped at the balance due (ADR-072). `setTender` now replaces every payment with the one given.

### Patch Changes

- ae38ef8: New `ParkedSales` sheet (components) and `useParkedSales(drafts)` hook (pos): park the current cart, and resume or discard (with confirmation) parked carts, newest first.
- 56b24d2: `useSale().removeTender()` with an id not among the payments changes nothing (it no longer emits a new snapshot).
  - @tallyui/core@3.1.0

## 3.0.4

### Patch Changes

- @tallyui/core@3.0.4

## 3.0.3

### Patch Changes

- e7b980a: OrderBuilder.setUnitPrice and useSale.setUnitPrice edit a line's unit price at the till (discounts and tax recomputed; integer, >= 0); no stored-order change.
- c05e216: useSale parks and resumes carts through a drafts collection (new `drafts` option, `park()` and `resume(id)`), using OrderManager's draft format; new exports `orderDraftSchema`, `writeOrderDraft`, `restoreOrderDraft` and `parkedOrderSummaries$`.
- 1d8cbc0: catalogueEntries accepts a trait context and no longer requires getVariants (a product without it sells as one variant from its own traits); Catalogue passes its currency; connector-woocommerce adds getVariants for non-variable products (variable products need their variations synced, a later release).
  - @tallyui/core@3.0.3

## 3.0.2

### Patch Changes

- @tallyui/core@3.0.2

## 3.0.1

### Patch Changes

- @tallyui/core@3.0.1

## 3.0.0

### Major Changes

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

### Minor Changes

- 78d324e: Add useSale.setCustomer and ReceiptData.header.customer, customerTraits, CustomerPicker, generic CustomerSelect/CustomerCard with traits overrides, CustomerForm.showAddress, and the receipt's customer line.

  CustomerSelect rows are now pressable, so choosing a result works on the web (it previously did nothing).

- 901fa66: Add `order.create` envelope version 3, its display and tax-rate wire types, and the payload's `sessionId` and customer reference.

  At capability 3, `finalizeOrder` copies the receipt's `display` and `taxByRate` into the sale. Version 3 sends those figures and the sale's session (stamped or late) as `sessionId`. Older orders keep their existing envelope version.

  Move `pos_orders` to schema version 3 with a `sessionId` index and the optional `sentVersion` and `downgradedFrom` fields (declared for the outbox's version fallback, not yet written). Apps must open `pos_orders` with `addPosOrderCollection`, which migrates it.

- bf2d805: `order.create` version 4 (#286): every `discountMinor`, the order's and each line's, is tax-exclusive, so their sum still holds. Core accepts version 4 with version 3's fields. The till's envelope builder (`toOrderCreateEnvelope`) produces version 4 when capped at 4 or more and the order's `sentVersion` doesn't hold it lower. The till doesn't send version 4 yet: the outbox doesn't pass the server's max, so it still sends version 3 or lower with the same figures, byte-identical.
- 130d28e: A store that keeps answering 404 is no longer silent. After 3 consecutive 404 answers the order and register outboxes set `OutboxState.backendMissing: { since }` (when the first of them arrived), and `SyncStatus` tells the cashier in plain words that sales aren't reaching the online store and are saved on the till, with a detail line for the store owner, instead of showing `retrying (status_404)`; the stuck line shows the same words, with no raw code. `SyncStatus` takes an optional `pluginName` (default `'the POS plugin'`) for that detail. The outboxes keep retrying on their normal backoff, and orders stay pending, so a 404 during a deploy blip recovers on its own. The next answer that isn't a 404 clears it; an offline (`network`) retry changes nothing.
  Pass one `createBackendNotFound()` tracker as `backendNotFound` to both `createOrderOutbox` and `createRegisterOutbox` so their 404s count together and the notice shows once, whichever outbox meets it first; without it, each outbox keeps its own.
- 9e1032f: One order the store keeps failing no longer stops every later sale. After 5 server-answered failures (offline never counts) the order outbox probes the pending queue one order per backoff interval, oldest first; once the store takes one, the orders whose probes failed are isolated and retried alone, and batching resumes. If no probe gets through, the store is down: nothing is isolated. Retries alternate between the batch (or the probe) and one due isolated order, one request per interval, so neither can starve the other, and isolated orders take turns. An order the store has kept failing for 15 minutes of answered time, on its own clock, is flagged as stuck and stays pending: `OutboxState.stuck`, with a per-order entry in `stuck.orders`, `useOrderOutbox`'s `stuckCommandIds`, `needsAttention`'s `stuckCommandIds` option, `OrdersList`'s `stuck` prop (each order with its own time and reason), and `SyncStatus`'s "Not syncing" line. An offline failure pauses every clock, and the store's next answer of any kind resumes them all; a flagged order stays flagged through an offline spell, since a paused clock keeps its answered time. The HTTP transport now reports a request that got no answer in time as `timeout`, which counts like a 503 and never pauses a clock, and keeps `network` for a store it could not reach.
- ca0beac: Fall back to the server's supported order.create version while preserving stored fiscal figures and command IDs. Record the sent version and downgrade in the order audit, and expose command error details.
- a9cdfc0: Migrate pos_orders to version 4 with optional localWarnings and serverFailures. Record omitted customer details and dropped payment references on the stored order, and show these warnings in the orders list; serverFailures is declared for the next outbox update.
- 9ffa7c0: The till sends `order.create` version 4 (#286) to a server that advertises 4. Each order is resent at the version it first went out at: the outbox records `sentVersion` before an order's first send, so a retry after the store upgrades is byte-identical. With the server's max unknown, the till sends at most 3 and records that. `requeue()` clears `sentVersion` and `downgradedFrom`, since the new `commandId` chooses afresh.

  `pos_orders` moves to schema version 5: `sentVersion` and `downgradedFrom` accept 1 to 4, and the migration records each order without a `sentVersion` at its content version (3 with `display` and `taxByRate`, else 2 when discounted, else 1). Like version 4, this storage is one-way: an older build opens it but shows no orders (ADR-069).

- 6bbd1ba: Each sale records the tax rounding its figures were computed with (#287): `finalizeOrder` writes `taxRounding` on the stored order, the default (`per_order`, `half_away_from_zero`) included, and `custom` as `{ granularity: 'custom' }`. It is the till's own record and is never sent in `order.create`. The Z report splits each sale's tax by rate with the strategy that sale recorded, so its rows are the receipts' rows, and its `breakdowns.tax_rounding_mixed` is `true` when a session's sales used more than one strategy (a `custom` sale counts as the default it applied); `ClosureSheet` then says so, and `buildClosureDocument` carries the same line ready to print as `closure.tax_rounding_note` (`TAX_ROUNDING_MIXED_NOTE`), for the apps' closure templates. `PosOrder.taxRounding` is now required in the type.

  `pos_orders` moves to schema version 6: `taxRounding` is required, and the migration records the default on every older sale, the only rounding any earlier build used. Like version 5, this storage is one-way: an older build opens it but shows no orders, so never roll an app back across it (ADR-069). Before 3.0.0 ships, #242's OPFS upgrade proof is rerun against version 6.

- 222543b: Add `RegisterCommandType`, `RegisterCommandEnvelope` and `AnyCommandEnvelope`, register payloads and results, and the register server capability. `CommandType` and `CommandEnvelope` are unchanged.

  Record the local `register_commands` ledger through `reconcileRegisterCommands`, gated in `useRegisterSession` by its new `commands` and `capabilities` options. Commands are recorded but not sent. Medusa reads the `register` contract.

- 8141c1c: Guard register commands, movement reasons and register ids, exporting RegisterMovementReasonError and RegisterIdInvalidError. Harden register outbox result handling and batch limits.

  Make CommandBatchRequest generic while preserving its existing default envelope type.

- c9798a3: The register outbox now sets `OutboxState.stuck` when the store has kept failing a sent register command for 15 minutes of answered time (`STUCK_AFTER_MS`, shared with the order outbox; offline gaps pause the clock), so the app can say since when till updates haven't reached the online store. The clock clears when the command is applied or rejected. It is kept in memory only: a restart starts it afresh.
- 581472f: Add createRegisterOutbox to send stored register commands serially per register. The app starts it only for a store with the register capability.
- c26ead6: A till no longer sells on a guessed tax rounding. When the store's capabilities read fails (it throws, or answers "unknown", as Vendure's does for a network error or a 5xx), `useStoreSettings` keeps the settings unresolved instead of falling back to the default rounding. It retries by itself after 5 seconds, then 10, doubling to at most 5 minutes. While it waits, the state is `error` with a `nextRetryAt`, and an app shows "Can't reach the store's settings yet. Retrying…". Only a store that reports no rounding, or a connector without `capabilities`, gets the default. Before this, a failed read on a Vendure store set to `per_rate_group_items` meant every sale raised `figures_mismatch`.
- 0e4c9cc: The "since" a cashier reads is a real time (#253). `OutboxState.stuck` (both outboxes) gains `firstFailedAt`: the wall-clock time the first failure of the current stuck run was answered, so an offline gap no longer moves it. `since` keeps its meaning, the clock's virtual start, and still drives the 15-minute threshold. `firstFailedAt` is kept in memory only. After a restart it is absent, and `SyncStatus` and `OrdersList` show the stored time instead, worded "since about 2:49 AM".
- a94b255: `OutboxState` gains `rejected?: number`: the order outbox publishes the count of `pos_orders` the store refused (`syncStatus: 'rejected'`) wherever it publishes `pending`, so it rises when a batch result rejects an order and falls when `requeue()` sends one again. The register outbox leaves it unset. While `rejected` is above 0, `SyncStatus` never says "Sales are up to date.": its whole status line (label, polite live region and iOS announcement) is "1 sale needs attention · The online store refused it. Ask the store owner to look at the till's sync log." or "{n} sales need attention · The online store refused them. Ask the store owner to look at the till's sync log.", in place of the stuck and backend-missing sentences and the sending or retrying line. What else waits stays in the count: "1 sale needs attention, 5 waiting to sync · …" with other sales pending, "…, 2 till updates waiting to sync · …" with till updates, and "…, 5 sales and 2 till updates waiting to sync · …" with both. Below it, "Refused sales stay on this till under Needs attention, each with what to do next.", then the backend-missing detail when the store is missing. With `rejected` 0 or unset, nothing changes. When the store refused a whole batch (`refused` set, no sale carrying a code), the status line is the waiting count followed by " · The online store refused the last send. This till will try again with the next sale, or when the app is reopened." in place of the stuck or backend-missing sentence, and the sending or retrying line (which read "Retrying in 0 s.") is hidden; refused sales still outrank it. With only till updates waiting and the register outbox refused, it ends "…try again with the next till update." instead; with a sale waiting, the sales line wins.
- 5ed6281: The till computes tax with the store's rounding strategy (#287, ADR-071). `ServerCapabilities` gains `taxRounding` (core exports `TaxRounding`): `per_order`, `per_line_items` or `per_rate_group_items`, each with `half_away_from_zero` or `half_up`, or `custom`. Absent, and `custom`, mean today's `per_order` with half away from zero. `TaxProvider` takes `rounding` and `rateCodes` (tax class → the backend's rate name, for `per_rate_group_items`); the order records the strategy as `taxRounding`, and `taxLinesByRate` takes it as a fourth argument. The algorithms are in `docs/contract/field-kinds.md`.
- 5a204a9: `StoreSettings` gains a derived `taxRounding`. `useStoreSettings` fills it from the context's capabilities, or else from one read of the connector's `capabilities()` made before the settings are ready, so each sign-in emits the settings once with the rounding known and no later change holds a sale; a failed read or a connector without `capabilities` gives the default rounding. `taxProviderProps` passes it to `TaxProvider` as `rounding`, so the till rounds tax like the store with no app code (#324). `custom` passes no rounding, and an explicit `rounding` prop still wins.
- 6278d8d: The register outbox can start when its store opens, as the order outbox does (#290). The new `useRegisterOutbox({ commands, transport, deviceId, isEnabled?, onResult?, backendNotFound? })` runs `createRegisterOutbox` over an already-open `register_commands` collection, and calls `start()` so that till updates left pending (after a refused batch, for instance) go out when the app reopens. It returns `{ state, flush }`. A new collection or device id restarts the outbox, and `commands: null` leaves it idle. Apps that create the register outbox themselves should switch to this hook. `SyncStatus`'s till-updates refusal line now ends "…with the next till update, or when the app is reopened.", matching the sales line.
- e15f389: The Vendure connector supplies its tax rate names, so a `per_rate_group_items` store groups a sale's tax the way Vendure does (#324). Apps no longer fetch the names themselves.

  - **`StoreSettings.taxRateCodes`** (core, optional): the backend's tax rate name per tax class, keyed like `taxRatesPpm`, including `default`.
  - **`vendureStoreSettings`** reads each rate's `name` in the tax-rate query it already runs, so no extra request is made. Only the rates `taxRatesPpm` uses count, and `default` follows the same default-category rule. `taxRateCodes` is left out when no names come back.
  - **`taxProviderProps(settings)`** passes `taxRateCodes` to `<TaxProvider>` as `rateCodes`.

### Patch Changes

- d6a5073: **The outbox freezes an order an older till stored before it first sends it** (`freezeSentForm`, which `finalizeOrder` uses too):

  - line names, discount labels and payment references are cut to 255 characters, but ids never are;
  - a customer email or id that `order.create` would refuse is left out;
  - the frozen form is written back, so the receipt and the store see the same bytes.

  So an order stored before the upgrade and still unsent is never refused as `invalid_payload`.

  **New type:** `SentOrder`, an `Order` whose customer id may be missing. The receipt stage, `buildReceiptData` and `Receipt` take it, and a plain `Order` still fits.

- 27d736e: `CommandWarning` gains `bridgeMinor` on `total_mismatch` and a new `tax_rate_mismatch` code, and the till now ignores warning codes it doesn't know (`knownWarnings`), instead of showing them as a store total.
- e59ebec: Each line is taxed at its product's tax class, not the store's default (#288). `ProductTraits` gains an optional `getTaxClass(doc, variantId?)`, the backend's tax class id, a key of `StoreSettings.taxRatesPpm`. `addProduct` and `addEntryToCart` pass it to `addLine` through the new `AddLineInput.taxClass`, which the tax context resolves; a connector without the accessor is unchanged (the default rate). `TaxProvider` taxes a class with no rate at the default rate and warns once per class through the new `taxLogger`. connector-vendure replicates each variant's `taxCategory { id }` and implements the accessor, and its store settings give every tax category with no enabled rate in the default zone an explicit 0 rate, as Vendure charges; its product schema goes to version 2, so the products collection is dropped and downloaded again on the first sync after the upgrade.
- eb203b4: Review follow-ups with no behaviour change (#356, #358):
  - `SyncStatus` and `OrdersList` build their "since {time}" and "since about {time}" text with one shared helper.
  - `useRegisterOutbox`'s docs now say when `transport()` is called, and that the latest `isEnabled` and `onResult` are used without restarting the outbox.
- 8cd7860: A sale the store refuses on its first send is sent once, not twice (found by the Medusa POS app's 3.0.0-next.0 adoption). Before it sends, the outbox stores the order's sent form and version (#300). That write had re-armed the flush, so a refused batch went out again. A write that only records the sent form, for a new sale or for an older one carried over by the pos_orders migrations, is no longer counted as new work. Any other change to a pending sale still sends it.
- af623c9: The order.create string lengths move from `payloadShapeErrors` to the new `payloadBoundErrors`, which `precheckCommand` calls after the replay lookup, so an applied order resent with a long title replays as `duplicate`; `payloadShapeErrors` keeps the types, the `customerId` and `sessionId` bounds and the NUL check. `useSale` applies a tender before logging a dropped reference, and `add()` refuses a product whose id or v3 tax code finalize would refuse; the tender's reference field caps at 255 characters. `finalizeOrder` now freezes the sent form (names and discount labels cut, an unsendable customer email or id left out) and `toOrderCreateEnvelope` sends the stored order unchanged, so every resend is byte-identical.
- ef2f64e: The shared order.create shape check bounds string lengths and refuses NUL, and so does the v3 fiscal-figures check for its display and tax-code strings. The till cuts long names when it stores the order, refuses over-long pass-through references at finalize (and a payment reference as it's entered), refuses a searched or parked customer whose email or id the server would refuse, and validates the customer email at entry. Tills should ship this clamp before plugins adopt the new bounds, so no till sends a sale the server would now refuse.
- d225c58: Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.
- d329193: The order outbox stores each pending order's stuck clock and isolation in `serverFailures` and restores them when it starts, so after a restart an order the store keeps refusing no longer holds up the other sales, and its stuck flag keeps its start time.
- c00e1ea: `OrdersList` shows a rejected sale's refusal in the cashier's words, one sentence per error code (#269), in both Needs attention and Recent, and never the store's own message. An unknown code, or a rejected sale with no error, shows `platform_error`'s sentence: "The online store refused this sale. Ask the store owner to look at the till's sync log." An `idempotency_mismatch` shows its sentence ("… Don't send it again; ask the store owner to compare the two.") in place of the old "This sale needs checking against the store before it can be sent again." line, and still has no Retry. The order outbox logs every refusal once to the sync log as "Order refused by the store" with the order id, the code and the store's message: a warning, or an error for `unsupported_version` (whose log previously used the message itself as its text).
- 8ae3c53: A register session transition's ledger key now includes its status (`session.transition:<sessionId>:<status>:<at>`), so a close in the same millisecond as the count before it is queued with its `counted`, `closedBy` and `approvedBy` instead of being skipped (#258).
- 9885075: Match variant barcodes and SKUs in product search, and skip disabled Vendure variants when reading the product barcode.
- c48e1dd: Store settings follow-ups to #339 and #341 (#340):

  - **A signed-out till is asked to sign in**, not shown "Retrying…". When the capabilities read fails with an error only the till can fix, `useStoreSettings` gives `error` without `nextRetryAt` and doesn't retry by itself, so the app prompts. That covers a till-class error (a 401, or a till that needs updating) and a `SignInError` with `code: 'invalid_credentials'`; any other sign-in error still waits and retries. Every other failure still waits and retries.
  - **A `/tally/v1/info` JSON body that isn't an object** (`null`, an array or a scalar) is unknown, not the default rounding.

- df80ead: `SyncStatus` takes an optional `registerState` (the register outbox's state): waiting till updates are counted ("1 till update waiting to sync", or named beside the sales), so it never says the sales are up to date while any wait, and with no sale waiting the backend-missing sentence says till updates aren't reaching the online store, or, once `registerState.stuck` is set, "Till updates haven't reached the online store since {time}. …". The backend-missing detail now reads "This till couldn't find {pluginName} on the online store. …". With nothing waiting, the line is only "Sales are up to date." (it replaces "All sales synced"), with no sending, retrying or problem text after it; if the store is missing, the detail reads "This till couldn't find {pluginName} on the online store the last time it checked. …". The status line's accessibility label is the whole visible line instead of "Sync status". The order and register outboxes let go of a shared `backendNotFound` tracker on `stop()` and take it up again on `start()` or `flush()`.
- 37aad35: `useSale` never drops a line tapped while new store settings land (#301). The new sale that new tax settings or currency start on an idle cart now begins in a layout effect, inside the commit that brings those settings, and only when the sale is idle at that moment (no line, cart stage, no save in flight or pending), not as of the last render. Every sale change reads the current order builder, so a call from an older render never reaches a builder that `newSale()` has replaced. A line tapped once the new settings have committed lands on the new sale, priced with the new settings; a line that reaches the sale before its new sale starts keeps that sale, on its old settings.
- 4122dc8: order.create v3 omits a malformed session ID (empty or longer than 36 characters) instead of sending it, so the plugin never refuses the sale for it. At capability 3, `finalizeOrder` refuses a sale whose display lines don't join the order's lines by id and count, or whose display tax mode differs from the order's.
- Updated dependencies [4de75c2]
- Updated dependencies [894b6ae]
- Updated dependencies [04905ef]
- Updated dependencies [faa7cda]
- Updated dependencies [9f34416]
- Updated dependencies [fb57e1d]
- Updated dependencies [898e98b]
- Updated dependencies [75c5dce]
- Updated dependencies [ba63f04]
- Updated dependencies [0d04d13]
- Updated dependencies [78d324e]
- Updated dependencies [7fee0c1]
- Updated dependencies [24b74fd]
- Updated dependencies [eb5a032]
- Updated dependencies [54ee98a]
- Updated dependencies [27d736e]
- Updated dependencies [e59ebec]
- Updated dependencies [2ecaa36]
- Updated dependencies [901fa66]
- Updated dependencies [bf2d805]
- Updated dependencies [ca0beac]
- Updated dependencies [af623c9]
- Updated dependencies [ef2f64e]
- Updated dependencies [5c90aed]
- Updated dependencies [668f71f]
- Updated dependencies [457162d]
- Updated dependencies [222543b]
- Updated dependencies [8141c1c]
- Updated dependencies [ce4f796]
- Updated dependencies [6673faf]
- Updated dependencies [c48e1dd]
- Updated dependencies [1f4d0ab]
- Updated dependencies [5ed6281]
- Updated dependencies [5a204a9]
- Updated dependencies [7d1bc98]
- Updated dependencies [3cf5452]
- Updated dependencies [8cf3ea4]
- Updated dependencies [e15f389]
- Updated dependencies [ddd9e85]
  - @tallyui/core@3.0.0

## 3.0.0-next.2

### Minor Changes

- [#355](https://github.com/TallyUI/tallyui/pull/355) [`0e4c9cc`](https://github.com/TallyUI/tallyui/commit/0e4c9cc3f9cd329666bf3b565dd24614bafbb590) Thanks [@kilbot](https://github.com/kilbot)! - The "since" a cashier reads is a real time (#253). `OutboxState.stuck` (both outboxes) gains `firstFailedAt`: the wall-clock time the first failure of the current stuck run was answered, so an offline gap no longer moves it. `since` keeps its meaning, the clock's virtual start, and still drives the 15-minute threshold. `firstFailedAt` is kept in memory only. After a restart it is absent, and `SyncStatus` and `OrdersList` show the stored time instead, worded "since about 2:49 AM".

- [#357](https://github.com/TallyUI/tallyui/pull/357) [`6278d8d`](https://github.com/TallyUI/tallyui/commit/6278d8d44f36d4c7f8601f1222807e510662a576) Thanks [@kilbot](https://github.com/kilbot)! - The register outbox can start when its store opens, as the order outbox does (#290). The new `useRegisterOutbox({ commands, transport, deviceId, isEnabled?, onResult?, backendNotFound? })` runs `createRegisterOutbox` over an already-open `register_commands` collection, and calls `start()` so that till updates left pending (after a refused batch, for instance) go out when the app reopens. It returns `{ state, flush }`. A new collection or device id restarts the outbox, and `commands: null` leaves it idle. Apps that create the register outbox themselves should switch to this hook. `SyncStatus`'s till-updates refusal line now ends "…with the next till update, or when the app is reopened.", matching the sales line.

### Patch Changes

- [#359](https://github.com/TallyUI/tallyui/pull/359) [`eb203b4`](https://github.com/TallyUI/tallyui/commit/eb203b4489c58111f10011e825edeff671627ec3) Thanks [@kilbot](https://github.com/kilbot)! - Review follow-ups with no behaviour change (#356, #358):

  - `SyncStatus` and `OrdersList` build their "since {time}" and "since about {time}" text with one shared helper.
  - `useRegisterOutbox`'s docs now say when `transport()` is called, and that the latest `isEnabled` and `onResult` are used without restarting the outbox.

- [#351](https://github.com/TallyUI/tallyui/pull/351) [`c48e1dd`](https://github.com/TallyUI/tallyui/commit/c48e1dd808622191fb97104ecd58cc8cde7dde0d) Thanks [@kilbot](https://github.com/kilbot)! - Store settings follow-ups to #339 and #341 (#340):

  - **A signed-out till is asked to sign in**, not shown "Retrying…". When the capabilities read fails with an error only the till can fix, `useStoreSettings` gives `error` without `nextRetryAt` and doesn't retry by itself, so the app prompts. That covers a till-class error (a 401, or a till that needs updating) and a `SignInError` with `code: 'invalid_credentials'`; any other sign-in error still waits and retries. Every other failure still waits and retries.
  - **A `/tally/v1/info` JSON body that isn't an object** (`null`, an array or a scalar) is unknown, not the default rounding.

- Updated dependencies [[`c48e1dd`](https://github.com/TallyUI/tallyui/commit/c48e1dd808622191fb97104ecd58cc8cde7dde0d), [`3cf5452`](https://github.com/TallyUI/tallyui/commit/3cf5452ba0f6a2f25e88c230201d0e0e68e2e5b5)]:
  - @tallyui/core@3.0.0-next.2

## 3.0.0-next.1

### Minor Changes

- [#339](https://github.com/TallyUI/tallyui/pull/339) [`c26ead6`](https://github.com/TallyUI/tallyui/commit/c26ead66fd839d41d211f72f47079d408d7b975d) Thanks [@kilbot](https://github.com/kilbot)! - A till no longer sells on a guessed tax rounding. When the store's capabilities read fails (it throws, or answers "unknown", as Vendure's does for a network error or a 5xx), `useStoreSettings` keeps the settings unresolved instead of falling back to the default rounding. It retries by itself after 5 seconds, then 10, doubling to at most 5 minutes. While it waits, the state is `error` with a `nextRetryAt`, and an app shows "Can't reach the store's settings yet. Retrying…". Only a store that reports no rounding, or a connector without `capabilities`, gets the default. Before this, a failed read on a Vendure store set to `per_rate_group_items` meant every sale raised `figures_mismatch`.

- [#334](https://github.com/TallyUI/tallyui/pull/334) [`e15f389`](https://github.com/TallyUI/tallyui/commit/e15f389e077a535b06a65e00c3989e7a652d7990) Thanks [@kilbot](https://github.com/kilbot)! - The Vendure connector supplies its tax rate names, so a `per_rate_group_items` store groups a sale's tax the way Vendure does (#324). Apps no longer fetch the names themselves.

  - **`StoreSettings.taxRateCodes`** (core, optional): the backend's tax rate name per tax class, keyed like `taxRatesPpm`, including `default`.
  - **`vendureStoreSettings`** reads each rate's `name` in the tax-rate query it already runs, so no extra request is made. Only the rates `taxRatesPpm` uses count, and `default` follows the same default-category rule. `taxRateCodes` is left out when no names come back.
  - **`taxProviderProps(settings)`** passes `taxRateCodes` to `<TaxProvider>` as `rateCodes`.

### Patch Changes

- [#335](https://github.com/TallyUI/tallyui/pull/335) [`8cd7860`](https://github.com/TallyUI/tallyui/commit/8cd78603e7edd7dc237d55ec3bab7f7e950a3518) Thanks [@kilbot](https://github.com/kilbot)! - A sale the store refuses on its first send is sent once, not twice (found by the Medusa POS app's 3.0.0-next.0 adoption). Before it sends, the outbox stores the order's sent form and version (#300). That write had re-armed the flush, so a refused batch went out again. A write that only records the sent form, for a new sale or for an older one carried over by the pos_orders migrations, is no longer counted as new work. Any other change to a pending sale still sends it.

- Updated dependencies [[`7fee0c1`](https://github.com/TallyUI/tallyui/commit/7fee0c19d57eb45130549101e5dd32cf593fdeea), [`eb5a032`](https://github.com/TallyUI/tallyui/commit/eb5a0322fe11b55e9158fb3374be14a12ac6b78b), [`8cf3ea4`](https://github.com/TallyUI/tallyui/commit/8cf3ea4a442a67ff0b229a6498503fd8b65a2ae5), [`e15f389`](https://github.com/TallyUI/tallyui/commit/e15f389e077a535b06a65e00c3989e7a652d7990), [`ddd9e85`](https://github.com/TallyUI/tallyui/commit/ddd9e85008f43e780cc0ee3754463eb7aa819a2a)]:
  - @tallyui/core@3.0.0-next.1

## 3.0.0-next.0

### Major Changes

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

### Minor Changes

- [#205](https://github.com/TallyUI/tallyui/pull/205) [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4) Thanks [@kilbot](https://github.com/kilbot)! - Add useSale.setCustomer and ReceiptData.header.customer, customerTraits, CustomerPicker, generic CustomerSelect/CustomerCard with traits overrides, CustomerForm.showAddress, and the receipt's customer line.

  CustomerSelect rows are now pressable, so choosing a result works on the web (it previously did nothing).

- [#179](https://github.com/TallyUI/tallyui/pull/179) [`901fa66`](https://github.com/TallyUI/tallyui/commit/901fa666f4ab345bf07b2d6b38c6e5dc58596f39) Thanks [@kilbot](https://github.com/kilbot)! - Add `order.create` envelope version 3, its display and tax-rate wire types, and the payload's `sessionId` and customer reference.

  At capability 3, `finalizeOrder` copies the receipt's `display` and `taxByRate` into the sale. Version 3 sends those figures and the sale's session (stamped or late) as `sessionId`. Older orders keep their existing envelope version.

  Move `pos_orders` to schema version 3 with a `sessionId` index and the optional `sentVersion` and `downgradedFrom` fields (declared for the outbox's version fallback, not yet written). Apps must open `pos_orders` with `addPosOrderCollection`, which migrates it.

- [#291](https://github.com/TallyUI/tallyui/pull/291) [`bf2d805`](https://github.com/TallyUI/tallyui/commit/bf2d805334c83d4f20f408e185add336331de38e) Thanks [@kilbot](https://github.com/kilbot)! - `order.create` version 4 (#286): every `discountMinor`, the order's and each line's, is tax-exclusive, so their sum still holds. Core accepts version 4 with version 3's fields. The till's envelope builder (`toOrderCreateEnvelope`) produces version 4 when capped at 4 or more and the order's `sentVersion` doesn't hold it lower. The till doesn't send version 4 yet: the outbox doesn't pass the server's max, so it still sends version 3 or lower with the same figures, byte-identical.

- [#245](https://github.com/TallyUI/tallyui/pull/245) [`130d28e`](https://github.com/TallyUI/tallyui/commit/130d28e31c135fd94f2c30fb32897a5b20a56ab0) Thanks [@kilbot](https://github.com/kilbot)! - A store that keeps answering 404 is no longer silent. After 3 consecutive 404 answers the order and register outboxes set `OutboxState.backendMissing: { since }` (when the first of them arrived), and `SyncStatus` tells the cashier in plain words that sales aren't reaching the online store and are saved on the till, with a detail line for the store owner, instead of showing `retrying (status_404)`; the stuck line shows the same words, with no raw code. `SyncStatus` takes an optional `pluginName` (default `'the POS plugin'`) for that detail. The outboxes keep retrying on their normal backoff, and orders stay pending, so a 404 during a deploy blip recovers on its own. The next answer that isn't a 404 clears it; an offline (`network`) retry changes nothing.
  Pass one `createBackendNotFound()` tracker as `backendNotFound` to both `createOrderOutbox` and `createRegisterOutbox` so their 404s count together and the notice shows once, whichever outbox meets it first; without it, each outbox keeps its own.

- [#212](https://github.com/TallyUI/tallyui/pull/212) [`9e1032f`](https://github.com/TallyUI/tallyui/commit/9e1032ff041a723ca320fb6bbcd9dabcd58d5e0b) Thanks [@kilbot](https://github.com/kilbot)! - One order the store keeps failing no longer stops every later sale. After 5 server-answered failures (offline never counts) the order outbox probes the pending queue one order per backoff interval, oldest first; once the store takes one, the orders whose probes failed are isolated and retried alone, and batching resumes. If no probe gets through, the store is down: nothing is isolated. Retries alternate between the batch (or the probe) and one due isolated order, one request per interval, so neither can starve the other, and isolated orders take turns. An order the store has kept failing for 15 minutes of answered time, on its own clock, is flagged as stuck and stays pending: `OutboxState.stuck`, with a per-order entry in `stuck.orders`, `useOrderOutbox`'s `stuckCommandIds`, `needsAttention`'s `stuckCommandIds` option, `OrdersList`'s `stuck` prop (each order with its own time and reason), and `SyncStatus`'s "Not syncing" line. An offline failure pauses every clock, and the store's next answer of any kind resumes them all; a flagged order stays flagged through an offline spell, since a paused clock keeps its answered time. The HTTP transport now reports a request that got no answer in time as `timeout`, which counts like a 503 and never pauses a clock, and keeps `network` for a store it could not reach.

- [#182](https://github.com/TallyUI/tallyui/pull/182) [`ca0beac`](https://github.com/TallyUI/tallyui/commit/ca0beacdafb14f3b5cae7c7593de23ed82b0d2d5) Thanks [@kilbot](https://github.com/kilbot)! - Fall back to the server's supported order.create version while preserving stored fiscal figures and command IDs. Record the sent version and downgrade in the order audit, and expose command error details.

- [#223](https://github.com/TallyUI/tallyui/pull/223) [`a9cdfc0`](https://github.com/TallyUI/tallyui/commit/a9cdfc03369dace3495838608d4ac7ceeae2ae07) Thanks [@kilbot](https://github.com/kilbot)! - Migrate pos_orders to version 4 with optional localWarnings and serverFailures. Record omitted customer details and dropped payment references on the stored order, and show these warnings in the orders list; serverFailures is declared for the next outbox update.

- [#300](https://github.com/TallyUI/tallyui/pull/300) [`9ffa7c0`](https://github.com/TallyUI/tallyui/commit/9ffa7c0400664baba9667f0e4354631229cbc464) Thanks [@kilbot](https://github.com/kilbot)! - The till sends `order.create` version 4 (#286) to a server that advertises 4. Each order is resent at the version it first went out at: the outbox records `sentVersion` before an order's first send, so a retry after the store upgrades is byte-identical. With the server's max unknown, the till sends at most 3 and records that. `requeue()` clears `sentVersion` and `downgradedFrom`, since the new `commandId` chooses afresh.

  `pos_orders` moves to schema version 5: `sentVersion` and `downgradedFrom` accept 1 to 4, and the migration records each order without a `sentVersion` at its content version (3 with `display` and `taxByRate`, else 2 when discounted, else 1). Like version 4, this storage is one-way: an older build opens it but shows no orders (ADR-069).

- [#318](https://github.com/TallyUI/tallyui/pull/318) [`6bbd1ba`](https://github.com/TallyUI/tallyui/commit/6bbd1ba88fe1f01fe20c52728fce81f55813b75f) Thanks [@kilbot](https://github.com/kilbot)! - Each sale records the tax rounding its figures were computed with (#287): `finalizeOrder` writes `taxRounding` on the stored order, the default (`per_order`, `half_away_from_zero`) included, and `custom` as `{ granularity: 'custom' }`. It is the till's own record and is never sent in `order.create`. The Z report splits each sale's tax by rate with the strategy that sale recorded, so its rows are the receipts' rows, and its `breakdowns.tax_rounding_mixed` is `true` when a session's sales used more than one strategy (a `custom` sale counts as the default it applied); `ClosureSheet` then says so, and `buildClosureDocument` carries the same line ready to print as `closure.tax_rounding_note` (`TAX_ROUNDING_MIXED_NOTE`), for the apps' closure templates. `PosOrder.taxRounding` is now required in the type.

  `pos_orders` moves to schema version 6: `taxRounding` is required, and the migration records the default on every older sale, the only rounding any earlier build used. Like version 5, this storage is one-way: an older build opens it but shows no orders, so never roll an app back across it (ADR-069). Before 3.0.0 ships, #242's OPFS upgrade proof is rerun against version 6.

- [#188](https://github.com/TallyUI/tallyui/pull/188) [`222543b`](https://github.com/TallyUI/tallyui/commit/222543b8c9130d2c79a294603195940143bd611c) Thanks [@kilbot](https://github.com/kilbot)! - Add `RegisterCommandType`, `RegisterCommandEnvelope` and `AnyCommandEnvelope`, register payloads and results, and the register server capability. `CommandType` and `CommandEnvelope` are unchanged.

  Record the local `register_commands` ledger through `reconcileRegisterCommands`, gated in `useRegisterSession` by its new `commands` and `capabilities` options. Commands are recorded but not sent. Medusa reads the `register` contract.

- [#202](https://github.com/TallyUI/tallyui/pull/202) [`8141c1c`](https://github.com/TallyUI/tallyui/commit/8141c1cb1591a8b8299ffc00fe4f9a77a7cd8289) Thanks [@kilbot](https://github.com/kilbot)! - Guard register commands, movement reasons and register ids, exporting RegisterMovementReasonError and RegisterIdInvalidError. Harden register outbox result handling and batch limits.

  Make CommandBatchRequest generic while preserving its existing default envelope type.

- [#272](https://github.com/TallyUI/tallyui/pull/272) [`c9798a3`](https://github.com/TallyUI/tallyui/commit/c9798a334557a75495211f85edfdfaca68966667) Thanks [@kilbot](https://github.com/kilbot)! - The register outbox now sets `OutboxState.stuck` when the store has kept failing a sent register command for 15 minutes of answered time (`STUCK_AFTER_MS`, shared with the order outbox; offline gaps pause the clock), so the app can say since when till updates haven't reached the online store. The clock clears when the command is applied or rejected. It is kept in memory only: a restart starts it afresh.

- [#201](https://github.com/TallyUI/tallyui/pull/201) [`581472f`](https://github.com/TallyUI/tallyui/commit/581472f659593568b98e50d91ad7c150478567b6) Thanks [@kilbot](https://github.com/kilbot)! - Add createRegisterOutbox to send stored register commands serially per register. The app starts it only for a store with the register capability.

- [#289](https://github.com/TallyUI/tallyui/pull/289) [`a94b255`](https://github.com/TallyUI/tallyui/commit/a94b255f52b83c94639a6152ac8401b0edb02d98) Thanks [@kilbot](https://github.com/kilbot)! - `OutboxState` gains `rejected?: number`: the order outbox publishes the count of `pos_orders` the store refused (`syncStatus: 'rejected'`) wherever it publishes `pending`, so it rises when a batch result rejects an order and falls when `requeue()` sends one again. The register outbox leaves it unset. While `rejected` is above 0, `SyncStatus` never says "Sales are up to date.": its whole status line (label, polite live region and iOS announcement) is "1 sale needs attention · The online store refused it. Ask the store owner to look at the till's sync log." or "{n} sales need attention · The online store refused them. Ask the store owner to look at the till's sync log.", in place of the stuck and backend-missing sentences and the sending or retrying line. What else waits stays in the count: "1 sale needs attention, 5 waiting to sync · …" with other sales pending, "…, 2 till updates waiting to sync · …" with till updates, and "…, 5 sales and 2 till updates waiting to sync · …" with both. Below it, "Refused sales stay on this till under Needs attention, each with what to do next.", then the backend-missing detail when the store is missing. With `rejected` 0 or unset, nothing changes. When the store refused a whole batch (`refused` set, no sale carrying a code), the status line is the waiting count followed by " · The online store refused the last send. This till will try again with the next sale, or when the app is reopened." in place of the stuck or backend-missing sentence, and the sending or retrying line (which read "Retrying in 0 s.") is hidden; refused sales still outrank it. With only till updates waiting and the register outbox refused, it ends "…try again with the next till update." instead; with a sale waiting, the sales line wins.

- [#309](https://github.com/TallyUI/tallyui/pull/309) [`5ed6281`](https://github.com/TallyUI/tallyui/commit/5ed62816fe28a3ef3b001600b9d6a08de22d4a7e) Thanks [@kilbot](https://github.com/kilbot)! - The till computes tax with the store's rounding strategy (#287, ADR-071). `ServerCapabilities` gains `taxRounding` (core exports `TaxRounding`): `per_order`, `per_line_items` or `per_rate_group_items`, each with `half_away_from_zero` or `half_up`, or `custom`. Absent, and `custom`, mean today's `per_order` with half away from zero. `TaxProvider` takes `rounding` and `rateCodes` (tax class → the backend's rate name, for `per_rate_group_items`); the order records the strategy as `taxRounding`, and `taxLinesByRate` takes it as a fourth argument. The algorithms are in `docs/contract/field-kinds.md`.

- [#326](https://github.com/TallyUI/tallyui/pull/326) [`5a204a9`](https://github.com/TallyUI/tallyui/commit/5a204a949e33f53d6087845d59e4bab1fe4a1474) Thanks [@kilbot](https://github.com/kilbot)! - `StoreSettings` gains a derived `taxRounding`. `useStoreSettings` fills it from the context's capabilities, or else from one read of the connector's `capabilities()` made before the settings are ready, so each sign-in emits the settings once with the rounding known and no later change holds a sale; a failed read or a connector without `capabilities` gives the default rounding. `taxProviderProps` passes it to `TaxProvider` as `rounding`, so the till rounds tax like the store with no app code (#324). `custom` passes no rounding, and an explicit `rounding` prop still wins.

### Patch Changes

- [#225](https://github.com/TallyUI/tallyui/pull/225) [`d6a5073`](https://github.com/TallyUI/tallyui/commit/d6a5073ad5792bce70238e2505c8cf766c8037bb) Thanks [@kilbot](https://github.com/kilbot)! - **The outbox freezes an order an older till stored before it first sends it** (`freezeSentForm`, which `finalizeOrder` uses too):

  - line names, discount labels and payment references are cut to 255 characters, but ids never are;
  - a customer email or id that `order.create` would refuse is left out;
  - the frozen form is written back, so the receipt and the store see the same bytes.

  So an order stored before the upgrade and still unsent is never refused as `invalid_payload`.

  **New type:** `SentOrder`, an `Order` whose customer id may be missing. The receipt stage, `buildReceiptData` and `Receipt` take it, and a plain `Order` still fits.

- [#207](https://github.com/TallyUI/tallyui/pull/207) [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1) Thanks [@kilbot](https://github.com/kilbot)! - `CommandWarning` gains `bridgeMinor` on `total_mismatch` and a new `tax_rate_mismatch` code, and the till now ignores warning codes it doesn't know (`knownWarnings`), instead of showing them as a store total.

- [#292](https://github.com/TallyUI/tallyui/pull/292) [`e59ebec`](https://github.com/TallyUI/tallyui/commit/e59ebecfc580bc5bca706c8e37fc825281a88cef) Thanks [@kilbot](https://github.com/kilbot)! - Each line is taxed at its product's tax class, not the store's default (#288). `ProductTraits` gains an optional `getTaxClass(doc, variantId?)`, the backend's tax class id, a key of `StoreSettings.taxRatesPpm`. `addProduct` and `addEntryToCart` pass it to `addLine` through the new `AddLineInput.taxClass`, which the tax context resolves; a connector without the accessor is unchanged (the default rate). `TaxProvider` taxes a class with no rate at the default rate and warns once per class through the new `taxLogger`. connector-vendure replicates each variant's `taxCategory { id }` and implements the accessor, and its store settings give every tax category with no enabled rate in the default zone an explicit 0 rate, as Vendure charges; its product schema goes to version 2, so the products collection is dropped and downloaded again on the first sync after the upgrade.

- [#224](https://github.com/TallyUI/tallyui/pull/224) [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f) Thanks [@kilbot](https://github.com/kilbot)! - The order.create string lengths move from `payloadShapeErrors` to the new `payloadBoundErrors`, which `precheckCommand` calls after the replay lookup, so an applied order resent with a long title replays as `duplicate`; `payloadShapeErrors` keeps the types, the `customerId` and `sessionId` bounds and the NUL check. `useSale` applies a tender before logging a dropped reference, and `add()` refuses a product whose id or v3 tax code finalize would refuse; the tender's reference field caps at 255 characters. `finalizeOrder` now freezes the sent form (names and discount labels cut, an unsendable customer email or id left out) and `toOrderCreateEnvelope` sends the stored order unchanged, so every resend is byte-identical.

- [#222](https://github.com/TallyUI/tallyui/pull/222) [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8) Thanks [@kilbot](https://github.com/kilbot)! - The shared order.create shape check bounds string lengths and refuses NUL, and so does the v3 fiscal-figures check for its display and tax-code strings. The till cuts long names when it stores the order, refuses over-long pass-through references at finalize (and a payment reference as it's entered), refuses a searched or parked customer whose email or id the server would refuse, and validates the customer email at entry. Tills should ship this clamp before plugins adopt the new bounds, so no till sends a sale the server would now refuse.

- [#186](https://github.com/TallyUI/tallyui/pull/186) [`d225c58`](https://github.com/TallyUI/tallyui/commit/d225c5819954f7c3e91e0c9180cb634530304061) Thanks [@kilbot](https://github.com/kilbot)! - Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.

- [#223](https://github.com/TallyUI/tallyui/pull/223) [`d329193`](https://github.com/TallyUI/tallyui/commit/d3291935ba99dcdea00134157604404790bbecdb) Thanks [@kilbot](https://github.com/kilbot)! - The order outbox stores each pending order's stuck clock and isolation in `serverFailures` and restores them when it starts, so after a restart an order the store keeps refusing no longer holds up the other sales, and its stuck flag keeps its start time.

- [#314](https://github.com/TallyUI/tallyui/pull/314) [`c00e1ea`](https://github.com/TallyUI/tallyui/commit/c00e1ea553060e70c1ebcc16ab63f7793adab034) Thanks [@kilbot](https://github.com/kilbot)! - `OrdersList` shows a rejected sale's refusal in the cashier's words, one sentence per error code (#269), in both Needs attention and Recent, and never the store's own message. An unknown code, or a rejected sale with no error, shows `platform_error`'s sentence: "The online store refused this sale. Ask the store owner to look at the till's sync log." An `idempotency_mismatch` shows its sentence ("… Don't send it again; ask the store owner to compare the two.") in place of the old "This sale needs checking against the store before it can be sent again." line, and still has no Retry. The order outbox logs every refusal once to the sync log as "Order refused by the store" with the order id, the code and the store's message: a warning, or an error for `unsupported_version` (whose log previously used the message itself as its text).

- [#277](https://github.com/TallyUI/tallyui/pull/277) [`8ae3c53`](https://github.com/TallyUI/tallyui/commit/8ae3c53e0af89cf38ad8208362d75b08ae007093) Thanks [@kilbot](https://github.com/kilbot)! - A register session transition's ledger key now includes its status (`session.transition:<sessionId>:<status>:<at>`), so a close in the same millisecond as the count before it is queued with its `counted`, `closedBy` and `approvedBy` instead of being skipped (#258).

- [#203](https://github.com/TallyUI/tallyui/pull/203) [`9885075`](https://github.com/TallyUI/tallyui/commit/98850759e9531a13b004a6be7be1115392f46a1d) Thanks [@kilbot](https://github.com/kilbot)! - Match variant barcodes and SKUs in product search, and skip disabled Vendure variants when reading the product barcode.

- [#263](https://github.com/TallyUI/tallyui/pull/263) [`df80ead`](https://github.com/TallyUI/tallyui/commit/df80ead050072de985582e44c1a01c10d8ea9acd) Thanks [@kilbot](https://github.com/kilbot)! - `SyncStatus` takes an optional `registerState` (the register outbox's state): waiting till updates are counted ("1 till update waiting to sync", or named beside the sales), so it never says the sales are up to date while any wait, and with no sale waiting the backend-missing sentence says till updates aren't reaching the online store, or, once `registerState.stuck` is set, "Till updates haven't reached the online store since {time}. …". The backend-missing detail now reads "This till couldn't find {pluginName} on the online store. …". With nothing waiting, the line is only "Sales are up to date." (it replaces "All sales synced"), with no sending, retrying or problem text after it; if the store is missing, the detail reads "This till couldn't find {pluginName} on the online store the last time it checked. …". The status line's accessibility label is the whole visible line instead of "Sync status". The order and register outboxes let go of a shared `backendNotFound` tracker on `stop()` and take it up again on `start()` or `flush()`.

- [#303](https://github.com/TallyUI/tallyui/pull/303) [`37aad35`](https://github.com/TallyUI/tallyui/commit/37aad3527391b99b50515386bc76a569ee13460a) Thanks [@kilbot](https://github.com/kilbot)! - `useSale` never drops a line tapped while new store settings land (#301). The new sale that new tax settings or currency start on an idle cart now begins in a layout effect, inside the commit that brings those settings, and only when the sale is idle at that moment (no line, cart stage, no save in flight or pending), not as of the last render. Every sale change reads the current order builder, so a call from an older render never reaches a builder that `newSale()` has replaced. A line tapped once the new settings have committed lands on the new sale, priced with the new settings; a line that reaches the sale before its new sale starts keeps that sale, on its old settings.

- [#185](https://github.com/TallyUI/tallyui/pull/185) [`4122dc8`](https://github.com/TallyUI/tallyui/commit/4122dc8e1bbe97a62af35c93fed9d72a1067705f) Thanks [@kilbot](https://github.com/kilbot)! - order.create v3 omits a malformed session ID (empty or longer than 36 characters) instead of sending it, so the plugin never refuses the sale for it. At capability 3, `finalizeOrder` refuses a sale whose display lines don't join the order's lines by id and count, or whose display tax mode differs from the order's.

- Updated dependencies [[`4de75c2`](https://github.com/TallyUI/tallyui/commit/4de75c2e844d53fdbccd40c4ad4d4004a0641f57), [`894b6ae`](https://github.com/TallyUI/tallyui/commit/894b6aec27fcc157e65e68fee1f8134ef201712f), [`04905ef`](https://github.com/TallyUI/tallyui/commit/04905efd0c23a77159ce0682ed34df4567896bf0), [`faa7cda`](https://github.com/TallyUI/tallyui/commit/faa7cda925c6ca52e47357bd09d920813051c62b), [`9f34416`](https://github.com/TallyUI/tallyui/commit/9f34416619db35733ef85d98b225be5c046d12d5), [`fb57e1d`](https://github.com/TallyUI/tallyui/commit/fb57e1d8d97c3e03603a3bcc49470ce73bdb3b6d), [`898e98b`](https://github.com/TallyUI/tallyui/commit/898e98ba31387bbece8b79c5c0cc50d27f8cd3af), [`75c5dce`](https://github.com/TallyUI/tallyui/commit/75c5dced41a1c99da03614304fc87adad4bc684c), [`ba63f04`](https://github.com/TallyUI/tallyui/commit/ba63f04ef725774ec762a34a619534abb3bf2339), [`0d04d13`](https://github.com/TallyUI/tallyui/commit/0d04d13eff8a3bf7aed7cf747464e145a74dea35), [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4), [`24b74fd`](https://github.com/TallyUI/tallyui/commit/24b74fdfe39198c124cac707c31106affd7cc93b), [`54ee98a`](https://github.com/TallyUI/tallyui/commit/54ee98a583d5543538fb0641aa322a87e5f8cfaf), [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1), [`e59ebec`](https://github.com/TallyUI/tallyui/commit/e59ebecfc580bc5bca706c8e37fc825281a88cef), [`2ecaa36`](https://github.com/TallyUI/tallyui/commit/2ecaa3661eae0ad8ec5d0ce3a344dc24262f387b), [`901fa66`](https://github.com/TallyUI/tallyui/commit/901fa666f4ab345bf07b2d6b38c6e5dc58596f39), [`bf2d805`](https://github.com/TallyUI/tallyui/commit/bf2d805334c83d4f20f408e185add336331de38e), [`ca0beac`](https://github.com/TallyUI/tallyui/commit/ca0beacdafb14f3b5cae7c7593de23ed82b0d2d5), [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f), [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8), [`5c90aed`](https://github.com/TallyUI/tallyui/commit/5c90aed083d8245e12a645aafa9c9e6a3e7bbc61), [`668f71f`](https://github.com/TallyUI/tallyui/commit/668f71f6cf06af4a41fe686e98546f25e2e191ee), [`457162d`](https://github.com/TallyUI/tallyui/commit/457162d04dcd3c6f588cdb6ab90efea36081f4df), [`222543b`](https://github.com/TallyUI/tallyui/commit/222543b8c9130d2c79a294603195940143bd611c), [`8141c1c`](https://github.com/TallyUI/tallyui/commit/8141c1cb1591a8b8299ffc00fe4f9a77a7cd8289), [`ce4f796`](https://github.com/TallyUI/tallyui/commit/ce4f796aff7c739cb555b61f9a167cc803d8b5c2), [`6673faf`](https://github.com/TallyUI/tallyui/commit/6673fafcc682e825c94cfc66932da07cabd24e35), [`1f4d0ab`](https://github.com/TallyUI/tallyui/commit/1f4d0ab8006f41586740195831aaa0c9adc17f15), [`5ed6281`](https://github.com/TallyUI/tallyui/commit/5ed62816fe28a3ef3b001600b9d6a08de22d4a7e), [`5a204a9`](https://github.com/TallyUI/tallyui/commit/5a204a949e33f53d6087845d59e4bab1fe4a1474), [`7d1bc98`](https://github.com/TallyUI/tallyui/commit/7d1bc98b842258d67f6d5d380bc925e16e649ca2)]:
  - @tallyui/core@3.0.0-next.0

## 2.0.0

### Major Changes

- [#24](https://github.com/TallyUI/tallyui/pull/24) [`e7b2fa5`](https://github.com/TallyUI/tallyui/commit/e7b2fa5e08d4df3a7a8103d536771c1f4341dbb1) Thanks [@kilbot](https://github.com/kilbot)! - **Breaking:** removes the floating-point money and rate paths.
  - `calculateTax`, `extractTax`, `addTax`, `TaxResult` and `formatCurrency` are deleted. Use the exact tax API (`computeOrderTax`, `taxMicros`) and `formatMoney`.
  - `TaxContext.getTaxRate()`, which returned a fraction, is replaced by `getTaxRatePpm()`, which returns integer parts per million.
  - `TaxProvider` takes `ratesPpm` and validates it.
  - `useCurrencyFormatter()` now formats `Money`, and `useCurrencyCode()` is added.

### Minor Changes

- [#168](https://github.com/TallyUI/tallyui/pull/168) [`670d3b8`](https://github.com/TallyUI/tallyui/commit/670d3b89c4f139276d3c902705e1eb04bdc959c6) Thanks [@kilbot](https://github.com/kilbot)! - The register approval gate is enforced in `useRegisterSession`'s `closeSession`, not only in `RegisterCount`: over `varianceThreshold`, a close without `approvedBy` throws the new `RegisterApprovalRequiredError` before any write, blind mode included. `closeSession` takes `approvedBy` and `approvedByName`, and they reach the Z (`breakdowns.approved_by`, `approved_by_name`); the store's `closeSession` takes `approvedBy`. `useRegisterSession`'s `register` option accepts `null` while its host opens. `closeNeedsApproval` is the shared "over threshold" rule. `RegisterCount` passes `approve()`'s `approvedBy` and `approvedByName` to `closeSession`, and shows the hook's refusal with the same copy.

- [#175](https://github.com/TallyUI/tallyui/pull/175) [`a9b77fe`](https://github.com/TallyUI/tallyui/commit/a9b77fe4b512cf7820ccbd07898408e1e8a59cc6) Thanks [@kilbot](https://github.com/kilbot)! - One close in flight per register. `useRegisterSession`'s `closeSession` joins a close already running for the same register, in any hook instance, and returns its closure (the joining call's `counted`, `approvedBy` and `approvedByName` are ignored), so a tap during a close no longer starts a second, overlapping one. The hook returns a new `closing` flag, true while that close is in flight. `RegisterColumn` keeps the count slot up while closing instead of flashing the Finish-closing card, whose button now has `nativeID="register-column-finish-close-button"`. `describeRegisterBarPill` takes `closing` and returns the new `'Close not finished'` pill for a closed session that isn't closing, right after 'Choose a register' and ahead of 'Offline'; `RegisterBar` passes `register.closing`.

- [#149](https://github.com/TallyUI/tallyui/pull/149) [`1e2ee56`](https://github.com/TallyUI/tallyui/commit/1e2ee56248d1aee2287fa9af48845e35cafdacac) Thanks [@kilbot](https://github.com/kilbot)! - A failed save can now end in Continue once its order is confirmed stored. `useOrderOutbox` gains `isStored(order)`, and `record` now treats an order stored with the same `id` and money-bearing content (`sameSale`, new) as stored whatever its `commandId`, so a Retry after a requeue no longer fails forever; other content throws the new `OrderContentMismatchError`. `useSale` takes an optional `isStored` and exposes `canContinue` and `continueSale()`; `Tender` renders Continue when `canContinue` is true. `newSale()` is now refused while a failed or running save's order isn't confirmed stored; a refusal during a running save asks `isStored` again, so a hung save whose order is stored can still Continue. A confirmed order is never handed to `onSaleCompleted` again (#147's background re-hand is gone). `saleLogger` and `outboxLogger` are now exported.

- [#115](https://github.com/TallyUI/tallyui/pull/115) [`4df9be4`](https://github.com/TallyUI/tallyui/commit/4df9be400debddb67859482c17f9e68dadbf46d1) Thanks [@kilbot](https://github.com/kilbot)! - Discounts are pre-tax (ADR-062). An order discount is allocated across the lines in proportion to their own-mode amounts (the new `allocateOrderDiscount`, largest-remainder rounding), each line carries its share in `orderDiscountMinor` and is taxed after it, so an order discount now lowers the tax instead of coming off the total after tax. A discounted `order.create` is version 2, with `discountMinor` on each discounted line and on the payload; a discount-free payload stays version 1, byte-identical. `finalize` still rejects discounts until the plugins honour version 2. Receipt lines show their `discountMinor`. Stacked percentage order discounts are additive, each computed on the pre-order-discount base rather than compounding on what an earlier discount leaves, and every discount (line or order, percentage or fixed) is clamped to 0 so a negative value can never raise a price.

- [#132](https://github.com/TallyUI/tallyui/pull/132) [`7c69fce`](https://github.com/TallyUI/tallyui/commit/7c69fce5ed409b4e6ee0b8693ef49382658574c5) Thanks [@kilbot](https://github.com/kilbot)! - `order.display` gains `lines` and `orderDiscountMinor` (ADR-063). Each line shows its amount before any discount, with its own discounts as sub-rows, all in the display mode. The order discounts appear as one row, not allocated to the lines. Every discount row is its own-mode amount converted on its own, so it's exact. `display.subtotalMinor` is now derived from the total and the discount rows, so `Σ lines === subtotalMinor` and `Σ sub-rows + orderDiscountMinor === discountMinor` hold exactly. Single-mode carts show the same figures as before; mixed-mode carts can shift by about a cent, carried by the last converted line's amount.

  `ReceiptLineItem` gains `displayAmountMinor` and `displayDiscounts`, and `ReceiptData` gains `orderDiscountMinor`. Print these above the subtotal. `lineTotalMinor` is unchanged: it's after every discount and is kept for existing readers.

  `CartTotal` now orders its rows Subtotal / Discount / Tax / Total, matching the receipt, and takes an optional `taxInclusive`, which labels the tax rows "incl." instead of adding them.

- [#127](https://github.com/TallyUI/tallyui/pull/127) [`2a0ca7f`](https://github.com/TallyUI/tallyui/commit/2a0ca7fe2d56d618d2a33b46704ffa2811a761bc) Thanks [@kilbot](https://github.com/kilbot)! - `Order` gains `display: DisplayTotals` (ADR-063): the cart's subtotal before discounts, the discount, the tax and the total in the store's display mode, which add up on screen even in a mixed-mode cart. The settlement figures (`subtotalMinor`, `discountMinor`, `taxMinor`, `totalMinor`) and the `order.create` payload are unchanged; `display` is never sent to the server; a parked draft may carry it, but it is recomputed on resume.

- [#163](https://github.com/TallyUI/tallyui/pull/163) [`714b4bd`](https://github.com/TallyUI/tallyui/commit/714b4bd3f478fc89c7bbf5c455a88d307c53ef2d) Thanks [@kilbot](https://github.com/kilbot)! - `useSale`'s hung-save check guard is now scoped per completion instead of a shared boolean: a sale whose `isStored` never settles can no longer block a later sale's own hung-save poll from ever confirming and offering Continue (medusapos's #85 review).

  `useOrderOutbox`'s `isStored` now logs "A stored order has this id with different content" at most once per order id for the hook's lifetime, instead of on every 5 s poll of a hung save.

  `useOrderOutbox` also exposes `savesInFlight: number`, the count of `record()` calls not yet settled, so an app can hold sign-out while a save is in flight.

- [#161](https://github.com/TallyUI/tallyui/pull/161) [`f4a4d74`](https://github.com/TallyUI/tallyui/commit/f4a4d74d153f28bd2fdf46bb70984885e0b24166) Thanks [@kilbot](https://github.com/kilbot)! - A hung save — one whose order is built and whose save neither resolves nor throws — now re-asks `isStored` by itself every 5 s while it stays unconfirmed, so `useSale` sets `canContinue` and `Tender` can offer Continue with no user action. This covers an app whose tender has no New sale control while saving (medusapos), which never triggered the existing refused-`newSale()` check. The poll clears when the save settles, on confirmation, on `newSale()`/`continueSale()` and on unmount; at most one runs at a time. `SALE_SAVING` is now exported from `@tallyui/pos`.

- [#142](https://github.com/TallyUI/tallyui/pull/142) [`60a2218`](https://github.com/TallyUI/tallyui/commit/60a2218b26953397eeb46abb4c38a3a37c9ae1b2) Thanks [@kilbot](https://github.com/kilbot)! - Lifted medusapos's neutral outbox core so every platform POS records and sends sales the same way (ADR-052, TV7). `@tallyui/pos` gains `getDeviceId(storage, key)`, which keeps a UUIDv7 device id in web storage under the given key and falls back to one id per process; `needsAttention(orders)`, which picks rejected and applied-with-warnings orders, newest first; and `useOrderOutbox({ storeKey, open, transport, deviceId, onBusy?, onOpenError? })`, which opens the order store for `storeKey`, runs its outbox and returns `{ orders, state, recent, record, flush, requeue }`. `@tallyui/components` gains `OrdersList`, the "Needs attention" and "Recent" orders with a Retry button, taking `orders`, `onRetry`, an optional `formatDate` (default `Intl.DateTimeFormat`) and an optional `footer`. `needsAttention` joins the pure-function allow-list components may import from `@tallyui/pos` (ADR-064).

- [#138](https://github.com/TallyUI/tallyui/pull/138) [`f09dbbc`](https://github.com/TallyUI/tallyui/commit/f09dbbcbb111d93b30b3cf7bc49b558b521845cf) Thanks [@kilbot](https://github.com/kilbot)! - `@tallyui/pos` gains `useSale`, `addEntryToCart`/`CartError` and `catalogueEntries`/`findEntryByCode`/`variantPriceLabel` (ADR-052, TV5), lifted from medusapos/app `a1b981d`'s `use-sale`, `lib/cart` and `lib/catalogue` with the same behaviour. `useSale` takes an optional `session`, and stamps a completed sale with `stampSession` before `onSaleCompleted`; without it, behaviour is unchanged.

- [#151](https://github.com/TallyUI/tallyui/pull/151) [`c664d4b`](https://github.com/TallyUI/tallyui/commit/c664d4b9145dc3b84f46e1026d0235a1e36aea39) Thanks [@kilbot](https://github.com/kilbot)! - New export `watchFresh(collection, query)`: a live list on `readFresh` instead of a cached
  `find().$`, so a write during a query's storage read (RxDB 16.21.1 bug 4) still shows up once its
  change event arrives. `useRegisterSession` and `useOrderOutbox`'s recent list now use it.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a) Thanks [@kilbot](https://github.com/kilbot)! - Build the product components on the neutral traits. `ProductPrice` resolves the price list and formats it with Intl in the price's own currency (new `currency` and `locale` props; `currencySymbol` is now only the fallback for an unknown currency). `ProductStockBadge` reads `getStock`. `ProductImage` gains `showPlaceholder`, an initial tile for products without images. Core adds `formatMoney`, a `traitContext` prop on `ConnectorProvider` for store-level facts like the store currency, and `useTraitContext`. `@tallyui/pos` adds `searchProducts`, name/SKU/barcode search through traits that works the same on every backend.

- [#120](https://github.com/TallyUI/tallyui/pull/120) [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764) Thanks [@kilbot](https://github.com/kilbot)! - A per-store `order.create` capability check replaces the global discount guard (ADR-062). `@tallyui/core` gains `ServerCapabilities`, `SignInResult.capabilities`, `SyncContext.capabilities`, `TallyConnector.capabilities?()` and `resolveCapabilities(fresh, stored)`. `@tallyui/connector-medusa` reads the store's supported `order.create` versions from `GET /tally/v1/info`: a 404 or a malformed response means an old plugin (version 1), a network failure or a 5xx is unknown and keeps the last known value, and a 401 throws. `medusaSignIn` returns the read capabilities, and both Medusa connectors expose `capabilities(context)` for a restored session. `finalizeOrder` in `@tallyui/pos` now rejects a discount only when the store's capability is below 2, so a store whose plugin has caught up finalizes a discounted order as `order.create` version 2.

- [#17](https://github.com/TallyUI/tallyui/pull/17) [`47b9b4e`](https://github.com/TallyUI/tallyui/commit/47b9b4ed8da17be7f3494e82abcf00c590728769) Thanks [@kilbot](https://github.com/kilbot)! - Adds an exact, integer-only tax API: `ratePpmFromPercent`, `taxMicros`, `roundMicrosToMinor` and `computeOrderTax`. Line tax is kept exactly in micro-minor-units (as a `bigint`) and rounded once, half away from zero, at the order total. This matches Medusa, which keeps line tax unrounded and rounds only at payment. The existing float tax functions are unchanged for now.

- [#21](https://github.com/TallyUI/tallyui/pull/21) [`64cb5e0`](https://github.com/TallyUI/tallyui/commit/64cb5e0f7a8ff263dffa4a685d326040826415c9) Thanks [@kilbot](https://github.com/kilbot)! - Adds the `PosOrder` document, the neutral record of a completed sale. `finalizeOrder` turns a fully paid builder `Order` into a pending `PosOrder`: UUIDv7 ids, cash change allocated so that payments reconcile to the total exactly, and a refusal of discounted orders until the command contract supports discounts. `toOrderCreateEnvelope` maps it to the TallyUI Sync Protocol `order.create` command, `posOrderSchema` stores it in a `pos_orders` RxDB collection, and `uuidv7` generates RFC 9562 ids.

- [#20](https://github.com/TallyUI/tallyui/pull/20) [`98ea990`](https://github.com/TallyUI/tallyui/commit/98ea99035693bd9a7b502ec79e64610c6ea7b765) Thanks [@kilbot](https://github.com/kilbot)! - **Breaking (pre-1.0):** the order model now uses integer minor units throughout. `Order`, `LineItem`, `Payment`, discounts and `ReceiptData` money fields carry a `Minor` suffix (`totalMinor`, `unitPriceMinor`, `amountMinor`, ...). Tax is exact and rounded once per order (the `tax/exact` API). Lines carry stacked `taxLines`. The receipt's per-rate tax lines always sum to the charged tax (largest remainder). `addProduct` prices from `getPrices` and `resolvePrice` rather than the deprecated `getPrice`. The new `addLine` adds a specific variant at a given price with optional tax rates. Parked orders resume through `addLine`, with no synthetic traits.

- [#22](https://github.com/TallyUI/tallyui/pull/22) [`55d52fa`](https://github.com/TallyUI/tallyui/commit/55d52fa73ce283a119d850a1d8858e066a7758ac) Thanks [@kilbot](https://github.com/kilbot)! - Adds the order outbox. `createOrderOutbox` sends pending `PosOrder` documents from the `pos_orders` collection through the TallyUI Sync Protocol, in batches of up to 10. It applies each result (`applied`, `duplicate` or `rejected`) with guarded patches and never drops a sale: transport failures and responses that make no progress retry forever, with jittered exponential backoff. `createHttpCommandTransport` posts to `/tally/v1/commands` with the protocol header, and classifies every non-200 or malformed reply as retryable.

- [#131](https://github.com/TallyUI/tallyui/pull/131) [`fbcaf59`](https://github.com/TallyUI/tallyui/commit/fbcaf59e067d7a66c81cdcbc900b6ef740063254) Thanks [@kilbot](https://github.com/kilbot)! - `addPosOrderCollection(db)` is now the way to open `pos_orders`. It resolves only once every version-0 order has migrated, and on DM4 it rejects after the migration has stopped, keeping every order. RxDB's own open path could report the collection ready before orders written after a rollback had moved, and after a DM4 it rejected at once while the migration carried on, so on SQLite a close could interrupt it on every open.

- [#144](https://github.com/TallyUI/tallyui/pull/144) [`e692c40`](https://github.com/TallyUI/tallyui/commit/e692c40ec78afbf2cd2ede633568206366dab1bc) Thanks [@kilbot](https://github.com/kilbot)! - `pos_orders` goes to schema version 2 (ADR-032, ADR-065). It adds three optional fields: `lateSessionId`, and ADR-065's `display` and `taxByRate`, which nothing writes yet. Apps must adopt this release's `addPosOrderCollection`, which migrates `pos_orders` to version 2 from version 0 or 1 without dropping an order.

  A sale whose session refuses the stamp in `useSale().complete()` (the session closed or went missing) is no longer stopped, because the money has been taken. It goes on to `onSaleCompleted` and the receipt with `lateSessionId` set and no `sessionId`, so no closure counts it, and a `late-sale` register fact is recorded. `needsAttention` now also selects any order with `lateSessionId`, and `OrdersList` explains it: "Taken after the register closed. It is not in that register's closure."

- [#39](https://github.com/TallyUI/tallyui/pull/39) [`f2f386c`](https://github.com/TallyUI/tallyui/commit/f2f386cd14344536c0cef054ce93642f7bd43fe0) Thanks [@kilbot](https://github.com/kilbot)! - The command outbox no longer retries every HTTP error forever. After 3 consecutive 401s it pauses and sets `authRequired` in its state so the app can ask the cashier to sign in, then resumes on the next `flush()`. A permanent refusal of a whole batch (400, 403, 413, 415, 422) changes no order: sending pauses with `refused: { status, reason }` in the state until the next `flush()`. `requeue(orderIds?)` moves rejected orders back to pending with a new commandId, except those rejected with `idempotency_mismatch`, which are left for reconciliation. `TransportOutcome` gains `unauthorized` and `refused` kinds.

- [#94](https://github.com/TallyUI/tallyui/pull/94) [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be) Thanks [@kilbot](https://github.com/kilbot)! - `resolvePrice` keeps a price's `taxInclusive` flag on `current` and `was`. Each order-builder line keeps its price's own tax mode (`LineItem.taxInclusive`, plus `priceTaxModeConverted` when it differs from the store's `pricesIncludeTax`), so a customer pays exactly the shelf price and an inclusive price in an exclusive store is no longer taxed twice. Orders whose prices carry no flag, or one that agrees with the store, total exactly as before. The receipt shows a converted line in the order's mode, by its share of the order's once-rounded tax, so the lines still add up.

  In priced mode, the Medusa traits' deprecated `getPrice` and `getRegularPrice` return the resolved calculated price instead of the admin prices, and `isSellable` is false when no variant yields a price (for example a `calculated_price` with null amounts).

- [#130](https://github.com/TallyUI/tallyui/pull/130) [`516850f`](https://github.com/TallyUI/tallyui/commit/516850fc9674f6f8fdcee262a5fb3862b444e78a) Thanks [@kilbot](https://github.com/kilbot)! - `ReceiptData.totals` now comes from `order.display` (ADR-063), not the settlement fields: `subtotalMinor` is before discounts and `discountMinor` is every discount, both in the store's display mode, and a new `taxInclusive` flag says whether the tax is added or already included. `taxMinor` and `totalMinor` are unchanged in value. This is a behaviour change for anything that reads `ReceiptData.totals`: the receipt's invariant is now `Σ lineTotalMinor === totals.subtotalMinor − totals.discountMinor`, plus `+ totals.taxMinor === totals.totalMinor` when exclusive, or `=== totals.totalMinor` when inclusive. Receipt lines and each line's own discount row are unchanged, still in the line's own mode.

- [#125](https://github.com/TallyUI/tallyui/pull/125) [`0988fc3`](https://github.com/TallyUI/tallyui/commit/0988fc3c0ea9ffd6cff2f981110982db8004fe2d) Thanks [@kilbot](https://github.com/kilbot)! - Adds the register closure's pure report maths (ADR-032, registers job b1), ported from WCPOS `next` at `3b5331b5c`: settled figures after corrections (`deriveSettled`, `Correction`, `RecordedFigures`), a CSV export of the shown closures (`exportCsv`), the offline document label keys (`labelKeys`), and the closures list's scope clamp and row selector (`clampClosureScope`, `selectClosureRows`, `ClosureScope`). Money is a2's integer minor units throughout, and `clampClosureScope`'s history window is a `historyDays` parameter (default 92, WCPOS's `HISTORY_DAYS`) instead of a `@wcpos/sync-core` import.

- [#134](https://github.com/TallyUI/tallyui/pull/134) [`1d13699`](https://github.com/TallyUI/tallyui/commit/1d13699cb42f7b77a74af73971a0dad602b26896) Thanks [@kilbot](https://github.com/kilbot)! - Add the register's closure and X-report documents (`buildClosureDocument`, `buildXReportDocument`, `formatClosureDate`, `ClosureContext`) and register facts (`RegisterFact`, `recordRegisterFact`), ported from WCPOS `next` (ADR-032). The documents use WCPOS's own receipt-template envelope shape, so its shipped templates and renderer can be copied in later; a pinned key-tree snapshot against WCPOS's closure fixture guards that shape until then. Facts log through TallyUI's own logger (`@tallyui/pos`'s `logging` module) instead of `@wcpos/utils/logger`. `minorToDecimal` moves out of `exportCsv` into a shared `register` helper so both reuse it.

- [#121](https://github.com/TallyUI/tallyui/pull/121) [`9441c26`](https://github.com/TallyUI/tallyui/commit/9441c26d079974451796a92ce3c4852dc17576a5) Thanks [@kilbot](https://github.com/kilbot)! - Adds `@tallyui/pos`'s register maths (`packages/pos/src/register`), ported from WCPOS `next` at `3b5331b5c` (ADR-032, registers job a1): typed-movement validation against the server's paid-in/paid-out/no-sale grammar (`movementFieldError`, `normalizeAmount`, `isServerDecimal`), the register count's variance, threshold, denomination and amount maths (`countVariance`, `overThreshold`, `denominationTotal`, `varianceText`, `validAmount`, `parseMinor`, `denominations`), and `deriveExpected` for the float, captured session payments and non-voided paid-in/paid-out cash movements. Refund attribution is deferred until TallyUI has a refund model, so `deriveExpected` does not yet net refunds against the drawer. All money is TallyUI's integer-minor-units convention, with a required `exponent` parameter wherever a cashier's typed text becomes minor units (0 for JPY, 2 for GBP, 3 for KWD).

- [#126](https://github.com/TallyUI/tallyui/pull/126) [`45e0b12`](https://github.com/TallyUI/tallyui/commit/45e0b128ad2930d57bffc2bd8f432a334c760fab) Thanks [@kilbot](https://github.com/kilbot)! - `stampSession(order, sessionId, sessions)` is the only way to set a `PosOrder`'s `sessionId`: it verifies the session is still `open` or `counting` before stamping, so a caller that skips `requireOpenSession` can no longer leave a sale off every Z with an unchecked, closed session id. **`finalizeOrder` no longer takes a `sessionId` option;** stamp its result with `stampSession` instead.

  **`recordMovement` now takes the closures collection: `recordMovement(sessions, movements, closures, input)`.** After inserting a movement, it re-reads the session. If the session closed in the gap, the movement is removed and `RegisterSessionClosedError` is thrown only when the session's closure row is already frozen without it. If that closure row lists it, the movement is returned as counted. With no closure row yet, the movement is kept and the new, exported `RegisterMovementStrandedError` is thrown: it carries the movement's `id` and `session_id`, and its message can be shown to the cashier as it is. The caller must not record that movement again; registers job c's server resolves stranded movements. A failed `remove()` throws `RegisterMovementStrandedError` too, and a failed re-read returns the movement as recorded.

- [#123](https://github.com/TallyUI/tallyui/pull/123) [`a58fcca`](https://github.com/TallyUI/tallyui/commit/a58fccaecdbbeb84d44d9347b2cda9817450b1cb) Thanks [@kilbot](https://github.com/kilbot)! - Adds register sessions (ADR-032, registers job a2), ported from WCPOS `next` at `3b5331b5c`: three local-only collections (`registerSessionSchema` with `registerSessionCollection`, `cashMovementSchema`, `closureSchema`), the session write path (`openSession`, `startCounting`, `backToSelling`, `closeSession`, `recordMovement`, `voidMovement`, `requireOpenSession`, `writeClosure`), and the register document for the till's identity, store binding and counters (`ensureRegister`, `bindRegister`, `nextSaleCounter`, `mintClosureNumber`, `advancePerpetual`). A `PosOrder` carries an optional `sessionId`, set by `stampSession` and never sent. **`posOrderSchema` is now version 1** (the optional `sessionId`): create `pos_orders` with the new `posOrderCollection()`, which carries its identity migration; with `posOrderSchema` alone, RxDB refuses the collection.

  A closed session is final: nothing moves it out of `closed` (`RegisterSessionClosedError`), a repeat `closeSession` is a no-op, `recordMovement` and `voidMovement` take the sessions collection first and refuse a missing or closed session, and `writeClosure` refuses a session that is not closed.

- [#105](https://github.com/TallyUI/tallyui/pull/105) [`6281345`](https://github.com/TallyUI/tallyui/commit/6281345c5393ede25781f98625c19a8ee70b2159) Thanks [@kilbot](https://github.com/kilbot)! - Orders with a line in its own tax mode now finalize; the server charges each line in its own mode (ADR-038 amendment 2).

- [#74](https://github.com/TallyUI/tallyui/pull/74) [`0121559`](https://github.com/TallyUI/tallyui/commit/01215594f7fd15414c91b1d9333b0b9c6ba53309) Thanks [@kilbot](https://github.com/kilbot)! - Removes the unreleased multi-tab database machinery in favour of one live tab per store (ADR-061): `CreateDatabaseOptions.multiInstance` (`createTallyDatabase` always passes `multiInstance: false`), the `tally-outbox-flush` and `tally-outbox-state` local documents, and follower forwarding between tabs are all gone. The outbox's public API (`flush`, `requeue`, `start`, `stop`, `state$`) and its single-instance behaviour are unchanged. Apps enforce one live tab with `startLiveTab`.

  `@tallyui/storage-sqlite`'s worker now swallows the `ready` promise's rejection so a pool install failure before any `createStorageInstance` call doesn't surface as an unhandled rejection, and its `files` list no longer publishes test files, matching `@tallyui/database` and `@tallyui/pos`.

- [#55](https://github.com/TallyUI/tallyui/pull/55) [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5) Thanks [@kilbot](https://github.com/kilbot)! - Stock reads use the reconciled overlay (ADR-060) and show how fresh it is. `@tallyui/core` now holds `withStockOverlay` and `getProductStock` (`@tallyui/pos` re-exports them), adds `STOCK_LEVELS_LAST_PASS`, `stockOverlay` and `stockOverlayAsOf` props on `ConnectorProvider`, and a `useProductStock(doc)` hook that returns overlay stock plus `asOf`, or `getStock(doc)` when no overlay is given. `@tallyui/database`: `startStockReconcile` also returns `state$` (`running`, `truncated`, `lastError`, `lastCompletedAt`), `reconcileStock()` resolves with `completedAt`, and each successful pass stores `{ completedAt }` in the `last-pass` local document of `stock_levels`, which `createTallyDatabase` now creates with local documents (apps that create the collection themselves use the new `stockLevelsCollection` config; without local documents a pass rejects with a clear error); a restarted runner seeds `lastCompletedAt` from it. `@tallyui/pos` adds `stockOverlayAsOf$`. `ProductStockBadge` reads stock through `useProductStock` and appends " · as of <time>" when an overlay is given (`showAsOf={false}` hides it).

- [#53](https://github.com/TallyUI/tallyui/pull/53) [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6) Thanks [@kilbot](https://github.com/kilbot)! - Add a stock reconcile pass (ADR-060). `@tallyui/core` adds the `StockReconcileAdapter` contract (`fetchPages` and a pure `overlay`) and an optional `reconcile.stock` on `TallyConnector`. `@tallyui/database` adds the local-only `stock_levels` collection (`STOCK_LEVELS_COLLECTION`, `stockLevelsSchema`), which `createTallyDatabase` creates for connectors with `reconcile.stock`, and `startStockReconcile`, which re-reads stock every 5 minutes (and on demand through `reconcileStock()`) into that collection: it writes only changed rows, removes keys the backend no longer returns, writes nothing after a failed, truncated or stopped read, and never writes the replicated products. `@tallyui/pos` adds `stockOverlay$`, `withStockOverlay` and `getProductStock`, which read stock from the overlay where it has an entry and from the replicated product otherwise. The Vendure connector reconciles variant `stockLevels`, and the Medusa connector reconciles inventory item location levels, so stock changes that bump no product timestamp reach the POS.

- [#106](https://github.com/TallyUI/tallyui/pull/106) [`e7d3033`](https://github.com/TallyUI/tallyui/commit/e7d303348a24f9d7c042445f65b7f072dcd07f9d) Thanks [@kilbot](https://github.com/kilbot)! - `@tallyui/pos` adds the neutral store-settings bootstrap every platform POS shares. `resolveStoreSettings` reads the app's stored choice, calls `connector.storeSettings`, returns `choose` with the choices on `choice_required` (the tried choice as `initial`), and saves a new pick only once it resolves. `useStoreSettings` wraps it as a hook that re-resolves on a store switch and discards stale results, with `choose(choice)` and `retry()`. `withPricingContext` and `taxProviderProps` map the settings into the replication's `SyncContext` and `<TaxProvider>`. The app keeps persistence through `loadChoice` and `saveChoice`.

- [#118](https://github.com/TallyUI/tallyui/pull/118) [`5bcabfb`](https://github.com/TallyUI/tallyui/commit/5bcabfbf55a823762a7ff58067437df412564bd8) Thanks [@kilbot](https://github.com/kilbot)! - Add the tender reducer, ported from WCPOS `next` at test parity: an integer-minor-unit keypad, cash change, quick tender amounts, and even/fixed/percentage/item split plans. `tenderReducer`, `initTenderState`, `initialTenderState`, `appliedMinor`, `changeMinor`, `quickTenderedAmounts`, `evenSplitShareMinor`, `activePlan`, `planLegs` and `MAX_TENDER_MINOR` are exported from `@tallyui/pos`, along with their state and action types. WCPOS's WooCommerce-only legacy tab (`TenderTab`, the `tab` field, `set-tab`) is dropped as platform-specific; `PaymentTransport` is redefined locally as the same hardware transport union. No screens: those come with the TV6 components lift and the app.

- [#104](https://github.com/TallyUI/tallyui/pull/104) [`bc46d99`](https://github.com/TallyUI/tallyui/commit/bc46d9903af3641836ae32c906542789e510496d) Thanks [@kilbot](https://github.com/kilbot)! - `ProductGrid` hides products this channel doesn't sell (`traits.isSellable`
  false, for example a Medusa product outside the sales channel) unless
  `showUnsellable` is set, and `ProductCard` shows such a product in a muted
  "Not sold here" state instead of its price. `OrderBuilder.addProduct` now
  refuses an unsellable product before looking up its price, instead of
  throwing the unrelated "No price in …" error.

- [#143](https://github.com/TallyUI/tallyui/pull/143) [`fb6c2e3`](https://github.com/TallyUI/tallyui/commit/fb6c2e357448e24fad51020dccfca1b086ef47be) Thanks [@kilbot](https://github.com/kilbot)! - Add `useRegisterSession`, the till's register session as React state with its actions (open, count, back to selling, close, cash movements, voids). The app supplies every input. Expected cash and the sales count are derived locally from `pos_orders`, and nothing is sent to a server. `requireOpen()` gates tender. `RegisterTenderInProgressError` stops counting or closing during a sale at tender, `RegisterSessionAlreadyOpenError` stops a second open, and `RegisterCloseIncompleteError` stops an open until an interrupted close is finished. A resumed close uses the count saved on the session.

### Patch Changes

- [#155](https://github.com/TallyUI/tallyui/pull/155) [`96bf8f7`](https://github.com/TallyUI/tallyui/commit/96bf8f79a47cd29b8b115ec46d070ce889750caa) Thanks [@kilbot](https://github.com/kilbot)! - `addPosOrderCollection(db)`: when a close stops waiting (after `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`) while the migration still runs, the migration no longer writes into the stores the close closes. On SQLite it used to fail with a raw `SQLite.bulkWrite() already closed` and an unhandled rejection, and left the SQLite handle unable to write until restart. The open now rejects with `PosOrderOpenClosedError` (`code: 'POS_ORDER_OPEN_CLOSED'`), and the next open on the same database migrates every order.

  The status writes such an open drops are logged at warn through the new exported `posOrdersLogger` (scope `pos-orders`), and a close that gives up once the migration is done, while the open reads its status, also rejects with `PosOrderOpenClosedError`.

- [#174](https://github.com/TallyUI/tallyui/pull/174) [`160252c`](https://github.com/TallyUI/tallyui/commit/160252c0b2415b60ac73fcb06ac5920db0df098e) Thanks [@kilbot](https://github.com/kilbot)! - `ClosureSheet` shows who approved the close (`Approved by {name}`, falling back to the approver id without a name) under the figures, blind or not — it's provenance, not a counted figure. `RegisterColumn` offers "Finish closing" when `useRegisterSession`'s session is closed but its closure row was never written (an interrupted close), resuming the close (the store keeps the count persisted on the session) instead of falling through to the cart, where `openSession` would otherwise refuse with `RegisterCloseIncompleteError`. `buildClosureDocument`'s return type now carries `closure.unsynced_count: number` and each movement's `id`/`reason` as `string`, without a cast; no runtime output changed.

- [#147](https://github.com/TallyUI/tallyui/pull/147) [`cbda7e0`](https://github.com/TallyUI/tallyui/commit/cbda7e00348b0d353fc53c13f1696455ad8d94eb) Thanks [@kilbot](https://github.com/kilbot)! - `useSale()` follow-ups to #145's idempotent `complete()`: the sale now locks from `complete()`'s entry (`saving` true, every change refused with SALE_SAVING), not only once the order is built and stamped — so Back, an edit or `cancelTender()` during the session stamp is refused, and a `finalizeOrder` refusal before any order is built still unlocks the sale with the refusal's error, as before. `newSale()` now also clears the in-flight save's tracking and stamps a new generation: a hung save's late outcome can no longer make the next sale's `complete()` quietly share its promise, and an attempt still building or stamping when `newSale()` lands can no longer install its order as the new sale's pending completion — that order still reaches `onSaleCompleted` once it's built, since the money is already taken; only a throw from that background call is new, logged at `error` rather than shown to the new sale. The order outbox's `run()` now checks the stored order's `commandId` before marking it sent or rejected (not only its `syncStatus`), and reads it with a primary-key lookup straight on the storage instance instead of a full index scan, so an order requeued under a new `commandId` while its old command was in flight can't take the old result.

- [#145](https://github.com/TallyUI/tallyui/pull/145) [`e103c71`](https://github.com/TallyUI/tallyui/commit/e103c71116a636c2cfd01903155b1e6da86a2d23) Thanks [@kilbot](https://github.com/kilbot)! - `useSale().complete()` is idempotent for one tender. It builds the order once per tender attempt and keeps it as the pending completion. A retry after `onSaleCompleted` throws hands over the same order (the same `id`, `commandId` and `createdAt`, with no second session stamp or late-sale fact), so a save that failed after storing the order no longer queues a duplicate sale. A second `complete()` while one is in flight (a double tap) returns the first call's promise instead of building a second order, and `complete()` on the receipt does nothing. While a completion is pending, the new `saving` flag is true and the sale is locked: `add`, `setQuantity`, `remove`, `applyDiscount`, `removeDiscount`, `setTender`, `startTender` and `cancelTender` change nothing and set the error "This sale is being saved. Retry to finish it." `newSale()` abandons it, and leaves any order already stored in `pos_orders` untouched. `useOrderOutbox().record` treats an order already stored under the same `commandId` as stored, and still flushes; the same `id` under another `commandId` still rejects.

- [#129](https://github.com/TallyUI/tallyui/pull/129) [`350dd72`](https://github.com/TallyUI/tallyui/commit/350dd72708cc652bf6200010995379ae5816e93f) Thanks [@kilbot](https://github.com/kilbot)! - Stacked line discounts now record what each one actually removed, capped at what the earlier discounts on the same line left, instead of the discount's raw computed amount. A line's `discountMinor` is unchanged; only the per-discount `amountMinor` breakdown the receipt will print is corrected (#63).

- [#152](https://github.com/TallyUI/tallyui/pull/152) [`7e489e0`](https://github.com/TallyUI/tallyui/commit/7e489e0488b75cd6e926bda5adf99230f770b8e7) Thanks [@kilbot](https://github.com/kilbot)! - `addPosOrderCollection(db)`: a close now waits for the whole open (up to `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`), not only its migration. A close that landed while the open added the collection or reset the migration checkpoint used to close storage under it; on SQLite the open then failed with rxdb-premium's raw `ReferenceError: context is not defined`. An open called on a database whose close has begun, or one the close stopped waiting for, now stops before any further write and rejects with the new exported `PosOrderOpenClosedError` (`code: 'POS_ORDER_OPEN_CLOSED'`): reopen and call it again.

- [#133](https://github.com/TallyUI/tallyui/pull/133) [`f67535d`](https://github.com/TallyUI/tallyui/commit/f67535d358e337456505a4655a0d8977fab034fc) Thanks [@kilbot](https://github.com/kilbot)! - `addPosOrderCollection(db)` follow-ups from the #131 review: a close no longer waits forever on a
  stuck migration (it gives up after `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`, 10s, leaving the worst
  case an `ERROR` status the next open safely resets and retries); it refuses a `multiInstance`
  database up front, before any reset, since the reset can race a second tab's migration
  (TallyUI is single-instance, ADR-061); and repeated DM4 retries on the same database no longer
  add another `db.onClose` handler each time, only ever one.

- [#135](https://github.com/TallyUI/tallyui/pull/135) [`d921415`](https://github.com/TallyUI/tallyui/commit/d921415ed99a9ed20fa26cd5b79d6116240a2539) Thanks [@kilbot](https://github.com/kilbot)! - `addPosOrderCollection` no longer lets a failed migration run's replication outlive the run (RxDB's `cancel()` never stops it), so rapid DM4 retries on the same database raise no unhandled `removed already` rejection. A version-0 order whose version-1 copy is stale (for example, sent by a rolled-back build after a failed run copied it as pending) now migrates with its newer version-0 state instead of losing to the stale copy or looping in RxDB's conflict handling.

- [#95](https://github.com/TallyUI/tallyui/pull/95) [`f1af98c`](https://github.com/TallyUI/tallyui/commit/f1af98ce0161ded267e873ead952e8d7deafe471) Thanks [@kilbot](https://github.com/kilbot)! - `OrderCreateLine` gains an optional `taxInclusive` (ADR-038 amendment 2). It is the line's own tax mode, sent only when that mode differs from the order's `pricesIncludeTax`. Single-mode orders produce byte-identical payloads. `finalize` still rejects converted lines until the Medusa plugin honours the field.

- [#158](https://github.com/TallyUI/tallyui/pull/158) [`a7fdde8`](https://github.com/TallyUI/tallyui/commit/a7fdde8cf2d0c042365a50103084b6eeb3609ff6) Thanks [@kilbot](https://github.com/kilbot)! - A sale stamped with a register session that then closed, and stored after that session's closure was frozen without it, no longer sits on no Z. The new `sweepOrphanStamps` turns each such order into a late sale: it removes `sessionId`, sets `lateSessionId` and logs one `late-sale` fact. It never changes the closure, an order the closure lists, an order whose session has no closure yet, a late order or another register's orders. `useRegisterSession` runs it on start, after each close's closure, and whenever a new closure appears. `voidMovement` takes an optional `closures` collection and re-reads the session after its writes. If the session closed meanwhile and no closure lists the reversal, it throws `RegisterMovementStrandedError`, and it always does so when `closures` isn't passed. The reversal is kept either way.

- [#146](https://github.com/TallyUI/tallyui/pull/146) [`5e5ba11`](https://github.com/TallyUI/tallyui/commit/5e5ba11b1c975b216d4c3ffc0eaceb7f26132ce1) Thanks [@kilbot](https://github.com/kilbot)! - The order outbox reads its pending batch, its pending count and the rejected orders to requeue straight from the storage, past RxDB's query cache. In RxDB 16.21.1 a sale inserted while a cached query's storage read was in flight never reached that query, so the outbox left it unsent until the app restarted. Before patching a sent order, the outbox now checks the order's stored state the same way, because a `findOne(id)` can go stale too. New exports `readFresh(collection, query)` and `countFresh(collection, selector)` do these reads.

- [#38](https://github.com/TallyUI/tallyui/pull/38) [`6444868`](https://github.com/TallyUI/tallyui/commit/644486864f66d829877898afade7e6726b1889fe) Thanks [@kilbot](https://github.com/kilbot)! - `uuidv7()` with no arguments is now monotonic: ids made in the same millisecond, or after the clock steps back, still sort strictly after the previous one (RFC 9562 monotonic random counter). Calls with an explicit timestamp or random source are unchanged.

- [#51](https://github.com/TallyUI/tallyui/pull/51) [`7502d61`](https://github.com/TallyUI/tallyui/commit/7502d61cc05441972a70dc6e493b50a993aaa00c) Thanks [@kilbot](https://github.com/kilbot)! - addProduct charges the chosen variant's price (and SKU) instead of the first variant's; an unknown variant id throws. requeue() re-checks each order's status inside the write, so it never re-pends an order that is no longer rejected.

- [#157](https://github.com/TallyUI/tallyui/pull/157) [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766) Thanks [@kilbot](https://github.com/kilbot)! - `readFresh`, `countFresh` and `watchFresh` move to a new, side-effect-free subpath, `@tallyui/core/rxdb`. Core now lists `rxdb` (`>=16`) and `rxjs` (`>=7`) as optional peer dependencies, needed only by that subpath; core's main entry stays free of both. `@tallyui/pos` re-exports the helpers unchanged. The id and fingerprint reconciles in `@tallyui/database` read the local products with `readFresh` instead of a cached `find()`, so a product the pull inserts or deletes while a pass reads them no longer leaves every later pass reading a stale list (RxDB 16.21.1 bug 4): an inserted product is now checked, and tombstoned or re-fetched, on the next pass, and a deleted one is no longer re-enqueued or counted towards the mass-delete brake.

- [#128](https://github.com/TallyUI/tallyui/pull/128) [`b32d1b4`](https://github.com/TallyUI/tallyui/commit/b32d1b476a1d9592d8441b097877c875a4ba1e7c) Thanks [@kilbot](https://github.com/kilbot)! - Resuming a parked order now keeps each line's own tax mode (`taxInclusive`) instead of falling back to the store's mode. Previously a parked mixed cart came back with every line priced in the store's mode, changing both the settlement figures (`subtotalMinor`, `discountMinor`, `taxMinor`, `totalMinor`) and the display figures from the ones the cashier parked.

- [#170](https://github.com/TallyUI/tallyui/pull/170) [`93ed2cc`](https://github.com/TallyUI/tallyui/commit/93ed2cc93704dbeb9d9842fade18c77a5e2ed820) Thanks [@kilbot](https://github.com/kilbot)! - `useSale` now stamps the session in force when the tender started (`startTender`), pinned for that tender, instead of reading its `session` option at `complete()` time. A session closed between `startTender` and `complete()` (so the app's `saleSession` went undefined) previously skipped the stamp entirely: the order got neither `sessionId` nor `lateSessionId` and no `late-sale` fact. It now becomes a late sale on the pinned session. A tender started with no session stays unstamped, even if a session appears before `complete()`. The pin is dropped by `cancelTender()` and `newSale()`.

- [#156](https://github.com/TallyUI/tallyui/pull/156) [`244bb46`](https://github.com/TallyUI/tallyui/commit/244bb46e51b4a85b0947049762bf8260893c4293) Thanks [@kilbot](https://github.com/kilbot)! - `stampSession`, `recordMovement` and `voidMovement` check that the session is live with a primary-key storage read instead of a cached `findOne`, and so does `recordMovement`'s re-read after its insert. A session closed by a write that skips that cached query, as a server sync would, is no longer taken as open until the app restarts.

- [#150](https://github.com/TallyUI/tallyui/pull/150) [`a9a4525`](https://github.com/TallyUI/tallyui/commit/a9a452501b29ddaf86f270bbdda6949e35356506) Thanks [@kilbot](https://github.com/kilbot)! - `useSale().newSale()` now refuses (with the saving error, changing nothing) while a `complete()` attempt is still building or stamping its order — not only once a pending completion exists. Previously that window let `newSale()` abandon the attempt and start a new sale at once, handing the built order to `onSaleCompleted` in the background once it finished; a failure there was money taken with only an error log. Now the cashier waits for the short stamp, then gets Retry or Continue as usual, and abandoning a save is possible only once its order is confirmed stored (`continueSale()`) or from the receipt. The generation-mismatch hand-over this replaces, and `handOverAbandoned`, are removed. Also fixes three gaps the #149 review found no test caught: `complete()` now clears a stale `canContinue` at every new attempt's entry (including a Retry after Continue was offered), and a confirmation from `isStored` that arrives after the completion is no longer pending, or after a newer attempt has started, no longer sets `canContinue`.

- [#160](https://github.com/TallyUI/tallyui/pull/160) [`787cada`](https://github.com/TallyUI/tallyui/commit/787cada220fa4f9d176a9052861a602dfaa61148) Thanks [@kilbot](https://github.com/kilbot)! - The orphan-stamp sweep (`sweepOrphanStamps`, ADR-032) is now bounded by a `swept_closure_ids` set on the register document: a closure it has already checked costs no `pos_orders` query, and the set needs no schema bump. It now takes `register` and `storeKey`, as `writeClosure` does. A closure joins the set only once it is older than the new `SWEEP_GRACE_MS`, so an insert racing a close still gets caught; `useRegisterSession` runs a `full` sweep (ignoring the set) once on start to repair anything a save that outlasts the grace missed. `closeSession` already awaited its own sweep before returning; that is now covered by a test. `voidMovement`'s closure lookup is now a primary-key storage read, for consistency with `readSession`.

- [#172](https://github.com/TallyUI/tallyui/pull/172) [`3e63452`](https://github.com/TallyUI/tallyui/commit/3e63452083b8c95212fe93555efe0d1f69e58f40) Thanks [@kilbot](https://github.com/kilbot)! - `useSale`'s `startTender` takes the confirmed session (`startTender(method, { session })`) and pins it instead of the rendered `session` option, which can lag a session opened just before the tender. `useRegisterSession` adds `requireSaleSession()`: `requireOpen()`, returning `{ id, sessions }` to pass to `startTender`. A tender that pinned no session, with a session rendered by `complete()`, now stamps that current session and logs a warning, instead of leaving the order unstamped.

- [#166](https://github.com/TallyUI/tallyui/pull/166) [`07e0198`](https://github.com/TallyUI/tallyui/commit/07e01985fec62060f984e9cfd58e78c6015141ce) Thanks [@kilbot](https://github.com/kilbot)! - `varianceText` puts the direction in the word only: "€100.00 short", "€5.00 over", "Exact", without a leading sign (a signed "−€100.00 short" read as a double negative).

- [#153](https://github.com/TallyUI/tallyui/pull/153) [`38df38a`](https://github.com/TallyUI/tallyui/commit/38df38a0ac1325aa1089ae398d32362561aeeed8) Thanks [@kilbot](https://github.com/kilbot)! - `watchFresh` re-reads once per bulk write instead of once per document: it listens to `collection.eventBulks$` rather than the per-document `collection.$`, so a `bulkInsert` of 100 documents costs one storage read, not 100. (RxDB Premium's SQLite storage splits a write into batches of 199 documents and emits one event per batch, so a larger write costs one read per batch.)

- Updated dependencies [[`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b), [`50317c8`](https://github.com/TallyUI/tallyui/commit/50317c8520ebc04f2f6cdd47b9b9c6a0ed3efdd6), [`3e09957`](https://github.com/TallyUI/tallyui/commit/3e099573c771f130ffb6a5a3736527e908899257), [`a219ae0`](https://github.com/TallyUI/tallyui/commit/a219ae03588234d6e1a685a9924b52e115dcb7d1), [`4df9be4`](https://github.com/TallyUI/tallyui/commit/4df9be400debddb67859482c17f9e68dadbf46d1), [`9649259`](https://github.com/TallyUI/tallyui/commit/96492599bdb93fa573f588ae84585dc027289da8), [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09), [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005), [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e), [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8), [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17), [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99), [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a), [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764), [`f1af98c`](https://github.com/TallyUI/tallyui/commit/f1af98ce0161ded267e873ead952e8d7deafe471), [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be), [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d), [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766), [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588), [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4), [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9), [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9), [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5), [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6), [`ac2a24a`](https://github.com/TallyUI/tallyui/commit/ac2a24a147d1a759e7c5e28e73d0be90caa5e29b), [`8df0569`](https://github.com/TallyUI/tallyui/commit/8df0569d849f6099ec260eeb06e5c230172e12b5)]:
  - @tallyui/core@2.0.0
