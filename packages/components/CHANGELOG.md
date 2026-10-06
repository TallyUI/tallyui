# @tallyui/components

## 3.3.0

### Patch Changes

- Updated dependencies [db9d97a]
- Updated dependencies [820b8c2]
- Updated dependencies [fcace3b]
- Updated dependencies [f604f87]
- Updated dependencies [cec1088]
- Updated dependencies [9f7cffe]
- Updated dependencies [c7aa412]
- Updated dependencies [611ce1c]
- Updated dependencies [585af9b]
- Updated dependencies [71be352]
  - @tallyui/pos@3.3.0
  - @tallyui/core@3.3.0
  - @tallyui/primitives@3.3.0
  - @tallyui/theme@3.3.0

## 3.2.1

### Patch Changes

- 50ae7de: New `SplitTender` view: take several payments for one sale (cash and card), with remaining due and change, over `useSale().addTender`/`removeTender`; `Tender` is unchanged.
- Updated dependencies [a187b61]
  - @tallyui/pos@3.2.1
  - @tallyui/core@3.2.1
  - @tallyui/primitives@3.2.1
  - @tallyui/theme@3.2.1

## 3.2.0

### Minor Changes

- 2a3a3f0: `useSale` takes an optional `currentPrice(variantId)` and `resume()` then re-prices a parked sale's lines to today's prices (with a non-blocking 'Prices changed' message; `resume(id, { keepParkedPrices: true })` keeps them); `ParkedSales` takes optional `onPark`/`onResume`, so an app can drive it from its own parked store.

### Patch Changes

- d870060: Price and fixed-discount entry accept up to the currency's own decimal places, so 3-decimal currencies (KWD, BHD, OMR) can be entered to the minor unit; percentages stay at 2.
- Updated dependencies [2a3a3f0]
  - @tallyui/pos@3.2.0
  - @tallyui/core@3.2.0
  - @tallyui/primitives@3.2.0
  - @tallyui/theme@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [63a7431]
  - @tallyui/core@3.1.1
  - @tallyui/pos@3.1.1
  - @tallyui/primitives@3.1.1
  - @tallyui/theme@3.1.1

## 3.1.0

### Patch Changes

- 7986abe: Cart can show a Price action on each line (`canEditPrice`) over `useSale().setUnitPrice`, with an optional reason passed to `onPriceChange`; new `PriceForm` and `parsePrice`.
- 4a93ef6: `CustomerSelect` renders its search input (it took `onSearch` and `placeholder` but showed no input), so apps no longer compose their own.
- ae38ef8: New `ParkedSales` sheet (components) and `useParkedSales(drafts)` hook (pos): park the current cart, and resume or discard (with confirmation) parked carts, newest first.
- Updated dependencies [ae38ef8]
- Updated dependencies [8471546]
- Updated dependencies [56b24d2]
- Updated dependencies [423bf42]
  - @tallyui/pos@3.1.0
  - @tallyui/core@3.1.0
  - @tallyui/primitives@3.1.0
  - @tallyui/theme@3.1.0

## 3.0.4

### Patch Changes

- 4946325: Catalogue takes an optional `pullError`; while it is set, a catalogue that has never synced shows 'No products yet.' instead of 'Loading products…' (a failed first pull no longer reads as loading).
- 5a2e037: RegisterPanel lists only cash under 'Expected in the drawer' and other tenders under 'Other tenders'; the `external` tender reads 'Card' in the panel, the count and the closure sheet.
  - @tallyui/pos@3.0.4
  - @tallyui/core@3.0.4
  - @tallyui/primitives@3.0.4
  - @tallyui/theme@3.0.4

## 3.0.3

### Patch Changes

- 2215eae: `orderReference` is exported from the package root, so an app's own receipt can print the same order reference as `OrdersList` and `Receipt`.
- 1d8cbc0: catalogueEntries accepts a trait context and no longer requires getVariants (a product without it sells as one variant from its own traits); Catalogue passes its currency; connector-woocommerce adds getVariants for non-variable products (variable products need their variations synced, a later release).
- Updated dependencies [e7b980a]
- Updated dependencies [c05e216]
- Updated dependencies [1d8cbc0]
  - @tallyui/pos@3.0.3
  - @tallyui/core@3.0.3
  - @tallyui/primitives@3.0.3
  - @tallyui/theme@3.0.3

## 3.0.2

### Patch Changes

- ccdaaf8: The empty cart's line is padded like the cart rows instead of sitting against the panel edge.
- 16b5627: Catalogue shows 'Loading products…' on an empty grid until the first sync completes (new optional `loading` prop, defaulting to `lastSyncedAt === null`).
- f6c511d: The receipt prints the finalized order's reference (its id's last 8 characters, plus the store's #number once synced) and time when given `posOrder`, and Orders shows the same reference, so a receipt matches its row. A receipt rendered without `posOrder` is marked '(draft)'. Apps pass useSale's receipt-stage `posOrder` to `<Receipt>`.
- a862823: OrdersList rows expand on tap to show the sale's items and payments, and an empty list says 'No sales yet. Completed sales appear here.'
- 7a0db5e: The receipt shows each discount once: the order discount appears only in the totals, and line discounts are summed once as 'Line discounts' instead of a combined 'Discount' row.
  - @tallyui/core@3.0.2
  - @tallyui/pos@3.0.2
  - @tallyui/primitives@3.0.2
  - @tallyui/theme@3.0.2

## 3.0.1

### Patch Changes

- 2416b21: A Dialog now closes on an overlay press and, on web, on Escape (the topmost dialog only; `closeOnPress={false}` or `onEscapeKeyDown` + `preventDefault()` keep it open), and RegisterPanel has a close button, so the register panel can be dismissed on web.
- Updated dependencies [2416b21]
  - @tallyui/primitives@3.0.1
  - @tallyui/pos@3.0.1
  - @tallyui/core@3.0.1
  - @tallyui/theme@3.0.1

## 3.0.0

### Minor Changes

- 04905ef: `Catalogue` now applies the provider's reconciled stock overlay itself (tiles, search and the variant chooser agree), and `useStockOverlaid` and `useStockOverlayAsOf` are new.
- 78d324e: Add useSale.setCustomer and ReceiptData.header.customer, customerTraits, CustomerPicker, generic CustomerSelect/CustomerCard with traits overrides, CustomerForm.showAddress, and the receipt's customer line.

  CustomerSelect rows are now pressable, so choosing a result works on the web (it previously did nothing).

- 130d28e: A store that keeps answering 404 is no longer silent. After 3 consecutive 404 answers the order and register outboxes set `OutboxState.backendMissing: { since }` (when the first of them arrived), and `SyncStatus` tells the cashier in plain words that sales aren't reaching the online store and are saved on the till, with a detail line for the store owner, instead of showing `retrying (status_404)`; the stuck line shows the same words, with no raw code. `SyncStatus` takes an optional `pluginName` (default `'the POS plugin'`) for that detail. The outboxes keep retrying on their normal backoff, and orders stay pending, so a 404 during a deploy blip recovers on its own. The next answer that isn't a 404 clears it; an offline (`network`) retry changes nothing.
  Pass one `createBackendNotFound()` tracker as `backendNotFound` to both `createOrderOutbox` and `createRegisterOutbox` so their 404s count together and the notice shows once, whichever outbox meets it first; without it, each outbox keeps its own.
- 9e1032f: One order the store keeps failing no longer stops every later sale. After 5 server-answered failures (offline never counts) the order outbox probes the pending queue one order per backoff interval, oldest first; once the store takes one, the orders whose probes failed are isolated and retried alone, and batching resumes. If no probe gets through, the store is down: nothing is isolated. Retries alternate between the batch (or the probe) and one due isolated order, one request per interval, so neither can starve the other, and isolated orders take turns. An order the store has kept failing for 15 minutes of answered time, on its own clock, is flagged as stuck and stays pending: `OutboxState.stuck`, with a per-order entry in `stuck.orders`, `useOrderOutbox`'s `stuckCommandIds`, `needsAttention`'s `stuckCommandIds` option, `OrdersList`'s `stuck` prop (each order with its own time and reason), and `SyncStatus`'s "Not syncing" line. An offline failure pauses every clock, and the store's next answer of any kind resumes them all; a flagged order stays flagged through an offline spell, since a paused clock keeps its answered time. The HTTP transport now reports a request that got no answer in time as `timeout`, which counts like a 503 and never pauses a clock, and keeps `network` for a store it could not reach.
- a9cdfc0: Migrate pos_orders to version 4 with optional localWarnings and serverFailures. Record omitted customer details and dropped payment references on the stored order, and show these warnings in the orders list; serverFailures is declared for the next outbox update.
- c92e96e: ProductGrid renders a virtualized FlatList, with its props unchanged.
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

