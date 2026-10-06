# @tallyui/connector-woocommerce

## 3.0.3

### Patch Changes

- 1d8cbc0: catalogueEntries accepts a trait context and no longer requires getVariants (a product without it sells as one variant from its own traits); Catalogue passes its currency; connector-woocommerce adds getVariants for non-variable products (variable products need their variations synced, a later release).
- 843a06b: createWooCommandTransport sends the order outbox's order.create commands to WCPOS 1.10.x's wcpos/v2/push/orders as paid orders (one cash or card payment, tax-exclusive or untaxed stores; ADR-073).
- 21823a4: Variable products carry their variations, read from WCPOS 1.10.x's flat wcpos/v2/variations route (no per-product route exists there), so getVariants returns them (titled from their attribute options). The products collection schema goes to version 1, so the catalogue resyncs once.
  - @tallyui/core@3.0.3

## 3.0.2

### Patch Changes

- @tallyui/core@3.0.2

## 3.0.1

### Patch Changes

- d29d97d: Read WCPOS 1.10.x product uuids from the `_woocommerce_pos_uuid` meta and barcodes from `global_unique_id` when the top-level fields are absent, so the connector syncs from the released WCPOS Free plugin (1.10.20).
  - @tallyui/core@3.0.1

## 3.0.0

### Minor Changes

- 457162d: **One reconcile feed per store session** (#307, a release gate). The WooCommerce and Medusa reconcile feeds were module-level singletons, so after a store switch in one runtime, store A's queued tombstones and refetches could reach store B's database.

  - **New factories.** `createWooCommerceConnector()`, `createMedusaConnector()` and `createMedusaAdminUserConnector()` each build their own feed; `createVendureConnector(options)` already did. **Build a connector per store session**, anew on each sign-in or store change.
  - **Deprecated exports.** `woocommerceConnector`, `medusaConnector`, `medusaAdminUserConnector` and `vendureConnector` are deprecated: one instance for the whole app can leak queued reconcile work across stores. **They are removed in 4.0.**
  - **A development warning.** `startReplication` warns once when the same adapter object replicates into two collections at once.
  - **Refetch budget by requests.** `refetchBatchSize` on the reconcile adapters makes a page that enqueues `n` refetches take `ceil(n / refetchBatchSize)` request-budget slots (WooCommerce 100, Medusa 100, Vendure 1,000).
  - **WooCommerce 426 errors.** A foreign (non-WCPOS) 426 keeps the store's `code` beside its message, and the message is capped at 200 characters.

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

- ad18929: The WooCommerce connector names its auth failures, so the app can tell "sign in again" apart from "store broken": a 401 or 403 from the product pull rejects with `ConnectorUnauthorizedError` (re-exported from the connector, as Medusa does), and `auth.getHeaders` without a WCPOS token throws `WooMissingTokenError`, a subclass of `ConnectorUnauthorizedError`, instead of sending `Bearer undefined`. Other HTTP errors keep their message and class.
- 136343c: The WooCommerce connector gets a daily reconciliation pass (#248, part B), a safety net for edits the incremental pull can miss: the spring-forward hour, an over-excluding filter, a same-second edit, a shift without `X-WP-Total`, trashed or unpublished products, and stock written without a modified-time bump.

  - `reconcile.catalogue` lists the published catalogue with no date filter, comparing date, stock quantity and stock status. It re-reads deletion candidates by id and removes only those that are gone, trashed or unpublished. Everything else it re-pulls through the collection's own pull.
  - `replication.products` now combines the product pull with the reconcile feed, with `legacyKey: 'products'`, so existing installs keep their checkpoint.
  - A product the store cannot be asked about (no numeric id) is never deleted.
  - The WCPOS bulk-ID fast path is read from `wcpos/v2/status` `capabilities` (`products_id_fast_path`). It stays dormant until wcpos/woocommerce-pos#2113 ships.
  - `@tallyui/database`: the catalogue runner's gate check has a 60-second floor, so a bad interval can no longer re-arm it on every tick.

- ddd9e85: The WooCommerce catalogue reconcile uses the WCPOS products fast path (#313). When `wcpos/v2/status` lists `products_id_fast_path` in `capabilities`, the whole catalogue is listed in one request (`per_page=-1`, `_fields=id,date_modified_gmt,stock_quantity,stock_status`) instead of pages of 100. A store that refuses it, or answers with something that is not a list, is listed page by page in the same pass.

  - **Keyed on the remote id:** both WooCommerce listings key on the numeric product id, never the till-local uuid.
  - **`CatalogueReconcileAdapter.matchKey`** (core, optional): an adapter whose listing carries no primary key declares how to match a local document. The catalogue runner indexes the local documents by it for each pass. Deletion is unchanged: `confirmGone`, then the mass-delete brake, by primary key.
  - **`remote` on the keyed reconcile feed** (core, optional): a listed product the till does not hold yet is matched back by its remote id, so it is delivered rather than dropped.

- fb4b983: A `jwt_auth_*` 403 is now `WooTokenRefusedError` (`store_misconfigured`, `fixedBy: 'store'`, with a `fix`), replacing `WooPluginUpdateRequiredError` (#360). The old error told the store owner to update to WCPOS 1.10.8, but the same 403 also arrives on 1.10.8 and later, so the new one names no version: "The store refused the sign-in token (403). Ask the store owner to check the JWT Authentication plugin's settings, or pair the till again." `SyncStatus` shows "a setting on the online store needs changing" with the fix. **Breaking for importers:** `WooPluginUpdateRequiredError` is no longer exported.
- 508876e: The WooCommerce connector now requires **WooCommerce 5.8 or later** (for `modified_after` on the products route; `dates_are_gmt` arrived in 5.4).

  - **The GMT question goes to the store.** The product pull asks the store whether anything changed since the last pass, in GMT: the mark request sends `modified_after=<last mark>&dates_are_gmt=true`, and an empty answer ends the poll. Before, the pull compared the first row of a local-time sort, so in a daylight-saving fall-back hour an edit could wait until the next one.
  - **Stores that ignore the filter are refused.** If a store returns a product outside the requested window (WooCommerce before 5.8, or a proxy that drops the parameter), the pull throws the new `WooDateFilterError` (`code: 'unsupported_store'`) instead of trusting it.
  - **Dates carry no offset.** Dates are sent as GMT digits without an offset, because WordPress parses an offset-bearing date in the site's timezone before it compares it with the GMT column.
  - The connector has a README.

- 3b206d6: The connector now authenticates with a WCPOS bearer token and the `X-WCPOS: 1` header against `<site>/wp-json/wcpos/v2` (WCPOS Free 1.10.0 or later); the consumer key and secret fields are removed; a pulled product without a uuid throws `WooMissingUuidError`.
- cbf26fd: The WooCommerce connector sends WCPOS's protocol signal, so a WCPOS 2.0 store does not refuse it (#296). Every request carries `X-WCPOS-Protocol: 2` and `X-WCPOS-Client: tallyui/<connector version>`. WCPOS's 2.0 gate refuses POS-marked `wcpos/v2` requests without protocol 2, and protocol 2 is a pure declaration the connector already conforms to. The headers are harmless on WCPOS 1.x.

  If a store still answers 426 (`wcpos_update_required`), the new `WooTillUpdateRequiredError` (`till_update_required`, fixed by the till) stops the product pull after one request. `SyncStatus` then tells the cashier: "Products aren't updating: this till needs updating."

### Patch Changes

- 7fee0c1: A WooCommerce product whose uuid changed in the store is replaced on the till in one pass (#331). The till delivers it under its new uuid and removes the old copy. Before this fix, it removed the old copy and dropped the new one, so the product was missing until the next daily check, and it was removed without the usual by-id check.

  - **The reconcile feed:** when an entry that has a local copy is fetched back under a different primary key but the same remote id, the feed delivers that document as well as removing the old copy.
  - **`combinePullAdapters`** takes an optional `key` for resolving duplicates across its sub-adapters. It defaults to `doc.id`, as before. WooCommerce passes the uuid (its primary key): two documents that share a store id, such as a product's new copy and its old copy's removal, must both reach the collection.

- d225c58: Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.
- 1223353: A stale duplicate copy of a store product no longer stays on the till for good (#369). When two local products share one store id, the catalogue check now makes the copy its index did not pick a deletion candidate, and logs a `duplicate` event with the code `duplicate_match_key`. The copy is tombstoned only when `confirmGone` proves the store doesn't back it, and the mass-delete brake still applies. WooCommerce's `confirmGone` now also confirms a local whose id is live but whose uuid isn't the store's for that id. The store listing is the source of truth, and a later pull restores anything the store still backs.
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

- 3cf5452: Follow-ups to the 401/403 split (#345):

  - **Vendure:** a signed-in user missing a permission (confirmed by the session probe) is now `ConnectorUnauthorizedError` with `status: 403`, the `forbidden` notice, instead of a plain transient error.
  - **WooCommerce:** a 403 from the JWT-auth plugin (`jwt_auth_*`) reaches the till only with a valid token on WCPOS 1.10.0–1.10.7 (wcpos/woocommerce-pos#1863). It is now `WooPluginUpdateRequiredError` (`unsupported_store`, WCPOS 1.10.8): the store owner updates WCPOS, and the till is never sent into a sign-in loop.
  - **`ConnectorUnauthorizedError`:** only a 403 is `forbidden`. A caller that omits `status` gets `unauthorized`, as before 3.0.
  - **Docs:** the customer picker's `onError`, the replication guide's error classes, and the connector comments now say that only a 401 means sign in again.

- 8cf3ea4: A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

  - **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
    - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
    - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
    - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
  - **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
  - **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.

- d9ecbb8: Only WCPOS's own protocol gate counts as "this till needs updating" (#302):

  - **The plugin's gate:** a 426 whose body carries `code: "wcpos_update_required"` still raises `WooTillUpdateRequiredError`.
  - **Any other 426** (from a proxy or another plugin, or with no or another body) is now a transient error, retried with backoff, so it never tells a cashier to update the till.

  The built connector now bundles only its version from `package.json`, not the whole file.

- 154e552: The product pull sends `dates_are_gmt=true` with every `modified_after`, so WooCommerce compares the GMT checkpoint against `post_modified_gmt` instead of the store's local time; on a store west of UTC the next pull no longer skips edits made in between.
- 87087f1: When the catalogue check's fast path fails, or answers with something that is not a list, the page-by-page fallback now starts with an empty page (#331). Its first request then takes its own request-budget slot, as the status read does, instead of sharing the failed fast-path request's slot. A pass that falls back reports one more page.
- e0f0afb: The WooCommerce product pull makes one request per quiet poll in two more cases: after the most recently edited product is trashed (the store's newest product is then older than the pull's lower bound; it was 3 requests), and on a store with no products (it was 4). The stored `restarts` counter is gone: every shrink of the window restarts the pass, bounded by the per-call request budget. A stored checkpoint that still carries `restarts` keeps working.
- a0256e1: The product pull no longer skips products that share a `date_modified_gmt` second across a page boundary. It pulls in passes, like the Medusa connector: each pass fixes an inclusive lower bound (`modified_after` one second earlier), pages that window by product id with an offset, restarts if `X-WP-Total` drops between pages (after three restarts, a fresh pass starts in the same call), ends on a short or empty page when a proxy strips `X-WP-Total`, and moves the lower bound to the newest `date_modified_gmt` in the store when the pass began. Because RxDB does not store the checkpoint of a pull that returns no documents, the handler never carries state in an empty result: a pass that ends on an empty page chains into the next pass in the same call, and each call makes at most four requests. When nothing has changed since the last pass, the pull makes one small request and returns nothing. `WooProductCheckpoint` is now `{ modified, offset, pass_mark?, pass_count?, restarts? }`; a stored `{ id, modified }` checkpoint is read as the start of a pass.
- b8aba84: The product pull marks every product whose `status` is not `publish` (draft, pending, private, or none) as `_deleted`, so RxDB removes it from the POS catalogue, and a product that is published again comes back. The pull still reads every status through the modified-date cursor and sends no `status` parameter, so a product that goes from published to draft is seen and removed rather than left on the till.
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

### Patch Changes

- [#349](https://github.com/TallyUI/tallyui/pull/349) [`3cf5452`](https://github.com/TallyUI/tallyui/commit/3cf5452ba0f6a2f25e88c230201d0e0e68e2e5b5) Thanks [@kilbot](https://github.com/kilbot)! - Follow-ups to the 401/403 split (#345):

  - **Vendure:** a signed-in user missing a permission (confirmed by the session probe) is now `ConnectorUnauthorizedError` with `status: 403`, the `forbidden` notice, instead of a plain transient error.
  - **WooCommerce:** a 403 from the JWT-auth plugin (`jwt_auth_*`) reaches the till only with a valid token on WCPOS 1.10.0–1.10.7 (wcpos/woocommerce-pos#1863). It is now `WooPluginUpdateRequiredError` (`unsupported_store`, WCPOS 1.10.8): the store owner updates WCPOS, and the till is never sent into a sign-in loop.
  - **`ConnectorUnauthorizedError`:** only a 403 is `forbidden`. A caller that omits `status` gets `unauthorized`, as before 3.0.
  - **Docs:** the customer picker's `onError`, the replication guide's error classes, and the connector comments now say that only a 401 means sign in again.

- Updated dependencies [[`c48e1dd`](https://github.com/TallyUI/tallyui/commit/c48e1dd808622191fb97104ecd58cc8cde7dde0d), [`3cf5452`](https://github.com/TallyUI/tallyui/commit/3cf5452ba0f6a2f25e88c230201d0e0e68e2e5b5)]:
  - @tallyui/core@3.0.0-next.2

## 3.0.0-next.1

### Minor Changes

- [#330](https://github.com/TallyUI/tallyui/pull/330) [`ddd9e85`](https://github.com/TallyUI/tallyui/commit/ddd9e85008f43e780cc0ee3754463eb7aa819a2a) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce catalogue reconcile uses the WCPOS products fast path (#313). When `wcpos/v2/status` lists `products_id_fast_path` in `capabilities`, the whole catalogue is listed in one request (`per_page=-1`, `_fields=id,date_modified_gmt,stock_quantity,stock_status`) instead of pages of 100. A store that refuses it, or answers with something that is not a list, is listed page by page in the same pass.

  - **Keyed on the remote id:** both WooCommerce listings key on the numeric product id, never the till-local uuid.
  - **`CatalogueReconcileAdapter.matchKey`** (core, optional): an adapter whose listing carries no primary key declares how to match a local document. The catalogue runner indexes the local documents by it for each pass. Deletion is unchanged: `confirmGone`, then the mass-delete brake, by primary key.
  - **`remote` on the keyed reconcile feed** (core, optional): a listed product the till does not hold yet is matched back by its remote id, so it is delivered rather than dropped.

### Patch Changes

- [#333](https://github.com/TallyUI/tallyui/pull/333) [`7fee0c1`](https://github.com/TallyUI/tallyui/commit/7fee0c19d57eb45130549101e5dd32cf593fdeea) Thanks [@kilbot](https://github.com/kilbot)! - A WooCommerce product whose uuid changed in the store is replaced on the till in one pass (#331). The till delivers it under its new uuid and removes the old copy. Before this fix, it removed the old copy and dropped the new one, so the product was missing until the next daily check, and it was removed without the usual by-id check.

  - **The reconcile feed:** when an entry that has a local copy is fetched back under a different primary key but the same remote id, the feed delivers that document as well as removing the old copy.
  - **`combinePullAdapters`** takes an optional `key` for resolving duplicates across its sub-adapters. It defaults to `doc.id`, as before. WooCommerce passes the uuid (its primary key): two documents that share a store id, such as a product's new copy and its old copy's removal, must both reach the collection.

- [#342](https://github.com/TallyUI/tallyui/pull/342) [`8cf3ea4`](https://github.com/TallyUI/tallyui/commit/8cf3ea4a442a67ff0b229a6498503fd8b65a2ae5) Thanks [@kilbot](https://github.com/kilbot)! - A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

  - **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
    - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
    - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
    - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
  - **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
  - **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.

- Updated dependencies [[`7fee0c1`](https://github.com/TallyUI/tallyui/commit/7fee0c19d57eb45130549101e5dd32cf593fdeea), [`eb5a032`](https://github.com/TallyUI/tallyui/commit/eb5a0322fe11b55e9158fb3374be14a12ac6b78b), [`8cf3ea4`](https://github.com/TallyUI/tallyui/commit/8cf3ea4a442a67ff0b229a6498503fd8b65a2ae5), [`e15f389`](https://github.com/TallyUI/tallyui/commit/e15f389e077a535b06a65e00c3989e7a652d7990), [`ddd9e85`](https://github.com/TallyUI/tallyui/commit/ddd9e85008f43e780cc0ee3754463eb7aa819a2a)]:
  - @tallyui/core@3.0.0-next.1

## 3.0.0-next.0

### Minor Changes

- [#315](https://github.com/TallyUI/tallyui/pull/315) [`457162d`](https://github.com/TallyUI/tallyui/commit/457162d04dcd3c6f588cdb6ab90efea36081f4df) Thanks [@kilbot](https://github.com/kilbot)! - **One reconcile feed per store session** (#307, a release gate). The WooCommerce and Medusa reconcile feeds were module-level singletons, so after a store switch in one runtime, store A's queued tombstones and refetches could reach store B's database.

  - **New factories.** `createWooCommerceConnector()`, `createMedusaConnector()` and `createMedusaAdminUserConnector()` each build their own feed; `createVendureConnector(options)` already did. **Build a connector per store session**, anew on each sign-in or store change.
  - **Deprecated exports.** `woocommerceConnector`, `medusaConnector`, `medusaAdminUserConnector` and `vendureConnector` are deprecated: one instance for the whole app can leak queued reconcile work across stores. **They are removed in 4.0.**
  - **A development warning.** `startReplication` warns once when the same adapter object replicates into two collections at once.
  - **Refetch budget by requests.** `refetchBatchSize` on the reconcile adapters makes a page that enqueues `n` refetches take `ceil(n / refetchBatchSize)` request-budget slots (WooCommerce 100, Medusa 100, Vendure 1,000).
  - **WooCommerce 426 errors.** A foreign (non-WCPOS) 426 keeps the store's `code` beside its message, and the message is capped at 200 characters.

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

- [#228](https://github.com/TallyUI/tallyui/pull/228) [`ad18929`](https://github.com/TallyUI/tallyui/commit/ad1892916f57a79de120371d9d3450ae1fe8c907) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce connector names its auth failures, so the app can tell "sign in again" apart from "store broken": a 401 or 403 from the product pull rejects with `ConnectorUnauthorizedError` (re-exported from the connector, as Medusa does), and `auth.getHeaders` without a WCPOS token throws `WooMissingTokenError`, a subclass of `ConnectorUnauthorizedError`, instead of sending `Bearer undefined`. Other HTTP errors keep their message and class.

- [#305](https://github.com/TallyUI/tallyui/pull/305) [`136343c`](https://github.com/TallyUI/tallyui/commit/136343c74aaa647e4155c37b88f120cd406c68f1) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce connector gets a daily reconciliation pass (#248, part B), a safety net for edits the incremental pull can miss: the spring-forward hour, an over-excluding filter, a same-second edit, a shift without `X-WP-Total`, trashed or unpublished products, and stock written without a modified-time bump.

  - `reconcile.catalogue` lists the published catalogue with no date filter, comparing date, stock quantity and stock status. It re-reads deletion candidates by id and removes only those that are gone, trashed or unpublished. Everything else it re-pulls through the collection's own pull.
  - `replication.products` now combines the product pull with the reconcile feed, with `legacyKey: 'products'`, so existing installs keep their checkpoint.
  - A product the store cannot be asked about (no numeric id) is never deleted.
  - The WCPOS bulk-ID fast path is read from `wcpos/v2/status` `capabilities` (`products_id_fast_path`). It stays dormant until wcpos/woocommerce-pos#2113 ships.
  - `@tallyui/database`: the catalogue runner's gate check has a 60-second floor, so a bad interval can no longer re-arm it on every tick.

- [#244](https://github.com/TallyUI/tallyui/pull/244) [`508876e`](https://github.com/TallyUI/tallyui/commit/508876eb9f9d5203628f00aa048dd8ef6aea2547) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce connector now requires **WooCommerce 5.8 or later** (for `modified_after` on the products route; `dates_are_gmt` arrived in 5.4).

  - **The GMT question goes to the store.** The product pull asks the store whether anything changed since the last pass, in GMT: the mark request sends `modified_after=<last mark>&dates_are_gmt=true`, and an empty answer ends the poll. Before, the pull compared the first row of a local-time sort, so in a daylight-saving fall-back hour an edit could wait until the next one.
  - **Stores that ignore the filter are refused.** If a store returns a product outside the requested window (WooCommerce before 5.8, or a proxy that drops the parameter), the pull throws the new `WooDateFilterError` (`code: 'unsupported_store'`) instead of trusting it.
  - **Dates carry no offset.** Dates are sent as GMT digits without an offset, because WordPress parses an offset-bearing date in the site's timezone before it compares it with the GMT column.
  - The connector has a README.

- [#226](https://github.com/TallyUI/tallyui/pull/226) [`3b206d6`](https://github.com/TallyUI/tallyui/commit/3b206d60649bf1cf998f3f0ecfd1378243bd4d79) Thanks [@kilbot](https://github.com/kilbot)! - The connector now authenticates with a WCPOS bearer token and the `X-WCPOS: 1` header against `<site>/wp-json/wcpos/v2` (WCPOS Free 1.10.0 or later); the consumer key and secret fields are removed; a pulled product without a uuid throws `WooMissingUuidError`.

- [#299](https://github.com/TallyUI/tallyui/pull/299) [`cbf26fd`](https://github.com/TallyUI/tallyui/commit/cbf26fd25ae98e4289548d1ef556fefe272a4124) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce connector sends WCPOS's protocol signal, so a WCPOS 2.0 store does not refuse it (#296). Every request carries `X-WCPOS-Protocol: 2` and `X-WCPOS-Client: tallyui/<connector version>`. WCPOS's 2.0 gate refuses POS-marked `wcpos/v2` requests without protocol 2, and protocol 2 is a pure declaration the connector already conforms to. The headers are harmless on WCPOS 1.x.

  If a store still answers 426 (`wcpos_update_required`), the new `WooTillUpdateRequiredError` (`till_update_required`, fixed by the till) stops the product pull after one request. `SyncStatus` then tells the cashier: "Products aren't updating: this till needs updating."

### Patch Changes

- [#186](https://github.com/TallyUI/tallyui/pull/186) [`d225c58`](https://github.com/TallyUI/tallyui/commit/d225c5819954f7c3e91e0c9180cb634530304061) Thanks [@kilbot](https://github.com/kilbot)! - Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.

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

- [#308](https://github.com/TallyUI/tallyui/pull/308) [`d9ecbb8`](https://github.com/TallyUI/tallyui/commit/d9ecbb83be8f73962192ef19d27edbdb191e5c38) Thanks [@kilbot](https://github.com/kilbot)! - Only WCPOS's own protocol gate counts as "this till needs updating" (#302):

  - **The plugin's gate:** a 426 whose body carries `code: "wcpos_update_required"` still raises `WooTillUpdateRequiredError`.
  - **Any other 426** (from a proxy or another plugin, or with no or another body) is now a transient error, retried with backoff, so it never tells a cashier to update the till.

  The built connector now bundles only its version from `package.json`, not the whole file.

- [#227](https://github.com/TallyUI/tallyui/pull/227) [`154e552`](https://github.com/TallyUI/tallyui/commit/154e5521faa6bce5b6cf7515eccabf2f423c2acc) Thanks [@kilbot](https://github.com/kilbot)! - The product pull sends `dates_are_gmt=true` with every `modified_after`, so WooCommerce compares the GMT checkpoint against `post_modified_gmt` instead of the store's local time; on a store west of UTC the next pull no longer skips edits made in between.

- [#244](https://github.com/TallyUI/tallyui/pull/244) [`e0f0afb`](https://github.com/TallyUI/tallyui/commit/e0f0afbe00e23e00cd7d0cc8d6bf4338aff2611b) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce product pull makes one request per quiet poll in two more cases: after the most recently edited product is trashed (the store's newest product is then older than the pull's lower bound; it was 3 requests), and on a store with no products (it was 4). The stored `restarts` counter is gone: every shrink of the window restarts the pass, bounded by the per-call request budget. A stored checkpoint that still carries `restarts` keeps working.

- [#233](https://github.com/TallyUI/tallyui/pull/233) [`a0256e1`](https://github.com/TallyUI/tallyui/commit/a0256e100bec0a5139a84d15fef61ef51a3033f2) Thanks [@kilbot](https://github.com/kilbot)! - The product pull no longer skips products that share a `date_modified_gmt` second across a page boundary. It pulls in passes, like the Medusa connector: each pass fixes an inclusive lower bound (`modified_after` one second earlier), pages that window by product id with an offset, restarts if `X-WP-Total` drops between pages (after three restarts, a fresh pass starts in the same call), ends on a short or empty page when a proxy strips `X-WP-Total`, and moves the lower bound to the newest `date_modified_gmt` in the store when the pass began. Because RxDB does not store the checkpoint of a pull that returns no documents, the handler never carries state in an empty result: a pass that ends on an empty page chains into the next pass in the same call, and each call makes at most four requests. When nothing has changed since the last pass, the pull makes one small request and returns nothing. `WooProductCheckpoint` is now `{ modified, offset, pass_mark?, pass_count?, restarts? }`; a stored `{ id, modified }` checkpoint is read as the start of a pass.

- [#229](https://github.com/TallyUI/tallyui/pull/229) [`b8aba84`](https://github.com/TallyUI/tallyui/commit/b8aba849b08dbdc90ed31f7dfe3e916e40f58616) Thanks [@kilbot](https://github.com/kilbot)! - The product pull marks every product whose `status` is not `publish` (draft, pending, private, or none) as `_deleted`, so RxDB removes it from the POS catalogue, and a product that is published again comes back. The pull still reads every status through the modified-date cursor and sends no `status` parameter, so a product that goes from published to draft is seen and removed rather than left on the till.

- Updated dependencies [[`4de75c2`](https://github.com/TallyUI/tallyui/commit/4de75c2e844d53fdbccd40c4ad4d4004a0641f57), [`894b6ae`](https://github.com/TallyUI/tallyui/commit/894b6aec27fcc157e65e68fee1f8134ef201712f), [`04905ef`](https://github.com/TallyUI/tallyui/commit/04905efd0c23a77159ce0682ed34df4567896bf0), [`faa7cda`](https://github.com/TallyUI/tallyui/commit/faa7cda925c6ca52e47357bd09d920813051c62b), [`9f34416`](https://github.com/TallyUI/tallyui/commit/9f34416619db35733ef85d98b225be5c046d12d5), [`fb57e1d`](https://github.com/TallyUI/tallyui/commit/fb57e1d8d97c3e03603a3bcc49470ce73bdb3b6d), [`898e98b`](https://github.com/TallyUI/tallyui/commit/898e98ba31387bbece8b79c5c0cc50d27f8cd3af), [`75c5dce`](https://github.com/TallyUI/tallyui/commit/75c5dced41a1c99da03614304fc87adad4bc684c), [`ba63f04`](https://github.com/TallyUI/tallyui/commit/ba63f04ef725774ec762a34a619534abb3bf2339), [`0d04d13`](https://github.com/TallyUI/tallyui/commit/0d04d13eff8a3bf7aed7cf747464e145a74dea35), [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4), [`24b74fd`](https://github.com/TallyUI/tallyui/commit/24b74fdfe39198c124cac707c31106affd7cc93b), [`54ee98a`](https://github.com/TallyUI/tallyui/commit/54ee98a583d5543538fb0641aa322a87e5f8cfaf), [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1), [`e59ebec`](https://github.com/TallyUI/tallyui/commit/e59ebecfc580bc5bca706c8e37fc825281a88cef), [`2ecaa36`](https://github.com/TallyUI/tallyui/commit/2ecaa3661eae0ad8ec5d0ce3a344dc24262f387b), [`901fa66`](https://github.com/TallyUI/tallyui/commit/901fa666f4ab345bf07b2d6b38c6e5dc58596f39), [`bf2d805`](https://github.com/TallyUI/tallyui/commit/bf2d805334c83d4f20f408e185add336331de38e), [`ca0beac`](https://github.com/TallyUI/tallyui/commit/ca0beacdafb14f3b5cae7c7593de23ed82b0d2d5), [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f), [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8), [`5c90aed`](https://github.com/TallyUI/tallyui/commit/5c90aed083d8245e12a645aafa9c9e6a3e7bbc61), [`668f71f`](https://github.com/TallyUI/tallyui/commit/668f71f6cf06af4a41fe686e98546f25e2e191ee), [`457162d`](https://github.com/TallyUI/tallyui/commit/457162d04dcd3c6f588cdb6ab90efea36081f4df), [`222543b`](https://github.com/TallyUI/tallyui/commit/222543b8c9130d2c79a294603195940143bd611c), [`8141c1c`](https://github.com/TallyUI/tallyui/commit/8141c1cb1591a8b8299ffc00fe4f9a77a7cd8289), [`ce4f796`](https://github.com/TallyUI/tallyui/commit/ce4f796aff7c739cb555b61f9a167cc803d8b5c2), [`6673faf`](https://github.com/TallyUI/tallyui/commit/6673fafcc682e825c94cfc66932da07cabd24e35), [`1f4d0ab`](https://github.com/TallyUI/tallyui/commit/1f4d0ab8006f41586740195831aaa0c9adc17f15), [`5ed6281`](https://github.com/TallyUI/tallyui/commit/5ed62816fe28a3ef3b001600b9d6a08de22d4a7e), [`5a204a9`](https://github.com/TallyUI/tallyui/commit/5a204a949e33f53d6087845d59e4bab1fe4a1474), [`7d1bc98`](https://github.com/TallyUI/tallyui/commit/7d1bc98b842258d67f6d5d380bc925e16e649ca2)]:
  - @tallyui/core@3.0.0-next.0

## 2.0.0

### Major Changes

- [#15](https://github.com/TallyUI/tallyui/pull/15) [`807d8da`](https://github.com/TallyUI/tallyui/commit/807d8dafc973fa7d48ca564da0a5d41935b66f8f) Thanks [@kilbot](https://github.com/kilbot)! - Product replication adapters are now pull-only. The `push` handler is removed from `medusaProductReplication`, `wooProductReplication`, `vendureProductReplication` and `shopifyProductReplication`. Catalogue data is server-owned, so the POS never writes products. The old push handlers also turned every HTTP or network error into a fake conflict, which made RxDB silently revert local edits.

  This removes a public member. Nothing in TallyUI called it, but code that called `adapter.push` directly must stop doing so.

### Minor Changes

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99) Thanks [@kilbot](https://github.com/kilbot)! - Add backend-neutral price and stock traits. `ProductTraits` gains `getPrices` (a price list of integer minor-unit `Money` entries, `base` or `sale`, per currency) and `getStock` (`in_stock | out_of_stock | backorder | unknown` plus an optional quantity). Core adds `resolvePrice`, `moneyFromMajor`, `moneyToMajor` and `minorUnitDigits`. Every connector maps its own shape into them; WooCommerce's `instock`/`outofstock`/`onbackorder` strings now stay inside the WooCommerce connector. The string-price and WooCommerce-style stock accessors remain and are deprecated.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4) Thanks [@kilbot](https://github.com/kilbot)! - Add `isSellable` and `getVariantCount` product traits to core and all four connectors.

### Patch Changes

- [#88](https://github.com/TallyUI/tallyui/pull/88) [`5053527`](https://github.com/TallyUI/tallyui/commit/5053527066d9f9f49efff37ccf18ce2910518b89) Thanks [@kilbot](https://github.com/kilbot)! - no longer publishes test files

- Updated dependencies [[`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b), [`50317c8`](https://github.com/TallyUI/tallyui/commit/50317c8520ebc04f2f6cdd47b9b9c6a0ed3efdd6), [`3e09957`](https://github.com/TallyUI/tallyui/commit/3e099573c771f130ffb6a5a3736527e908899257), [`a219ae0`](https://github.com/TallyUI/tallyui/commit/a219ae03588234d6e1a685a9924b52e115dcb7d1), [`4df9be4`](https://github.com/TallyUI/tallyui/commit/4df9be400debddb67859482c17f9e68dadbf46d1), [`9649259`](https://github.com/TallyUI/tallyui/commit/96492599bdb93fa573f588ae84585dc027289da8), [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09), [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005), [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e), [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8), [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17), [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99), [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a), [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764), [`f1af98c`](https://github.com/TallyUI/tallyui/commit/f1af98ce0161ded267e873ead952e8d7deafe471), [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be), [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d), [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766), [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588), [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4), [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9), [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9), [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5), [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6), [`ac2a24a`](https://github.com/TallyUI/tallyui/commit/ac2a24a147d1a759e7c5e28e73d0be90caa5e29b), [`8df0569`](https://github.com/TallyUI/tallyui/commit/8df0569d849f6099ec260eeb06e5c230172e12b5)]:
  - @tallyui/core@2.0.0

## 1.0.0

### Minor Changes

- [#4](https://github.com/TallyUI/tallyui/pull/4) [`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90) Thanks [@kilbot](https://github.com/kilbot)! - Initial npm release with build tooling

### Patch Changes

- Updated dependencies [[`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90)]:
  - @tallyui/core@0.2.0