- a94b255: `OutboxState` gains `rejected?: number`: the order outbox publishes the count of `pos_orders` the store refused (`syncStatus: 'rejected'`) wherever it publishes `pending`, so it rises when a batch result rejects an order and falls when `requeue()` sends one again. The register outbox leaves it unset. While `rejected` is above 0, `SyncStatus` never says "Sales are up to date.": its whole status line (label, polite live region and iOS announcement) is "1 sale needs attention · The online store refused it. Ask the store owner to look at the till's sync log." or "{n} sales need attention · The online store refused them. Ask the store owner to look at the till's sync log.", in place of the stuck and backend-missing sentences and the sending or retrying line. What else waits stays in the count: "1 sale needs attention, 5 waiting to sync · …" with other sales pending, "…, 2 till updates waiting to sync · …" with till updates, and "…, 5 sales and 2 till updates waiting to sync · …" with both. Below it, "Refused sales stay on this till under Needs attention, each with what to do next.", then the backend-missing detail when the store is missing. With `rejected` 0 or unset, nothing changes. When the store refused a whole batch (`refused` set, no sale carrying a code), the status line is the waiting count followed by " · The online store refused the last send. This till will try again with the next sale, or when the app is reopened." in place of the stuck or backend-missing sentence, and the sending or retrying line (which read "Retrying in 0 s.") is hidden; refused sales still outrank it. With only till updates waiting and the register outbox refused, it ends "…try again with the next till update." instead; with a sale waiting, the sales line wins.
- df80ead: `SyncStatus` takes an optional `registerState` (the register outbox's state): waiting till updates are counted ("1 till update waiting to sync", or named beside the sales), so it never says the sales are up to date while any wait, and with no sale waiting the backend-missing sentence says till updates aren't reaching the online store, or, once `registerState.stuck` is set, "Till updates haven't reached the online store since {time}. …". The backend-missing detail now reads "This till couldn't find {pluginName} on the online store. …". With nothing waiting, the line is only "Sales are up to date." (it replaces "All sales synced"), with no sending, retrying or problem text after it; if the store is missing, the detail reads "This till couldn't find {pluginName} on the online store the last time it checked. …". The status line's accessibility label is the whole visible line instead of "Sync status". The order and register outboxes let go of a shared `backendNotFound` tracker on `stop()` and take it up again on `start()` or `flush()`.
- 8cf3ea4: A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

  - **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
    - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
    - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
    - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
  - **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
  - **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.

### Patch Changes

- ba63f04: `CommandWarning` gains `{ code: 'customer_ignored'; customerId: string }` (#266): a sale whose `customerId` doesn't resolve is kept as a guest sale. `knownWarnings` keeps it and `parseCommandResult` accepts it when `customerId` is 1 to 64 characters; the orders list renders it.
- 24b74fd: `CommandWarning` gains `{ code: 'figures_mismatch'; fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor' | (string & {}); tillMinor: number; serverMinor: number }> }` (#257): one warning per sale listing each of the till's figures that differs from the server's own computation. `parseCommandResult` accepts it when `fields` is non-empty, each `field` is one of the three names with none repeated, and each entry's two values are different safe integers. `knownWarnings` applies the same rules but keeps a field name it doesn't know (any non-empty string), since a newer store may send one; the orders list renders it, an unknown field by its raw name.
- d6a5073: **The outbox freezes an order an older till stored before it first sends it** (`freezeSentForm`, which `finalizeOrder` uses too):

  - line names, discount labels and payment references are cut to 255 characters, but ids never are;
  - a customer email or id that `order.create` would refuse is left out;
  - the frozen form is written back, so the receipt and the store see the same bytes.

  So an order stored before the upgrade and still unsent is never refused as `invalid_payload`.

  **New type:** `SentOrder`, an `Order` whose customer id may be missing. The receipt stage, `buildReceiptData` and `Receipt` take it, and a plain `Order` still fits.

- 27d736e: `CommandWarning` gains `bridgeMinor` on `total_mismatch` and a new `tax_rate_mismatch` code, and the till now ignores warning codes it doesn't know (`knownWarnings`), instead of showing them as a store total.
- fd882bc: The stuck line says "no answer from the store" for a timeout.
- eb203b4: Review follow-ups with no behaviour change (#356, #358):
  - `SyncStatus` and `OrdersList` build their "since {time}" and "since about {time}" text with one shared helper.
  - `useRegisterOutbox`'s docs now say when `transport()` is called, and that the latest `isEnabled` and `onResult` are used without restarting the outbox.
- af623c9: The order.create string lengths move from `payloadShapeErrors` to the new `payloadBoundErrors`, which `precheckCommand` calls after the replay lookup, so an applied order resent with a long title replays as `duplicate`; `payloadShapeErrors` keeps the types, the `customerId` and `sessionId` bounds and the NUL check. `useSale` applies a tender before logging a dropped reference, and `add()` refuses a product whose id or v3 tax code finalize would refuse; the tender's reference field caps at 255 characters. `finalizeOrder` now freezes the sent form (names and discount labels cut, an unsendable customer email or id left out) and `toOrderCreateEnvelope` sends the stored order unchanged, so every resend is byte-identical.
- ef2f64e: The shared order.create shape check bounds string lengths and refuses NUL, and so does the v3 fiscal-figures check for its display and tax-code strings. The till cuts long names when it stores the order, refuses over-long pass-through references at finalize (and a payment reference as it's entered), refuses a searched or parked customer whose email or id the server would refuse, and validates the customer email at entry. Tills should ship this clamp before plugins adopt the new bounds, so no till sends a sale the server would now refuse.
- d225c58: Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.
- 6bbd1ba: Each sale records the tax rounding its figures were computed with (#287): `finalizeOrder` writes `taxRounding` on the stored order, the default (`per_order`, `half_away_from_zero`) included, and `custom` as `{ granularity: 'custom' }`. It is the till's own record and is never sent in `order.create`. The Z report splits each sale's tax by rate with the strategy that sale recorded, so its rows are the receipts' rows, and its `breakdowns.tax_rounding_mixed` is `true` when a session's sales used more than one strategy (a `custom` sale counts as the default it applied); `ClosureSheet` then says so, and `buildClosureDocument` carries the same line ready to print as `closure.tax_rounding_note` (`TAX_ROUNDING_MIXED_NOTE`), for the apps' closure templates. `PosOrder.taxRounding` is now required in the type.

  `pos_orders` moves to schema version 6: `taxRounding` is required, and the migration records the default on every older sale, the only rounding any earlier build used. Like version 5, this storage is one-way: an older build opens it but shows no orders, so never roll an app back across it (ADR-069). Before 3.0.0 ships, #242's OPFS upgrade proof is rerun against version 6.

- 5c90aed: `parseCommandResult` now accepts a `total_mismatch`'s `bridgeMinor` and the `tax_rate_mismatch` warning code, so a plugin replaying a stored v3 result no longer fails. `knownWarnings` is lenient about a bad optional `bridgeMinor` (dropping just that field, not the whole warning) and about a non-array `warnings` value. `OrdersList`'s rounding line now reads "Store calculated …; a rounding line of … brought it to …". `Catalogue` keeps its input array's identity when the stock overlay changes nothing, and takes the latest of `lastStockCheckAt`, the provider's `stockOverlayAsOf` and `lastSyncedAt` for its "stock as of" time.
- c00e1ea: `OrdersList` shows a rejected sale's refusal in the cashier's words, one sentence per error code (#269), in both Needs attention and Recent, and never the store's own message. An unknown code, or a rejected sale with no error, shows `platform_error`'s sentence: "The online store refused this sale. Ask the store owner to look at the till's sync log." An `idempotency_mismatch` shows its sentence ("… Don't send it again; ask the store owner to compare the two.") in place of the old "This sale needs checking against the store before it can be sent again." line, and still has no Retry. The order outbox logs every refusal once to the sync log as "Order refused by the store" with the order id, the code and the store's message: a warning, or an error for `unsupported_version` (whose log previously used the message itself as its text).
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

- 0e4c9cc: The "since" a cashier reads is a real time (#253). `OutboxState.stuck` (both outboxes) gains `firstFailedAt`: the wall-clock time the first failure of the current stuck run was answered, so an offline gap no longer moves it. `since` keeps its meaning, the clock's virtual start, and still drives the 15-minute threshold. `firstFailedAt` is kept in memory only. After a restart it is absent, and `SyncStatus` and `OrdersList` show the stored time instead, worded "since about 2:49 AM".
- d6079b4: `SyncStatus` inserts the plugin name and times literally (a `$&`, `$1` or `$$` in them is kept as written), and with only till updates waiting shows the register outbox's sending and retrying text and countdown. It shows no raw reason code: a stuck order now shows the "Sales haven't reached the online store since {time}." sentence (for till updates alone, "Till updates haven't …"), store missing or not. Sending and retrying are a short line of their own below the status line: "Sending…" or "Retrying in {n} s.". The status line and each pull-notice line are polite live regions (`aria-live="polite"` on web, `accessibilityLiveRegion` on Android) and on iOS are announced when their text changes, both in one announcement when they change together. What is announced is only the substance (counts, the sentence, the notice): the sending or retrying line is outside any live region, so it is never announced. `OrdersList` shows no reason code either: a stuck order reads "Hasn't reached the online store since {time}." with the hour numeric, and a rejected order shows the store's message alone (nothing when it has none), never its error code.
- e51f1b7: Times shown to a cashier no longer force a leading zero on the hour (#252): `ProductStockBadge`'s "as of" time and the catalogue's time label now read "2:49 AM", not "02:49 AM", on a 12-hour clock, like `SyncStatus` and the orders list.
- 3cf5452: Follow-ups to the 401/403 split (#345):

  - **Vendure:** a signed-in user missing a permission (confirmed by the session probe) is now `ConnectorUnauthorizedError` with `status: 403`, the `forbidden` notice, instead of a plain transient error.
  - **WooCommerce:** a 403 from the JWT-auth plugin (`jwt_auth_*`) reaches the till only with a valid token on WCPOS 1.10.0–1.10.7 (wcpos/woocommerce-pos#1863). It is now `WooPluginUpdateRequiredError` (`unsupported_store`, WCPOS 1.10.8): the store owner updates WCPOS, and the till is never sent into a sign-in loop.
  - **`ConnectorUnauthorizedError`:** only a 403 is `forbidden`. A caller that omits `status` gets `unauthorized`, as before 3.0.
  - **Docs:** the customer picker's `onError`, the replication guide's error classes, and the connector comments now say that only a 401 means sign in again.

- 6278d8d: The register outbox can start when its store opens, as the order outbox does (#290). The new `useRegisterOutbox({ commands, transport, deviceId, isEnabled?, onResult?, backendNotFound? })` runs `createRegisterOutbox` over an already-open `register_commands` collection, and calls `start()` so that till updates left pending (after a refused batch, for instance) go out when the app reopens. It returns `{ state, flush }`. A new collection or device id restarts the outbox, and `commands: null` leaves it idle. Apps that create the register outbox themselves should switch to this hook. `SyncStatus`'s till-updates refusal line now ends "…with the next till update, or when the app is reopened.", matching the sales line.
- cbf26fd: The WooCommerce connector sends WCPOS's protocol signal, so a WCPOS 2.0 store does not refuse it (#296). Every request carries `X-WCPOS-Protocol: 2` and `X-WCPOS-Client: tallyui/<connector version>`. WCPOS's 2.0 gate refuses POS-marked `wcpos/v2` requests without protocol 2, and protocol 2 is a pure declaration the connector already conforms to. The headers are harmless on WCPOS 1.x.

  If a store still answers 426 (`wcpos_update_required`), the new `WooTillUpdateRequiredError` (`till_update_required`, fixed by the till) stops the product pull after one request. `SyncStatus` then tells the cashier: "Products aren't updating: this till needs updating."

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
- Updated dependencies [d6a5073]
- Updated dependencies [eb5a032]
- Updated dependencies [54ee98a]
- Updated dependencies [27d736e]
- Updated dependencies [e59ebec]
- Updated dependencies [2ecaa36]
- Updated dependencies [901fa66]
- Updated dependencies [bf2d805]
- Updated dependencies [130d28e]
- Updated dependencies [9e1032f]
- Updated dependencies [eb203b4]
- Updated dependencies [8cd7860]
- Updated dependencies [ca0beac]
- Updated dependencies [af623c9]
- Updated dependencies [ef2f64e]
- Updated dependencies [d225c58]
- Updated dependencies [d329193]
- Updated dependencies [a9cdfc0]
- Updated dependencies [9ffa7c0]
- Updated dependencies [6bbd1ba]
- Updated dependencies [5c90aed]
- Updated dependencies [668f71f]
- Updated dependencies [457162d]
- Updated dependencies [c00e1ea]
- Updated dependencies [222543b]
- Updated dependencies [8141c1c]
- Updated dependencies [c9798a3]
- Updated dependencies [581472f]
- Updated dependencies [8ae3c53]
- Updated dependencies [ce4f796]
- Updated dependencies [6673faf]
- Updated dependencies [9885075]
- Updated dependencies [c48e1dd]
- Updated dependencies [c26ead6]
- Updated dependencies [1f4d0ab]
- Updated dependencies [0e4c9cc]
- Updated dependencies [a94b255]
- Updated dependencies [df80ead]
- Updated dependencies [5ed6281]
- Updated dependencies [5a204a9]
- Updated dependencies [7d1bc98]
- Updated dependencies [3cf5452]
- Updated dependencies [8cf3ea4]
- Updated dependencies [6278d8d]
- Updated dependencies [37aad35]
- Updated dependencies [4122dc8]
- Updated dependencies [e15f389]
- Updated dependencies [ddd9e85]
  - @tallyui/core@3.0.0
  - @tallyui/pos@3.0.0
  - @tallyui/primitives@3.0.0
  - @tallyui/theme@3.0.0

## 3.0.0-next.2

### Patch Changes

- [#359](https://github.com/TallyUI/tallyui/pull/359) [`eb203b4`](https://github.com/TallyUI/tallyui/commit/eb203b4489c58111f10011e825edeff671627ec3) Thanks [@kilbot](https://github.com/kilbot)! - Review follow-ups with no behaviour change (#356, #358):

  - `SyncStatus` and `OrdersList` build their "since {time}" and "since about {time}" text with one shared helper.
  - `useRegisterOutbox`'s docs now say when `transport()` is called, and that the latest `isEnabled` and `onResult` are used without restarting the outbox.

- [#355](https://github.com/TallyUI/tallyui/pull/355) [`0e4c9cc`](https://github.com/TallyUI/tallyui/commit/0e4c9cc3f9cd329666bf3b565dd24614bafbb590) Thanks [@kilbot](https://github.com/kilbot)! - The "since" a cashier reads is a real time (#253). `OutboxState.stuck` (both outboxes) gains `firstFailedAt`: the wall-clock time the first failure of the current stuck run was answered, so an offline gap no longer moves it. `since` keeps its meaning, the clock's virtual start, and still drives the 15-minute threshold. `firstFailedAt` is kept in memory only. After a restart it is absent, and `SyncStatus` and `OrdersList` show the stored time instead, worded "since about 2:49 AM".

- [#353](https://github.com/TallyUI/tallyui/pull/353) [`e51f1b7`](https://github.com/TallyUI/tallyui/commit/e51f1b70f0631e8f3b3d061ebb5e3aadc759fc77) Thanks [@kilbot](https://github.com/kilbot)! - Times shown to a cashier no longer force a leading zero on the hour (#252): `ProductStockBadge`'s "as of" time and the catalogue's time label now read "2:49 AM", not "02:49 AM", on a 12-hour clock, like `SyncStatus` and the orders list.

- [#349](https://github.com/TallyUI/tallyui/pull/349) [`3cf5452`](https://github.com/TallyUI/tallyui/commit/3cf5452ba0f6a2f25e88c230201d0e0e68e2e5b5) Thanks [@kilbot](https://github.com/kilbot)! - Follow-ups to the 401/403 split (#345):

  - **Vendure:** a signed-in user missing a permission (confirmed by the session probe) is now `ConnectorUnauthorizedError` with `status: 403`, the `forbidden` notice, instead of a plain transient error.
  - **WooCommerce:** a 403 from the JWT-auth plugin (`jwt_auth_*`) reaches the till only with a valid token on WCPOS 1.10.0–1.10.7 (wcpos/woocommerce-pos#1863). It is now `WooPluginUpdateRequiredError` (`unsupported_store`, WCPOS 1.10.8): the store owner updates WCPOS, and the till is never sent into a sign-in loop.
  - **`ConnectorUnauthorizedError`:** only a 403 is `forbidden`. A caller that omits `status` gets `unauthorized`, as before 3.0.
  - **Docs:** the customer picker's `onError`, the replication guide's error classes, and the connector comments now say that only a 401 means sign in again.

- [#357](https://github.com/TallyUI/tallyui/pull/357) [`6278d8d`](https://github.com/TallyUI/tallyui/commit/6278d8d44f36d4c7f8601f1222807e510662a576) Thanks [@kilbot](https://github.com/kilbot)! - The register outbox can start when its store opens, as the order outbox does (#290). The new `useRegisterOutbox({ commands, transport, deviceId, isEnabled?, onResult?, backendNotFound? })` runs `createRegisterOutbox` over an already-open `register_commands` collection, and calls `start()` so that till updates left pending (after a refused batch, for instance) go out when the app reopens. It returns `{ state, flush }`. A new collection or device id restarts the outbox, and `commands: null` leaves it idle. Apps that create the register outbox themselves should switch to this hook. `SyncStatus`'s till-updates refusal line now ends "…with the next till update, or when the app is reopened.", matching the sales line.

- Updated dependencies [[`eb203b4`](https://github.com/TallyUI/tallyui/commit/eb203b4489c58111f10011e825edeff671627ec3), [`c48e1dd`](https://github.com/TallyUI/tallyui/commit/c48e1dd808622191fb97104ecd58cc8cde7dde0d), [`0e4c9cc`](https://github.com/TallyUI/tallyui/commit/0e4c9cc3f9cd329666bf3b565dd24614bafbb590), [`3cf5452`](https://github.com/TallyUI/tallyui/commit/3cf5452ba0f6a2f25e88c230201d0e0e68e2e5b5), [`6278d8d`](https://github.com/TallyUI/tallyui/commit/6278d8d44f36d4c7f8601f1222807e510662a576)]:
  - @tallyui/pos@3.0.0-next.2
  - @tallyui/core@3.0.0-next.2
  - @tallyui/primitives@3.0.0-next.2
  - @tallyui/theme@3.0.0-next.2

## 3.0.0-next.1

### Minor Changes

- [#342](https://github.com/TallyUI/tallyui/pull/342) [`8cf3ea4`](https://github.com/TallyUI/tallyui/commit/8cf3ea4a442a67ff0b229a6498503fd8b65a2ae5) Thanks [@kilbot](https://github.com/kilbot)! - A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

  - **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
    - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
    - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
    - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
  - **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
  - **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.

### Patch Changes

- Updated dependencies [[`7fee0c1`](https://github.com/TallyUI/tallyui/commit/7fee0c19d57eb45130549101e5dd32cf593fdeea), [`eb5a032`](https://github.com/TallyUI/tallyui/commit/eb5a0322fe11b55e9158fb3374be14a12ac6b78b), [`8cd7860`](https://github.com/TallyUI/tallyui/commit/8cd78603e7edd7dc237d55ec3bab7f7e950a3518), [`c26ead6`](https://github.com/TallyUI/tallyui/commit/c26ead66fd839d41d211f72f47079d408d7b975d), [`8cf3ea4`](https://github.com/TallyUI/tallyui/commit/8cf3ea4a442a67ff0b229a6498503fd8b65a2ae5), [`e15f389`](https://github.com/TallyUI/tallyui/commit/e15f389e077a535b06a65e00c3989e7a652d7990), [`ddd9e85`](https://github.com/TallyUI/tallyui/commit/ddd9e85008f43e780cc0ee3754463eb7aa819a2a)]:
  - @tallyui/core@3.0.0-next.1
  - @tallyui/pos@3.0.0-next.1
  - @tallyui/primitives@3.0.0-next.1
  - @tallyui/theme@3.0.0-next.1

## 3.0.0-next.0

### Minor Changes

- [#210](https://github.com/TallyUI/tallyui/pull/210) [`04905ef`](https://github.com/TallyUI/tallyui/commit/04905efd0c23a77159ce0682ed34df4567896bf0) Thanks [@kilbot](https://github.com/kilbot)! - `Catalogue` now applies the provider's reconciled stock overlay itself (tiles, search and the variant chooser agree), and `useStockOverlaid` and `useStockOverlayAsOf` are new.

- [#205](https://github.com/TallyUI/tallyui/pull/205) [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4) Thanks [@kilbot](https://github.com/kilbot)! - Add useSale.setCustomer and ReceiptData.header.customer, customerTraits, CustomerPicker, generic CustomerSelect/CustomerCard with traits overrides, CustomerForm.showAddress, and the receipt's customer line.

  CustomerSelect rows are now pressable, so choosing a result works on the web (it previously did nothing).

- [#245](https://github.com/TallyUI/tallyui/pull/245) [`130d28e`](https://github.com/TallyUI/tallyui/commit/130d28e31c135fd94f2c30fb32897a5b20a56ab0) Thanks [@kilbot](https://github.com/kilbot)! - A store that keeps answering 404 is no longer silent. After 3 consecutive 404 answers the order and register outboxes set `OutboxState.backendMissing: { since }` (when the first of them arrived), and `SyncStatus` tells the cashier in plain words that sales aren't reaching the online store and are saved on the till, with a detail line for the store owner, instead of showing `retrying (status_404)`; the stuck line shows the same words, with no raw code. `SyncStatus` takes an optional `pluginName` (default `'the POS plugin'`) for that detail. The outboxes keep retrying on their normal backoff, and orders stay pending, so a 404 during a deploy blip recovers on its own. The next answer that isn't a 404 clears it; an offline (`network`) retry changes nothing.
  Pass one `createBackendNotFound()` tracker as `backendNotFound` to both `createOrderOutbox` and `createRegisterOutbox` so their 404s count together and the notice shows once, whichever outbox meets it first; without it, each outbox keeps its own.

- [#212](https://github.com/TallyUI/tallyui/pull/212) [`9e1032f`](https://github.com/TallyUI/tallyui/commit/9e1032ff041a723ca320fb6bbcd9dabcd58d5e0b) Thanks [@kilbot](https://github.com/kilbot)! - One order the store keeps failing no longer stops every later sale. After 5 server-answered failures (offline never counts) the order outbox probes the pending queue one order per backoff interval, oldest first; once the store takes one, the orders whose probes failed are isolated and retried alone, and batching resumes. If no probe gets through, the store is down: nothing is isolated. Retries alternate between the batch (or the probe) and one due isolated order, one request per interval, so neither can starve the other, and isolated orders take turns. An order the store has kept failing for 15 minutes of answered time, on its own clock, is flagged as stuck and stays pending: `OutboxState.stuck`, with a per-order entry in `stuck.orders`, `useOrderOutbox`'s `stuckCommandIds`, `needsAttention`'s `stuckCommandIds` option, `OrdersList`'s `stuck` prop (each order with its own time and reason), and `SyncStatus`'s "Not syncing" line. An offline failure pauses every clock, and the store's next answer of any kind resumes them all; a flagged order stays flagged through an offline spell, since a paused clock keeps its answered time. The HTTP transport now reports a request that got no answer in time as `timeout`, which counts like a 503 and never pauses a clock, and keeps `network` for a store it could not reach.

- [#223](https://github.com/TallyUI/tallyui/pull/223) [`a9cdfc0`](https://github.com/TallyUI/tallyui/commit/a9cdfc03369dace3495838608d4ac7ceeae2ae07) Thanks [@kilbot](https://github.com/kilbot)! - Migrate pos_orders to version 4 with optional localWarnings and serverFailures. Record omitted customer details and dropped payment references on the stored order, and show these warnings in the orders list; serverFailures is declared for the next outbox update.

- [#191](https://github.com/TallyUI/tallyui/pull/191) [`c92e96e`](https://github.com/TallyUI/tallyui/commit/c92e96e82030175ca00fe0b5ad17750ae56f6102) Thanks [@kilbot](https://github.com/kilbot)! - ProductGrid renders a virtualized FlatList, with its props unchanged.

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

- [#289](https://github.com/TallyUI/tallyui/pull/289) [`a94b255`](https://github.com/TallyUI/tallyui/commit/a94b255f52b83c94639a6152ac8401b0edb02d98) Thanks [@kilbot](https://github.com/kilbot)! - `OutboxState` gains `rejected?: number`: the order outbox publishes the count of `pos_orders` the store refused (`syncStatus: 'rejected'`) wherever it publishes `pending`, so it rises when a batch result rejects an order and falls when `requeue()` sends one again. The register outbox leaves it unset. While `rejected` is above 0, `SyncStatus` never says "Sales are up to date.": its whole status line (label, polite live region and iOS announcement) is "1 sale needs attention · The online store refused it. Ask the store owner to look at the till's sync log." or "{n} sales need attention · The online store refused them. Ask the store owner to look at the till's sync log.", in place of the stuck and backend-missing sentences and the sending or retrying line. What else waits stays in the count: "1 sale needs attention, 5 waiting to sync · …" with other sales pending, "…, 2 till updates waiting to sync · …" with till updates, and "…, 5 sales and 2 till updates waiting to sync · …" with both. Below it, "Refused sales stay on this till under Needs attention, each with what to do next.", then the backend-missing detail when the store is missing. With `rejected` 0 or unset, nothing changes. When the store refused a whole batch (`refused` set, no sale carrying a code), the status line is the waiting count followed by " · The online store refused the last send. This till will try again with the next sale, or when the app is reopened." in place of the stuck or backend-missing sentence, and the sending or retrying line (which read "Retrying in 0 s.") is hidden; refused sales still outrank it. With only till updates waiting and the register outbox refused, it ends "…try again with the next till update." instead; with a sale waiting, the sales line wins.

- [#263](https://github.com/TallyUI/tallyui/pull/263) [`df80ead`](https://github.com/TallyUI/tallyui/commit/df80ead050072de985582e44c1a01c10d8ea9acd) Thanks [@kilbot](https://github.com/kilbot)! - `SyncStatus` takes an optional `registerState` (the register outbox's state): waiting till updates are counted ("1 till update waiting to sync", or named beside the sales), so it never says the sales are up to date while any wait, and with no sale waiting the backend-missing sentence says till updates aren't reaching the online store, or, once `registerState.stuck` is set, "Till updates haven't reached the online store since {time}. …". The backend-missing detail now reads "This till couldn't find {pluginName} on the online store. …". With nothing waiting, the line is only "Sales are up to date." (it replaces "All sales synced"), with no sending, retrying or problem text after it; if the store is missing, the detail reads "This till couldn't find {pluginName} on the online store the last time it checked. …". The status line's accessibility label is the whole visible line instead of "Sync status". The order and register outboxes let go of a shared `backendNotFound` tracker on `stop()` and take it up again on `start()` or `flush()`.

### Patch Changes

- [#273](https://github.com/TallyUI/tallyui/pull/273) [`ba63f04`](https://github.com/TallyUI/tallyui/commit/ba63f04ef725774ec762a34a619534abb3bf2339) Thanks [@kilbot](https://github.com/kilbot)! - `CommandWarning` gains `{ code: 'customer_ignored'; customerId: string }` (#266): a sale whose `customerId` doesn't resolve is kept as a guest sale. `knownWarnings` keeps it and `parseCommandResult` accepts it when `customerId` is 1 to 64 characters; the orders list renders it.

- [#281](https://github.com/TallyUI/tallyui/pull/281) [`24b74fd`](https://github.com/TallyUI/tallyui/commit/24b74fdfe39198c124cac707c31106affd7cc93b) Thanks [@kilbot](https://github.com/kilbot)! - `CommandWarning` gains `{ code: 'figures_mismatch'; fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor' | (string & {}); tillMinor: number; serverMinor: number }> }` (#257): one warning per sale listing each of the till's figures that differs from the server's own computation. `parseCommandResult` accepts it when `fields` is non-empty, each `field` is one of the three names with none repeated, and each entry's two values are different safe integers. `knownWarnings` applies the same rules but keeps a field name it doesn't know (any non-empty string), since a newer store may send one; the orders list renders it, an unknown field by its raw name.

- [#225](https://github.com/TallyUI/tallyui/pull/225) [`d6a5073`](https://github.com/TallyUI/tallyui/commit/d6a5073ad5792bce70238e2505c8cf766c8037bb) Thanks [@kilbot](https://github.com/kilbot)! - **The outbox freezes an order an older till stored before it first sends it** (`freezeSentForm`, which `finalizeOrder` uses too):

  - line names, discount labels and payment references are cut to 255 characters, but ids never are;
  - a customer email or id that `order.create` would refuse is left out;
  - the frozen form is written back, so the receipt and the store see the same bytes.

  So an order stored before the upgrade and still unsent is never refused as `invalid_payload`.

  **New type:** `SentOrder`, an `Order` whose customer id may be missing. The receipt stage, `buildReceiptData` and `Receipt` take it, and a plain `Order` still fits.

- [#207](https://github.com/TallyUI/tallyui/pull/207) [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1) Thanks [@kilbot](https://github.com/kilbot)! - `CommandWarning` gains `bridgeMinor` on `total_mismatch` and a new `tax_rate_mismatch` code, and the till now ignores warning codes it doesn't know (`knownWarnings`), instead of showing them as a store total.

- [#221](https://github.com/TallyUI/tallyui/pull/221) [`fd882bc`](https://github.com/TallyUI/tallyui/commit/fd882bc58d844063780e46ee454d6759afa3de4f) Thanks [@kilbot](https://github.com/kilbot)! - The stuck line says "no answer from the store" for a timeout.

- [#224](https://github.com/TallyUI/tallyui/pull/224) [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f) Thanks [@kilbot](https://github.com/kilbot)! - The order.create string lengths move from `payloadShapeErrors` to the new `payloadBoundErrors`, which `precheckCommand` calls after the replay lookup, so an applied order resent with a long title replays as `duplicate`; `payloadShapeErrors` keeps the types, the `customerId` and `sessionId` bounds and the NUL check. `useSale` applies a tender before logging a dropped reference, and `add()` refuses a product whose id or v3 tax code finalize would refuse; the tender's reference field caps at 255 characters. `finalizeOrder` now freezes the sent form (names and discount labels cut, an unsendable customer email or id left out) and `toOrderCreateEnvelope` sends the stored order unchanged, so every resend is byte-identical.

- [#222](https://github.com/TallyUI/tallyui/pull/222) [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8) Thanks [@kilbot](https://github.com/kilbot)! - The shared order.create shape check bounds string lengths and refuses NUL, and so does the v3 fiscal-figures check for its display and tax-code strings. The till cuts long names when it stores the order, refuses over-long pass-through references at finalize (and a payment reference as it's entered), refuses a searched or parked customer whose email or id the server would refuse, and validates the customer email at entry. Tills should ship this clamp before plugins adopt the new bounds, so no till sends a sale the server would now refuse.

- [#186](https://github.com/TallyUI/tallyui/pull/186) [`d225c58`](https://github.com/TallyUI/tallyui/commit/d225c5819954f7c3e91e0c9180cb634530304061) Thanks [@kilbot](https://github.com/kilbot)! - Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.

- [#318](https://github.com/TallyUI/tallyui/pull/318) [`6bbd1ba`](https://github.com/TallyUI/tallyui/commit/6bbd1ba88fe1f01fe20c52728fce81f55813b75f) Thanks [@kilbot](https://github.com/kilbot)! - Each sale records the tax rounding its figures were computed with (#287): `finalizeOrder` writes `taxRounding` on the stored order, the default (`per_order`, `half_away_from_zero`) included, and `custom` as `{ granularity: 'custom' }`. It is the till's own record and is never sent in `order.create`. The Z report splits each sale's tax by rate with the strategy that sale recorded, so its rows are the receipts' rows, and its `breakdowns.tax_rounding_mixed` is `true` when a session's sales used more than one strategy (a `custom` sale counts as the default it applied); `ClosureSheet` then says so, and `buildClosureDocument` carries the same line ready to print as `closure.tax_rounding_note` (`TAX_ROUNDING_MIXED_NOTE`), for the apps' closure templates. `PosOrder.taxRounding` is now required in the type.

  `pos_orders` moves to schema version 6: `taxRounding` is required, and the migration records the default on every older sale, the only rounding any earlier build used. Like version 5, this storage is one-way: an older build opens it but shows no orders, so never roll an app back across it (ADR-069). Before 3.0.0 ships, #242's OPFS upgrade proof is rerun against version 6.

- [#213](https://github.com/TallyUI/tallyui/pull/213) [`5c90aed`](https://github.com/TallyUI/tallyui/commit/5c90aed083d8245e12a645aafa9c9e6a3e7bbc61) Thanks [@kilbot](https://github.com/kilbot)! - `parseCommandResult` now accepts a `total_mismatch`'s `bridgeMinor` and the `tax_rate_mismatch` warning code, so a plugin replaying a stored v3 result no longer fails. `knownWarnings` is lenient about a bad optional `bridgeMinor` (dropping just that field, not the whole warning) and about a non-array `warnings` value. `OrdersList`'s rounding line now reads "Store calculated …; a rounding line of … brought it to …". `Catalogue` keeps its input array's identity when the stock overlay changes nothing, and takes the latest of `lastStockCheckAt`, the provider's `stockOverlayAsOf` and `lastSyncedAt` for its "stock as of" time.

- [#314](https://github.com/TallyUI/tallyui/pull/314) [`c00e1ea`](https://github.com/TallyUI/tallyui/commit/c00e1ea553060e70c1ebcc16ab63f7793adab034) Thanks [@kilbot](https://github.com/kilbot)! - `OrdersList` shows a rejected sale's refusal in the cashier's words, one sentence per error code (#269), in both Needs attention and Recent, and never the store's own message. An unknown code, or a rejected sale with no error, shows `platform_error`'s sentence: "The online store refused this sale. Ask the store owner to look at the till's sync log." An `idempotency_mismatch` shows its sentence ("… Don't send it again; ask the store owner to compare the two.") in place of the old "This sale needs checking against the store before it can be sent again." line, and still has no Retry. The order outbox logs every refusal once to the sync log as "Order refused by the store" with the order id, the code and the store's message: a warning, or an error for `unsupported_version` (whose log previously used the message itself as its text).

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

- [#271](https://github.com/TallyUI/tallyui/pull/271) [`d6079b4`](https://github.com/TallyUI/tallyui/commit/d6079b47eedfacd6b12324bd426cf29bcd789757) Thanks [@kilbot](https://github.com/kilbot)! - `SyncStatus` inserts the plugin name and times literally (a `$&`, `$1` or `$$` in them is kept as written), and with only till updates waiting shows the register outbox's sending and retrying text and countdown. It shows no raw reason code: a stuck order now shows the "Sales haven't reached the online store since {time}." sentence (for till updates alone, "Till updates haven't …"), store missing or not. Sending and retrying are a short line of their own below the status line: "Sending…" or "Retrying in {n} s.". The status line and each pull-notice line are polite live regions (`aria-live="polite"` on web, `accessibilityLiveRegion` on Android) and on iOS are announced when their text changes, both in one announcement when they change together. What is announced is only the substance (counts, the sentence, the notice): the sending or retrying line is outside any live region, so it is never announced. `OrdersList` shows no reason code either: a stuck order reads "Hasn't reached the online store since {time}." with the hour numeric, and a rejected order shows the store's message alone (nothing when it has none), never its error code.

- [#299](https://github.com/TallyUI/tallyui/pull/299) [`cbf26fd`](https://github.com/TallyUI/tallyui/commit/cbf26fd25ae98e4289548d1ef556fefe272a4124) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce connector sends WCPOS's protocol signal, so a WCPOS 2.0 store does not refuse it (#296). Every request carries `X-WCPOS-Protocol: 2` and `X-WCPOS-Client: tallyui/<connector version>`. WCPOS's 2.0 gate refuses POS-marked `wcpos/v2` requests without protocol 2, and protocol 2 is a pure declaration the connector already conforms to. The headers are harmless on WCPOS 1.x.

  If a store still answers 426 (`wcpos_update_required`), the new `WooTillUpdateRequiredError` (`till_update_required`, fixed by the till) stops the product pull after one request. `SyncStatus` then tells the cashier: "Products aren't updating: this till needs updating."

- Updated dependencies [[`4de75c2`](https://github.com/TallyUI/tallyui/commit/4de75c2e844d53fdbccd40c4ad4d4004a0641f57), [`894b6ae`](https://github.com/TallyUI/tallyui/commit/894b6aec27fcc157e65e68fee1f8134ef201712f), [`04905ef`](https://github.com/TallyUI/tallyui/commit/04905efd0c23a77159ce0682ed34df4567896bf0), [`faa7cda`](https://github.com/TallyUI/tallyui/commit/faa7cda925c6ca52e47357bd09d920813051c62b), [`9f34416`](https://github.com/TallyUI/tallyui/commit/9f34416619db35733ef85d98b225be5c046d12d5), [`fb57e1d`](https://github.com/TallyUI/tallyui/commit/fb57e1d8d97c3e03603a3bcc49470ce73bdb3b6d), [`898e98b`](https://github.com/TallyUI/tallyui/commit/898e98ba31387bbece8b79c5c0cc50d27f8cd3af), [`75c5dce`](https://github.com/TallyUI/tallyui/commit/75c5dced41a1c99da03614304fc87adad4bc684c), [`ba63f04`](https://github.com/TallyUI/tallyui/commit/ba63f04ef725774ec762a34a619534abb3bf2339), [`0d04d13`](https://github.com/TallyUI/tallyui/commit/0d04d13eff8a3bf7aed7cf747464e145a74dea35), [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4), [`24b74fd`](https://github.com/TallyUI/tallyui/commit/24b74fdfe39198c124cac707c31106affd7cc93b), [`d6a5073`](https://github.com/TallyUI/tallyui/commit/d6a5073ad5792bce70238e2505c8cf766c8037bb), [`54ee98a`](https://github.com/TallyUI/tallyui/commit/54ee98a583d5543538fb0641aa322a87e5f8cfaf), [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1), [`e59ebec`](https://github.com/TallyUI/tallyui/commit/e59ebecfc580bc5bca706c8e37fc825281a88cef), [`2ecaa36`](https://github.com/TallyUI/tallyui/commit/2ecaa3661eae0ad8ec5d0ce3a344dc24262f387b), [`901fa66`](https://github.com/TallyUI/tallyui/commit/901fa666f4ab345bf07b2d6b38c6e5dc58596f39), [`bf2d805`](https://github.com/TallyUI/tallyui/commit/bf2d805334c83d4f20f408e185add336331de38e), [`130d28e`](https://github.com/TallyUI/tallyui/commit/130d28e31c135fd94f2c30fb32897a5b20a56ab0), [`9e1032f`](https://github.com/TallyUI/tallyui/commit/9e1032ff041a723ca320fb6bbcd9dabcd58d5e0b), [`ca0beac`](https://github.com/TallyUI/tallyui/commit/ca0beacdafb14f3b5cae7c7593de23ed82b0d2d5), [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f), [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8), [`d225c58`](https://github.com/TallyUI/tallyui/commit/d225c5819954f7c3e91e0c9180cb634530304061), [`d329193`](https://github.com/TallyUI/tallyui/commit/d3291935ba99dcdea00134157604404790bbecdb), [`a9cdfc0`](https://github.com/TallyUI/tallyui/commit/a9cdfc03369dace3495838608d4ac7ceeae2ae07), [`9ffa7c0`](https://github.com/TallyUI/tallyui/commit/9ffa7c0400664baba9667f0e4354631229cbc464), [`6bbd1ba`](https://github.com/TallyUI/tallyui/commit/6bbd1ba88fe1f01fe20c52728fce81f55813b75f), [`5c90aed`](https://github.com/TallyUI/tallyui/commit/5c90aed083d8245e12a645aafa9c9e6a3e7bbc61), [`668f71f`](https://github.com/TallyUI/tallyui/commit/668f71f6cf06af4a41fe686e98546f25e2e191ee), [`457162d`](https://github.com/TallyUI/tallyui/commit/457162d04dcd3c6f588cdb6ab90efea36081f4df), [`c00e1ea`](https://github.com/TallyUI/tallyui/commit/c00e1ea553060e70c1ebcc16ab63f7793adab034), [`222543b`](https://github.com/TallyUI/tallyui/commit/222543b8c9130d2c79a294603195940143bd611c), [`8141c1c`](https://github.com/TallyUI/tallyui/commit/8141c1cb1591a8b8299ffc00fe4f9a77a7cd8289), [`c9798a3`](https://github.com/TallyUI/tallyui/commit/c9798a334557a75495211f85edfdfaca68966667), [`581472f`](https://github.com/TallyUI/tallyui/commit/581472f659593568b98e50d91ad7c150478567b6), [`8ae3c53`](https://github.com/TallyUI/tallyui/commit/8ae3c53e0af89cf38ad8208362d75b08ae007093), [`ce4f796`](https://github.com/TallyUI/tallyui/commit/ce4f796aff7c739cb555b61f9a167cc803d8b5c2), [`6673faf`](https://github.com/TallyUI/tallyui/commit/6673fafcc682e825c94cfc66932da07cabd24e35), [`9885075`](https://github.com/TallyUI/tallyui/commit/98850759e9531a13b004a6be7be1115392f46a1d), [`1f4d0ab`](https://github.com/TallyUI/tallyui/commit/1f4d0ab8006f41586740195831aaa0c9adc17f15), [`a94b255`](https://github.com/TallyUI/tallyui/commit/a94b255f52b83c94639a6152ac8401b0edb02d98), [`df80ead`](https://github.com/TallyUI/tallyui/commit/df80ead050072de985582e44c1a01c10d8ea9acd), [`5ed6281`](https://github.com/TallyUI/tallyui/commit/5ed62816fe28a3ef3b001600b9d6a08de22d4a7e), [`5a204a9`](https://github.com/TallyUI/tallyui/commit/5a204a949e33f53d6087845d59e4bab1fe4a1474), [`7d1bc98`](https://github.com/TallyUI/tallyui/commit/7d1bc98b842258d67f6d5d380bc925e16e649ca2), [`37aad35`](https://github.com/TallyUI/tallyui/commit/37aad3527391b99b50515386bc76a569ee13460a), [`4122dc8`](https://github.com/TallyUI/tallyui/commit/4122dc8e1bbe97a62af35c93fed9d72a1067705f)]:
  - @tallyui/core@3.0.0-next.0
  - @tallyui/pos@3.0.0-next.0
  - @tallyui/primitives@3.0.0-next.0
  - @tallyui/theme@3.0.0-next.0

## 2.0.0

### Major Changes

- [#23](https://github.com/TallyUI/tallyui/pull/23) [`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b) Thanks [@kilbot](https://github.com/kilbot)! - **Breaking:** the cart and checkout components are presentational and take `Money`. `CartLine` takes `name`, `quantity`, `unitPrice` and `lineTotal`. `CartTotal` takes `subtotal`, `taxLines`, `discount` and `total`. `CashTendered` and `ChangeDisplay` take `Money` amounts. All of them format with `formatMoney`, so there is no `getPrice`, float arithmetic or hard-coded `'$'`. `CartPanel` is generic, and `CartLineItem` is removed. Totals come from `@tallyui/pos`; the components no longer compute tax. The cash input keeps the text as typed and emits integer minor units.

  `@tallyui/core` adds `moneyFromDecimalString`, which parses typed decimal text into `Money` using integer arithmetic.

### Minor Changes

- [#136](https://github.com/TallyUI/tallyui/pull/136) [`0b1237f`](https://github.com/TallyUI/tallyui/commit/0b1237fc6e84505bd8403f8d0ffe7c5a0e9600fc) Thanks [@kilbot](https://github.com/kilbot)! - `CartPanel`'s footer (totals, pay button) now stays pinned to the bottom of the panel at every height, on web and native, instead of being pushed off screen by a tall list of lines. `CartPanel` also gains an `afterItems` slot, rendered inside the scrolling region after the last line, for content like discount chips.

- [#148](https://github.com/TallyUI/tallyui/pull/148) [`a80e053`](https://github.com/TallyUI/tallyui/commit/a80e053f498c034296a5d0e721daace205aeb158) Thanks [@kilbot](https://github.com/kilbot)! - `Catalogue` takes an optional `minCodeLength` prop (a till's barcode-scanner setting). When set, Enter on a search query shorter than `minCodeLength` (after trimming) no longer does a barcode/SKU lookup — it leaves the typed text as a plain search instead of selecting an entry. Unset, behaviour is unchanged. A scanner's timing threshold stays the app's own concern, in its unfocused wedge listener.

- [#175](https://github.com/TallyUI/tallyui/pull/175) [`a9b77fe`](https://github.com/TallyUI/tallyui/commit/a9b77fe4b512cf7820ccbd07898408e1e8a59cc6) Thanks [@kilbot](https://github.com/kilbot)! - One close in flight per register. `useRegisterSession`'s `closeSession` joins a close already running for the same register, in any hook instance, and returns its closure (the joining call's `counted`, `approvedBy` and `approvedByName` are ignored), so a tap during a close no longer starts a second, overlapping one. The hook returns a new `closing` flag, true while that close is in flight. `RegisterColumn` keeps the count slot up while closing instead of flashing the Finish-closing card, whose button now has `nativeID="register-column-finish-close-button"`. `describeRegisterBarPill` takes `closing` and returns the new `'Close not finished'` pill for a closed session that isn't closing, right after 'Choose a register' and ahead of 'Offline'; `RegisterBar` passes `register.closing`.

- [#174](https://github.com/TallyUI/tallyui/pull/174) [`160252c`](https://github.com/TallyUI/tallyui/commit/160252c0b2415b60ac73fcb06ac5920db0df098e) Thanks [@kilbot](https://github.com/kilbot)! - `ClosureSheet` shows who approved the close (`Approved by {name}`, falling back to the approver id without a name) under the figures, blind or not — it's provenance, not a counted figure. `RegisterColumn` offers "Finish closing" when `useRegisterSession`'s session is closed but its closure row was never written (an interrupted close), resuming the close (the store keeps the count persisted on the session) instead of falling through to the cart, where `openSession` would otherwise refuse with `RegisterCloseIncompleteError`. `buildClosureDocument`'s return type now carries `closure.unsynced_count: number` and each movement's `id`/`reason` as `string`, without a cast; no runtime output changed.

- [#107](https://github.com/TallyUI/tallyui/pull/107) [`f132a68`](https://github.com/TallyUI/tallyui/commit/f132a68fa1cc4dd1c221706991c4059a0dc3c53c) Thanks [@kilbot](https://github.com/kilbot)! - `ConnectorStatus` gains `unsoldCount`, `unsoldStale` and `formatUnsold` props, showing how many products the sales channel doesn't sell (the calculated-price runner's `unreported`) below `lastSync`, using the `warning` token when current and `muted-foreground` when stale.

- [#149](https://github.com/TallyUI/tallyui/pull/149) [`1e2ee56`](https://github.com/TallyUI/tallyui/commit/1e2ee56248d1aee2287fa9af48845e35cafdacac) Thanks [@kilbot](https://github.com/kilbot)! - A failed save can now end in Continue once its order is confirmed stored. `useOrderOutbox` gains `isStored(order)`, and `record` now treats an order stored with the same `id` and money-bearing content (`sameSale`, new) as stored whatever its `commandId`, so a Retry after a requeue no longer fails forever; other content throws the new `OrderContentMismatchError`. `useSale` takes an optional `isStored` and exposes `canContinue` and `continueSale()`; `Tender` renders Continue when `canContinue` is true. `newSale()` is now refused while a failed or running save's order isn't confirmed stored; a refusal during a running save asks `isStored` again, so a hung save whose order is stored can still Continue. A confirmed order is never handed to `onSaleCompleted` again (#147's background re-hand is gone). `saleLogger` and `outboxLogger` are now exported.

- [#132](https://github.com/TallyUI/tallyui/pull/132) [`7c69fce`](https://github.com/TallyUI/tallyui/commit/7c69fce5ed409b4e6ee0b8693ef49382658574c5) Thanks [@kilbot](https://github.com/kilbot)! - `order.display` gains `lines` and `orderDiscountMinor` (ADR-063). Each line shows its amount before any discount, with its own discounts as sub-rows, all in the display mode. The order discounts appear as one row, not allocated to the lines. Every discount row is its own-mode amount converted on its own, so it's exact. `display.subtotalMinor` is now derived from the total and the discount rows, so `Σ lines === subtotalMinor` and `Σ sub-rows + orderDiscountMinor === discountMinor` hold exactly. Single-mode carts show the same figures as before; mixed-mode carts can shift by about a cent, carried by the last converted line's amount.

  `ReceiptLineItem` gains `displayAmountMinor` and `displayDiscounts`, and `ReceiptData` gains `orderDiscountMinor`. Print these above the subtotal. `lineTotalMinor` is unchanged: it's after every discount and is kept for existing readers.

  `CartTotal` now orders its rows Subtotal / Discount / Tax / Total, matching the receipt, and takes an optional `taxInclusive`, which labels the tax rows "incl." instead of adding them.

- [#65](https://github.com/TallyUI/tallyui/pull/65) [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e) Thanks [@kilbot](https://github.com/kilbot)! - `@tallyui/core` adds `resolvePriceRange(variants, currency?)`, the lowest and
  highest current price across a product's variants. `ProductPrice` uses it to
  show `from <lowest price>` when a product's variants are priced differently,
  instead of just the default variant's price. New `showFromPrice` (default
  `true`) and `fromLabel` (default `'from'`) props control and opt out of this.

- [#141](https://github.com/TallyUI/tallyui/pull/141) [`6a4e80d`](https://github.com/TallyUI/tallyui/commit/6a4e80d050ccb9b10278dacc0973921c18e6f441) Thanks [@kilbot](https://github.com/kilbot)! - Lifted medusapos's product catalogue, receipt, print-style hook and sync status into `@tallyui/components` (`Catalogue`, `Receipt`, `injectPrintStyle`, `SyncStatus`), so every platform POS gets the same screens (ADR-052, TV6b). `Catalogue` takes an optional `hour12?: boolean` (undefined keeps the locale default) instead of reading `expo-localization`. `Receipt` takes `store: { name: string; address?: string }` instead of a Medusa-shaped settings type, an optional `topInset?: number` (default 0) instead of an app-local strip-height context, an optional `formatDate?: (iso: string) => string` defaulting to an `Intl.DateTimeFormat` formatter, and an optional `taxLabel?: (ratePpm: number) => string` with the same default as `Cart`'s (TV6a), keeping the `incl. ` prefix rule. `searchProducts`, `catalogueEntries`, `findEntryByCode` and `variantPriceLabel` join `buildReceiptData` on the pure-function allow-list components may import from `@tallyui/pos` (ADR-064).

- [#142](https://github.com/TallyUI/tallyui/pull/142) [`60a2218`](https://github.com/TallyUI/tallyui/commit/60a2218b26953397eeb46abb4c38a3a37c9ae1b2) Thanks [@kilbot](https://github.com/kilbot)! - Lifted medusapos's neutral outbox core so every platform POS records and sends sales the same way (ADR-052, TV7). `@tallyui/pos` gains `getDeviceId(storage, key)`, which keeps a UUIDv7 device id in web storage under the given key and falls back to one id per process; `needsAttention(orders)`, which picks rejected and applied-with-warnings orders, newest first; and `useOrderOutbox({ storeKey, open, transport, deviceId, onBusy?, onOpenError? })`, which opens the order store for `storeKey`, runs its outbox and returns `{ orders, state, recent, record, flush, requeue }`. `@tallyui/components` gains `OrdersList`, the "Needs attention" and "Recent" orders with a Retry button, taking `orders`, `onRetry`, an optional `formatDate` (default `Intl.DateTimeFormat`) and an optional `footer`. `needsAttention` joins the pure-function allow-list components may import from `@tallyui/pos` (ADR-064).

- [#139](https://github.com/TallyUI/tallyui/pull/139) [`3dd11f6`](https://github.com/TallyUI/tallyui/commit/3dd11f6e0fc33c8261b59a04c25b8f94a20c54e0) Thanks [@kilbot](https://github.com/kilbot)! - Lifted medusapos's cart, phone cart bar, discount form and tender screen into `@tallyui/components` (`Cart`, `CartBar`, `Tender`, `DiscountForm`, `DiscountChips`, `parseDiscount`, `discountLabel`), so every platform POS gets the same sale-column UI (ADR-052, TV6a). `Cart` takes an optional `taxLabel?: (ratePpm: number) => string` (default `` `Tax ${ratePpm / 10000}%` ``), since VAT isn't universal. `@tallyui/components` gains a runtime dependency on `@tallyui/pos`, for types and the pure `buildReceiptData` only — components still render from props alone.

- [#69](https://github.com/TallyUI/tallyui/pull/69) [`0ef1c7e`](https://github.com/TallyUI/tallyui/commit/0ef1c7e166ddcc9dc7d67570cd0fcafbc5302b38) Thanks [@kilbot](https://github.com/kilbot)! - ADR-061: `startLiveTab` (`@tallyui/database`) coordinates exactly one live tab per store over a Web Lock and a `BroadcastChannel`. A new tab asks the live tab to hand over; the live tab may delay while busy, then parks and releases the lock; a tab that gets no acknowledgement is blocked and must be closed. `LiveTabScreen` (`@tallyui/components`) renders the parked and blocked screens, with translatable label props. On platforms without Web Locks (React Native, Node), a tab is simply live at once.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a) Thanks [@kilbot](https://github.com/kilbot)! - Build the product components on the neutral traits. `ProductPrice` resolves the price list and formats it with Intl in the price's own currency (new `currency` and `locale` props; `currencySymbol` is now only the fallback for an unknown currency). `ProductStockBadge` reads `getStock`. `ProductImage` gains `showPlaceholder`, an initial tile for products without images. Core adds `formatMoney`, a `traitContext` prop on `ConnectorProvider` for store-level facts like the store currency, and `useTraitContext`. `@tallyui/pos` adds `searchProducts`, name/SKU/barcode search through traits that works the same on every backend.

- [#144](https://github.com/TallyUI/tallyui/pull/144) [`e692c40`](https://github.com/TallyUI/tallyui/commit/e692c40ec78afbf2cd2ede633568206366dab1bc) Thanks [@kilbot](https://github.com/kilbot)! - `pos_orders` goes to schema version 2 (ADR-032, ADR-065). It adds three optional fields: `lateSessionId`, and ADR-065's `display` and `taxByRate`, which nothing writes yet. Apps must adopt this release's `addPosOrderCollection`, which migrates `pos_orders` to version 2 from version 0 or 1 without dropping an order.

  A sale whose session refuses the stamp in `useSale().complete()` (the session closed or went missing) is no longer stopped, because the money has been taken. It goes on to `onSaleCompleted` and the receipt with `lateSessionId` set and no `sessionId`, so no closure counts it, and a `late-sale` register fact is recorded. `needsAttention` now also selects any order with `lateSessionId`, and `OrdersList` explains it: "Taken after the register closed. It is not in that register's closure."

- [#76](https://github.com/TallyUI/tallyui/pull/76) [`e225222`](https://github.com/TallyUI/tallyui/commit/e22522233a75845682525181d35ec3f0e2e72824) Thanks [@kilbot](https://github.com/kilbot)! - `ProductPrice` gains a `formatFrom` prop, `(price: string) => string`, for languages whose word order puts the "from" label after the price (`formatFrom={(p) => \`${p} ab\`}`renders`€10.00 ab`); `fromLabel`stays as a deprecated alias. Visible change: every price — the regular price, the "from" range and the sale price — now uses the theme's`text-price`(or`text-sale`) token instead of `text-foreground`. Apps with screenshot tests covering `ProductPrice` will need to re-shoot them.

- [#167](https://github.com/TallyUI/tallyui/pull/167) [`62eef0f`](https://github.com/TallyUI/tallyui/commit/62eef0f21a5213740dce8884f6cf00f60c7b8fd7) Thanks [@kilbot](https://github.com/kilbot)! - Register-selection screen nits (ADR-032 amendment 1, medusapos adopting `451a0ca`): `RegisterPicker`'s rows now size to their content, with a minimum height, instead of clipping the "Not opened" second line at a fixed `h-11`; `RegisterPicker` and `OpenRegisterCard` no longer hard-code `flex-1`, taking their existing `className` from the caller instead (TallyUI's own `RegisterColumn` still passes `flex-1` where it mounts them); `RegisterPanel`'s sales count now pluralises correctly ("1 sale this session", not "1 sales"); and `OpenRegisterCard`'s amount label names the currency, matching `MovementSheet`'s "Amount (€)" ("Cash in the drawer to start (€)").

  Two new optional props for apps that need to put register controls elsewhere on the screen: `RegisterBar` takes an `onPressPill?: () => void` that turns its status pill into a button (opening the gate/picker or the panel), and `Catalogue` takes a `statusAccessory?: ReactNode` rendered at the end of its status line, alongside the status text, so a register control can sit there at phone width.

- [#164](https://github.com/TallyUI/tallyui/pull/164) [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588) Thanks [@kilbot](https://github.com/kilbot)! - Register screens (WCPOS `next` port, ADR-032), driven by `useRegisterSession`: `RegisterPicker`, `OpenRegisterCard`, `RegisterBar` (one status pill; "Register ›"), `MovementSheet` (labelled "Amount" and "Reason"; a reason for every movement; same-tick taps coalesced), `RegisterPanel` (expected in the drawer; Undo by reversal; blind mode hides amounts) and `RegisterColumn`. `@tallyui/core` adds `currencySymbol(currency, locale?)`.

- [#166](https://github.com/TallyUI/tallyui/pull/166) [`c65da52`](https://github.com/TallyUI/tallyui/commit/c65da52cf2207519cb19e0c1842751aeaf92b9fc) Thanks [@kilbot](https://github.com/kilbot)! - `RegisterCount` and `ClosureSheet` (WCPOS `next` port, ADR-032 amendment 1): denomination tiles counted in minor units (tap adds one, a 400ms hold adds ten), typing a cash amount clears the tiles, a live variance line hidden while blind, and Close gated by an optional `approve` prop above `varianceThreshold` (refused with an exact message without one). `ClosureSheet` shows the local closure number and, unless blind, the counted figures and variance per tender.

- [#55](https://github.com/TallyUI/tallyui/pull/55) [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5) Thanks [@kilbot](https://github.com/kilbot)! - Stock reads use the reconciled overlay (ADR-060) and show how fresh it is. `@tallyui/core` now holds `withStockOverlay` and `getProductStock` (`@tallyui/pos` re-exports them), adds `STOCK_LEVELS_LAST_PASS`, `stockOverlay` and `stockOverlayAsOf` props on `ConnectorProvider`, and a `useProductStock(doc)` hook that returns overlay stock plus `asOf`, or `getStock(doc)` when no overlay is given. `@tallyui/database`: `startStockReconcile` also returns `state$` (`running`, `truncated`, `lastError`, `lastCompletedAt`), `reconcileStock()` resolves with `completedAt`, and each successful pass stores `{ completedAt }` in the `last-pass` local document of `stock_levels`, which `createTallyDatabase` now creates with local documents (apps that create the collection themselves use the new `stockLevelsCollection` config; without local documents a pass rejects with a clear error); a restarted runner seeds `lastCompletedAt` from it. `@tallyui/pos` adds `stockOverlayAsOf$`. `ProductStockBadge` reads stock through `useProductStock` and appends " · as of <time>" when an overlay is given (`showAsOf={false}` hides it).

- [#96](https://github.com/TallyUI/tallyui/pull/96) [`93658cd`](https://github.com/TallyUI/tallyui/commit/93658cd0c0d12bdb519d5ac76c0e2cfa20184dbb) Thanks [@kilbot](https://github.com/kilbot)! - `StoreSettingsChoiceScreen`: the picker the app shows when `storeSettings` rejects with `choice_required` (TV4), for a store with several regions, countries or sales channels — medusa-dev's one region with 7 countries always hits this. Renders a radio-row section per choice offered, pre-selects a single-option section or a matching `initial` value, and calls `onSubmit` with the picked fields once every shown section has a selection.

- [#12](https://github.com/TallyUI/tallyui/pull/12) [`fe65b33`](https://github.com/TallyUI/tallyui/commit/fe65b33cf20f357296a96ffb45622447cc37f412) Thanks [@kilbot](https://github.com/kilbot)! - Add createSvgIcon and SearchIcon, and replace the SearchInput text glyph with an SVG magnifier. react-native-svg >=15 is now a peer dependency.

- [#104](https://github.com/TallyUI/tallyui/pull/104) [`bc46d99`](https://github.com/TallyUI/tallyui/commit/bc46d9903af3641836ae32c906542789e510496d) Thanks [@kilbot](https://github.com/kilbot)! - `ProductGrid` hides products this channel doesn't sell (`traits.isSellable`
  false, for example a Medusa product outside the sales channel) unless
  `showUnsellable` is set, and `ProductCard` shows such a product in a muted
  "Not sold here" state instead of its price. `OrderBuilder.addProduct` now
  refuses an unsellable product before looking up its price, instead of
  throwing the unrelated "No price in …" error.

### Patch Changes

- [#168](https://github.com/TallyUI/tallyui/pull/168) [`670d3b8`](https://github.com/TallyUI/tallyui/commit/670d3b89c4f139276d3c902705e1eb04bdc959c6) Thanks [@kilbot](https://github.com/kilbot)! - The register approval gate is enforced in `useRegisterSession`'s `closeSession`, not only in `RegisterCount`: over `varianceThreshold`, a close without `approvedBy` throws the new `RegisterApprovalRequiredError` before any write, blind mode included. `closeSession` takes `approvedBy` and `approvedByName`, and they reach the Z (`breakdowns.approved_by`, `approved_by_name`); the store's `closeSession` takes `approvedBy`. `useRegisterSession`'s `register` option accepts `null` while its host opens. `closeNeedsApproval` is the shared "over threshold" rule. `RegisterCount` passes `approve()`'s `approvedBy` and `approvedByName` to `closeSession`, and shows the hook's refusal with the same copy.

- [#137](https://github.com/TallyUI/tallyui/pull/137) [`314d1fc`](https://github.com/TallyUI/tallyui/commit/314d1fc30a02091489b1ccec2909508d979b2969) Thanks [@kilbot](https://github.com/kilbot)! - `CartPanel` rows now default to keying by the item's `id` (string or number), falling back to index only for items without one, instead of always keying by index — so removing a line above another with an open inline form (e.g. a per-line discount editor) no longer remounts and loses that form's state. Pass `keyExtractor` to override.

- [#169](https://github.com/TallyUI/tallyui/pull/169) [`6c9a176`](https://github.com/TallyUI/tallyui/commit/6c9a176988cea949b3d213af48baba5aacc2e392) Thanks [@kilbot](https://github.com/kilbot)! - `Catalogue`'s status text now truncates to a single line (with an ellipsis) when `statusAccessory` is set, instead of wrapping to three lines at phone width and pushing the accessory (e.g. a register pill) out of place. Without `statusAccessory`, the status text still wraps as before.

- [#43](https://github.com/TallyUI/tallyui/pull/43) [`f1e2a02`](https://github.com/TallyUI/tallyui/commit/f1e2a0273d25e5492336394ffb9cc5505ebcfdfc) Thanks [@kilbot](https://github.com/kilbot)! - Status badges use foreground text on their tint (the dot carries the colour), since coloured text on a 15% tint of itself fails WCAG AA; the refunded order badge uses the destructive token instead of the undefined `danger`. Search, cart-note and customer inputs take their placeholder colour from the `muted-foreground` token.

- [#37](https://github.com/TallyUI/tallyui/pull/37) [`12b7723`](https://github.com/TallyUI/tallyui/commit/12b7723041f2297c86525e2ddbab3f39d8bdfa1f) Thanks [@kilbot](https://github.com/kilbot)! - Order cards, receipt preview, register summary, settings groups, connector status, variant picker, cash-tendered input, cart note and customer form used the undefined `bg-surface` class and rendered transparent; they now use `bg-card`.

- [#88](https://github.com/TallyUI/tallyui/pull/88) [`5053527`](https://github.com/TallyUI/tallyui/commit/5053527066d9f9f49efff37ccf18ce2910518b89) Thanks [@kilbot](https://github.com/kilbot)! - no longer publishes test files

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d) Thanks [@kilbot](https://github.com/kilbot)! - Report product-level stock across all variants, showing the total quantity only when every variant has tracked, known stock.
  Draw the search magnifier with an attached, rounded handle and a larger ring.

- [#36](https://github.com/TallyUI/tallyui/pull/36) [`d1bc892`](https://github.com/TallyUI/tallyui/commit/d1bc8920968d6545bc14567fa2a8b47e6706514a) Thanks [@kilbot](https://github.com/kilbot)! - Light theme contrast: primary darkened to #5b5ef0 (white text 4.88:1), muted-foreground to #656c79 and input to #848a94 (control borders ≥ 3:1). Product cards and quick-tender buttons get borders, and components no longer use the undefined `bg-surface-alt` or `text-muted` text classes, so labels such as "Change Due" are legible.

- Updated dependencies [[`670d3b8`](https://github.com/TallyUI/tallyui/commit/670d3b89c4f139276d3c902705e1eb04bdc959c6), [`a9b77fe`](https://github.com/TallyUI/tallyui/commit/a9b77fe4b512cf7820ccbd07898408e1e8a59cc6), [`96bf8f7`](https://github.com/TallyUI/tallyui/commit/96bf8f79a47cd29b8b115ec46d070ce889750caa), [`160252c`](https://github.com/TallyUI/tallyui/commit/160252c0b2415b60ac73fcb06ac5920db0df098e), [`cbda7e0`](https://github.com/TallyUI/tallyui/commit/cbda7e00348b0d353fc53c13f1696455ad8d94eb), [`e103c71`](https://github.com/TallyUI/tallyui/commit/e103c71116a636c2cfd01903155b1e6da86a2d23), [`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b), [`50317c8`](https://github.com/TallyUI/tallyui/commit/50317c8520ebc04f2f6cdd47b9b9c6a0ed3efdd6), [`3e09957`](https://github.com/TallyUI/tallyui/commit/3e099573c771f130ffb6a5a3736527e908899257), [`1e2ee56`](https://github.com/TallyUI/tallyui/commit/1e2ee56248d1aee2287fa9af48845e35cafdacac), [`a219ae0`](https://github.com/TallyUI/tallyui/commit/a219ae03588234d6e1a685a9924b52e115dcb7d1), [`4df9be4`](https://github.com/TallyUI/tallyui/commit/4df9be400debddb67859482c17f9e68dadbf46d1), [`7c69fce`](https://github.com/TallyUI/tallyui/commit/7c69fce5ed409b4e6ee0b8693ef49382658574c5), [`2a0ca7f`](https://github.com/TallyUI/tallyui/commit/2a0ca7fe2d56d618d2a33b46704ffa2811a761bc), [`9649259`](https://github.com/TallyUI/tallyui/commit/96492599bdb93fa573f588ae84585dc027289da8), [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09), [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005), [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e), [`714b4bd`](https://github.com/TallyUI/tallyui/commit/714b4bd3f478fc89c7bbf5c455a88d307c53ef2d), [`f4a4d74`](https://github.com/TallyUI/tallyui/commit/f4a4d74d153f28bd2fdf46bb70984885e0b24166), [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8), [`60a2218`](https://github.com/TallyUI/tallyui/commit/60a2218b26953397eeb46abb4c38a3a37c9ae1b2), [`f09dbbc`](https://github.com/TallyUI/tallyui/commit/f09dbbcbb111d93b30b3cf7bc49b558b521845cf), [`350dd72`](https://github.com/TallyUI/tallyui/commit/350dd72708cc652bf6200010995379ae5816e93f), [`c664d4b`](https://github.com/TallyUI/tallyui/commit/c664d4b9145dc3b84f46e1026d0235a1e36aea39), [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17), [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99), [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a), [`7e489e0`](https://github.com/TallyUI/tallyui/commit/7e489e0488b75cd6e926bda5adf99230f770b8e7), [`f67535d`](https://github.com/TallyUI/tallyui/commit/f67535d358e337456505a4655a0d8977fab034fc), [`d921415`](https://github.com/TallyUI/tallyui/commit/d921415ed99a9ed20fa26cd5b79d6116240a2539), [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764), [`f1af98c`](https://github.com/TallyUI/tallyui/commit/f1af98ce0161ded267e873ead952e8d7deafe471), [`a7fdde8`](https://github.com/TallyUI/tallyui/commit/a7fdde8cf2d0c042365a50103084b6eeb3609ff6), [`5e5ba11`](https://github.com/TallyUI/tallyui/commit/5e5ba11b1c975b216d4c3ffc0eaceb7f26132ce1), [`5053527`](https://github.com/TallyUI/tallyui/commit/5053527066d9f9f49efff37ccf18ce2910518b89), [`47b9b4e`](https://github.com/TallyUI/tallyui/commit/47b9b4ed8da17be7f3494e82abcf00c590728769), [`64cb5e0`](https://github.com/TallyUI/tallyui/commit/64cb5e0f7a8ff263dffa4a685d326040826415c9), [`98ea990`](https://github.com/TallyUI/tallyui/commit/98ea99035693bd9a7b502ec79e64610c6ea7b765), [`55d52fa`](https://github.com/TallyUI/tallyui/commit/55d52fa73ce283a119d850a1d8858e066a7758ac), [`fbcaf59`](https://github.com/TallyUI/tallyui/commit/fbcaf59e067d7a66c81cdcbc900b6ef740063254), [`e692c40`](https://github.com/TallyUI/tallyui/commit/e692c40ec78afbf2cd2ede633568206366dab1bc), [`f2f386c`](https://github.com/TallyUI/tallyui/commit/f2f386cd14344536c0cef054ce93642f7bd43fe0), [`e7b2fa5`](https://github.com/TallyUI/tallyui/commit/e7b2fa5e08d4df3a7a8103d536771c1f4341dbb1), [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be), [`6444868`](https://github.com/TallyUI/tallyui/commit/644486864f66d829877898afade7e6726b1889fe), [`7502d61`](https://github.com/TallyUI/tallyui/commit/7502d61cc05441972a70dc6e493b50a993aaa00c), [`6ef7eb5`](https://github.com/TallyUI/tallyui/commit/6ef7eb50cc7bd4c87a4440b06fe5ffb3073a7443), [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d), [`516850f`](https://github.com/TallyUI/tallyui/commit/516850fc9674f6f8fdcee262a5fb3862b444e78a), [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766), [`0988fc3`](https://github.com/TallyUI/tallyui/commit/0988fc3c0ea9ffd6cff2f981110982db8004fe2d), [`1d13699`](https://github.com/TallyUI/tallyui/commit/1d13699cb42f7b77a74af73971a0dad602b26896), [`9441c26`](https://github.com/TallyUI/tallyui/commit/9441c26d079974451796a92ce3c4852dc17576a5), [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588), [`45e0b12`](https://github.com/TallyUI/tallyui/commit/45e0b128ad2930d57bffc2bd8f432a334c760fab), [`a58fcca`](https://github.com/TallyUI/tallyui/commit/a58fccaecdbbeb84d44d9347b2cda9817450b1cb), [`6281345`](https://github.com/TallyUI/tallyui/commit/6281345c5393ede25781f98625c19a8ee70b2159), [`0121559`](https://github.com/TallyUI/tallyui/commit/01215594f7fd15414c91b1d9333b0b9c6ba53309), [`b32d1b4`](https://github.com/TallyUI/tallyui/commit/b32d1b476a1d9592d8441b097877c875a4ba1e7c), [`93ed2cc`](https://github.com/TallyUI/tallyui/commit/93ed2cc93704dbeb9d9842fade18c77a5e2ed820), [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4), [`244bb46`](https://github.com/TallyUI/tallyui/commit/244bb46e51b4a85b0947049762bf8260893c4293), [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9), [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9), [`a9a4525`](https://github.com/TallyUI/tallyui/commit/a9a452501b29ddaf86f270bbdda6949e35356506), [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5), [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6), [`e7d3033`](https://github.com/TallyUI/tallyui/commit/e7d303348a24f9d7c042445f65b7f072dcd07f9d), [`ac2a24a`](https://github.com/TallyUI/tallyui/commit/ac2a24a147d1a759e7c5e28e73d0be90caa5e29b), [`787cada`](https://github.com/TallyUI/tallyui/commit/787cada220fa4f9d176a9052861a602dfaa61148), [`3e63452`](https://github.com/TallyUI/tallyui/commit/3e63452083b8c95212fe93555efe0d1f69e58f40), [`5bcabfb`](https://github.com/TallyUI/tallyui/commit/5bcabfbf55a823762a7ff58067437df412564bd8), [`d1bc892`](https://github.com/TallyUI/tallyui/commit/d1bc8920968d6545bc14567fa2a8b47e6706514a), [`12b7723`](https://github.com/TallyUI/tallyui/commit/12b7723041f2297c86525e2ddbab3f39d8bdfa1f), [`78cada7`](https://github.com/TallyUI/tallyui/commit/78cada7843c4a97bc5035e82d93ad91f8b90bd78), [`bc46d99`](https://github.com/TallyUI/tallyui/commit/bc46d9903af3641836ae32c906542789e510496d), [`fb6c2e3`](https://github.com/TallyUI/tallyui/commit/fb6c2e357448e24fad51020dccfca1b086ef47be), [`07e0198`](https://github.com/TallyUI/tallyui/commit/07e01985fec62060f984e9cfd58e78c6015141ce), [`8df0569`](https://github.com/TallyUI/tallyui/commit/8df0569d849f6099ec260eeb06e5c230172e12b5), [`38df38a`](https://github.com/TallyUI/tallyui/commit/38df38a0ac1325aa1089ae398d32362561aeeed8)]:
  - @tallyui/pos@2.0.0
  - @tallyui/core@2.0.0
  - @tallyui/primitives@2.0.0
  - @tallyui/theme@2.0.0

## 1.0.0

### Minor Changes

- [#4](https://github.com/TallyUI/tallyui/pull/4) [`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90) Thanks [@kilbot](https://github.com/kilbot)! - Initial npm release with build tooling

### Patch Changes

- Updated dependencies [[`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90)]:
  - @tallyui/core@0.2.0
  - @tallyui/theme@0.2.0
