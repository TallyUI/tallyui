# @tallyui/database

## 3.1.1

### Patch Changes

- Updated dependencies [63a7431]
  - @tallyui/core@3.1.1

## 3.1.0

### Patch Changes

- @tallyui/core@3.1.0

## 3.0.4

### Patch Changes

- @tallyui/core@3.0.4

## 3.0.3

### Patch Changes

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

- 2ecaa36: A replication adapter can set `pull.batchSize`, and the Medusa connector pulls 500 products per page.
- e77d552: A reconcile result now says whether its pass was complete, so a till never shows a partial pass's "0 not sold" as current (found by the Medusa POS app's 3.0.0-next.0 adoption).

  - **`complete`** on `CatalogueReconcileSummary`, `FingerprintReconcileResult` and `IdReconcileResult`: true when the pass ran from its first page to its last in one go, so `unlisted` and `unreported` are real counts. It is false for a resumed pass, whose counts are 0. For the fingerprint result, the pass must also have read at least one page.
  - **`lastCompleteAt`** on the runner's and the fingerprint wrapper's state: when the last complete pass finished. It is persisted with the runner's gate, and is available before the first pass after a restart.
  - **A failed pass that finished no page** is restarted rather than resumed. It re-reads from the first page anyway, so it now runs as a complete pass.

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

- ddd9e85: The WooCommerce catalogue reconcile uses the WCPOS products fast path (#313). When `wcpos/v2/status` lists `products_id_fast_path` in `capabilities`, the whole catalogue is listed in one request (`per_page=-1`, `_fields=id,date_modified_gmt,stock_quantity,stock_status`) instead of pages of 100. A store that refuses it, or answers with something that is not a list, is listed page by page in the same pass.

  - **Keyed on the remote id:** both WooCommerce listings key on the numeric product id, never the till-local uuid.
  - **`CatalogueReconcileAdapter.matchKey`** (core, optional): an adapter whose listing carries no primary key declares how to match a local document. The catalogue runner indexes the local documents by it for each pass. Deletion is unchanged: `confirmGone`, then the mass-delete brake, by primary key.
  - **`remote` on the keyed reconcile feed** (core, optional): a listed product the till does not hold yet is matched back by its remote id, so it is delivered rather than dropped.

### Patch Changes

- 539d2ff: The stock, id and fingerprint reconciles read and write in bounded chunks, so app queries don't wait behind a whole pass.
- d225c58: Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.
- 6f83dc5: The catalogue reconcile's mass-delete brake now explains itself in plain words. Its `kept` event with `reason: 'brake'` carries a `message` a till can show to the store owner, for example: "12 products the online store no longer lists were kept on this till: removing that many at once needs a check. If they were hidden or removed on purpose, the person who manages this till can allow the removal." The console warning uses the same words, plus a hint for developers (`allowMassDelete: true`).

  The WooCommerce tests now model WCPOS's "POS only products" setting, and pin that a product hidden from the POS after sync is removed from the till by the next reconcile pass, while a bulk hide is held by the brake.

- 1223353: A stale duplicate copy of a store product no longer stays on the till for good (#369). When two local products share one store id, the catalogue check now makes the copy its index did not pick a deletion candidate, and logs a `duplicate` event with the code `duplicate_match_key`. The copy is tombstoned only when `confirmGone` proves the store doesn't back it, and the mass-delete brake still applies. WooCommerce's `confirmGone` now also confirms a local whose id is live but whose uuid isn't the store's for that id. The store listing is the source of truth, and a later pull restores anything the store still backs.
- a8b58a4: The catalogue and fingerprint reconciles keep `lastCompleteAt` honest (#338).
  - The fingerprint reconcile's `state$` moves `lastCompleteAt` only on a pass whose result is complete. A pass that read no pages, which gives `complete: false`, no longer stamps it.
  - A new runner still shows the persisted value before its first pass.
  - The catalogue runner's start-up load now updates `lastCompleteAt` only when the stored value is newer, so a load that resolves after a pass has completed can't roll it back.
- 20b6321: A catalogue pass that yields no pages at all no longer counts (#368). It is not complete, it moves neither `lastCompleteAt` nor the schedule's last completed time, and the gate runs it again at the next check. A page with no entries still counts: that is an adapter reporting an empty catalogue. Before this, a restarted fingerprint reconcile could show a zero-page pass's time as its last complete one.
- 1f4d0ab: `isStorageWorkerStartError` and `isStorageWorkerFailure` also recognise RxDB's RM1, a stale storage worker built on another RxDB version (for example a cached old worker after an upgrade), so apps show their reload advice for it. Both call the new `isRxdbRemoteVersionMismatch` in `@tallyui/core`, which recognises RM1 by structure only: an RxError's own `code`, or the remote storage's `could not create instance ` wrapping of an RxError's JSON. `@tallyui/storage-sqlite` now has `@tallyui/core` as a peer dependency.
- 8cf3ea4: A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

  - **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
    - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
    - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
    - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
  - **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
  - **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.

- 136343c: The WooCommerce connector gets a daily reconciliation pass (#248, part B), a safety net for edits the incremental pull can miss: the spring-forward hour, an over-excluding filter, a same-second edit, a shift without `X-WP-Total`, trashed or unpublished products, and stock written without a modified-time bump.

  - `reconcile.catalogue` lists the published catalogue with no date filter, comparing date, stock quantity and stock status. It re-reads deletion candidates by id and removes only those that are gone, trashed or unpublished. Everything else it re-pulls through the collection's own pull.
  - `replication.products` now combines the product pull with the reconcile feed, with `legacyKey: 'products'`, so existing installs keep their checkpoint.
  - A product the store cannot be asked about (no numeric id) is never deleted.
  - The WCPOS bulk-ID fast path is read from `wcpos/v2/status` `capabilities` (`products_id_fast_path`). It stays dormant until wcpos/woocommerce-pos#2113 ships.
  - `@tallyui/database`: the catalogue runner's gate check has a 60-second floor, so a bad interval can no longer re-arm it on every tick.

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

- Updated dependencies [[`c48e1dd`](https://github.com/TallyUI/tallyui/commit/c48e1dd808622191fb97104ecd58cc8cde7dde0d), [`3cf5452`](https://github.com/TallyUI/tallyui/commit/3cf5452ba0f6a2f25e88c230201d0e0e68e2e5b5)]:
  - @tallyui/core@3.0.0-next.2

## 3.0.0-next.1

### Minor Changes

- [#336](https://github.com/TallyUI/tallyui/pull/336) [`e77d552`](https://github.com/TallyUI/tallyui/commit/e77d5521a33bfa31b83cd7b277fb473dff6107cb) Thanks [@kilbot](https://github.com/kilbot)! - A reconcile result now says whether its pass was complete, so a till never shows a partial pass's "0 not sold" as current (found by the Medusa POS app's 3.0.0-next.0 adoption).

  - **`complete`** on `CatalogueReconcileSummary`, `FingerprintReconcileResult` and `IdReconcileResult`: true when the pass ran from its first page to its last in one go, so `unlisted` and `unreported` are real counts. It is false for a resumed pass, whose counts are 0. For the fingerprint result, the pass must also have read at least one page.
  - **`lastCompleteAt`** on the runner's and the fingerprint wrapper's state: when the last complete pass finished. It is persisted with the runner's gate, and is available before the first pass after a restart.
  - **A failed pass that finished no page** is restarted rather than resumed. It re-reads from the first page anyway, so it now runs as a complete pass.

- [#330](https://github.com/TallyUI/tallyui/pull/330) [`ddd9e85`](https://github.com/TallyUI/tallyui/commit/ddd9e85008f43e780cc0ee3754463eb7aa819a2a) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce catalogue reconcile uses the WCPOS products fast path (#313). When `wcpos/v2/status` lists `products_id_fast_path` in `capabilities`, the whole catalogue is listed in one request (`per_page=-1`, `_fields=id,date_modified_gmt,stock_quantity,stock_status`) instead of pages of 100. A store that refuses it, or answers with something that is not a list, is listed page by page in the same pass.

  - **Keyed on the remote id:** both WooCommerce listings key on the numeric product id, never the till-local uuid.
  - **`CatalogueReconcileAdapter.matchKey`** (core, optional): an adapter whose listing carries no primary key declares how to match a local document. The catalogue runner indexes the local documents by it for each pass. Deletion is unchanged: `confirmGone`, then the mass-delete brake, by primary key.
  - **`remote` on the keyed reconcile feed** (core, optional): a listed product the till does not hold yet is matched back by its remote id, so it is delivered rather than dropped.

### Patch Changes

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

- [#192](https://github.com/TallyUI/tallyui/pull/192) [`2ecaa36`](https://github.com/TallyUI/tallyui/commit/2ecaa3661eae0ad8ec5d0ce3a344dc24262f387b) Thanks [@kilbot](https://github.com/kilbot)! - A replication adapter can set `pull.batchSize`, and the Medusa connector pulls 500 products per page.

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

### Patch Changes

- [#193](https://github.com/TallyUI/tallyui/pull/193) [`539d2ff`](https://github.com/TallyUI/tallyui/commit/539d2ff658a388163fa6902eaecbd60a1f798ac2) Thanks [@kilbot](https://github.com/kilbot)! - The stock, id and fingerprint reconciles read and write in bounded chunks, so app queries don't wait behind a whole pass.

- [#186](https://github.com/TallyUI/tallyui/pull/186) [`d225c58`](https://github.com/TallyUI/tallyui/commit/d225c5819954f7c3e91e0c9180cb634530304061) Thanks [@kilbot](https://github.com/kilbot)! - Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.

- [#320](https://github.com/TallyUI/tallyui/pull/320) [`6f83dc5`](https://github.com/TallyUI/tallyui/commit/6f83dc5802197ded0c049435fa2a4579b8819968) Thanks [@kilbot](https://github.com/kilbot)! - The catalogue reconcile's mass-delete brake now explains itself in plain words. Its `kept` event with `reason: 'brake'` carries a `message` a till can show to the store owner, for example: "12 products the online store no longer lists were kept on this till: removing that many at once needs a check. If they were hidden or removed on purpose, the person who manages this till can allow the removal." The console warning uses the same words, plus a hint for developers (`allowMassDelete: true`).

  The WooCommerce tests now model WCPOS's "POS only products" setting, and pin that a product hidden from the POS after sync is removed from the till by the next reconcile pass, while a bulk hide is held by the brake.

- [#280](https://github.com/TallyUI/tallyui/pull/280) [`1f4d0ab`](https://github.com/TallyUI/tallyui/commit/1f4d0ab8006f41586740195831aaa0c9adc17f15) Thanks [@kilbot](https://github.com/kilbot)! - `isStorageWorkerStartError` and `isStorageWorkerFailure` also recognise RxDB's RM1, a stale storage worker built on another RxDB version (for example a cached old worker after an upgrade), so apps show their reload advice for it. Both call the new `isRxdbRemoteVersionMismatch` in `@tallyui/core`, which recognises RM1 by structure only: an RxError's own `code`, or the remote storage's `could not create instance ` wrapping of an RxError's JSON. `@tallyui/storage-sqlite` now has `@tallyui/core` as a peer dependency.

- [#305](https://github.com/TallyUI/tallyui/pull/305) [`136343c`](https://github.com/TallyUI/tallyui/commit/136343c74aaa647e4155c37b88f120cd406c68f1) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce connector gets a daily reconciliation pass (#248, part B), a safety net for edits the incremental pull can miss: the spring-forward hour, an over-excluding filter, a same-second edit, a shift without `X-WP-Total`, trashed or unpublished products, and stock written without a modified-time bump.

  - `reconcile.catalogue` lists the published catalogue with no date filter, comparing date, stock quantity and stock status. It re-reads deletion candidates by id and removes only those that are gone, trashed or unpublished. Everything else it re-pulls through the collection's own pull.
  - `replication.products` now combines the product pull with the reconcile feed, with `legacyKey: 'products'`, so existing installs keep their checkpoint.
  - A product the store cannot be asked about (no numeric id) is never deleted.
  - The WCPOS bulk-ID fast path is read from `wcpos/v2/status` `capabilities` (`products_id_fast_path`). It stays dormant until wcpos/woocommerce-pos#2113 ships.
  - `@tallyui/database`: the catalogue runner's gate check has a 60-second floor, so a bad interval can no longer re-arm it on every tick.

- Updated dependencies [[`4de75c2`](https://github.com/TallyUI/tallyui/commit/4de75c2e844d53fdbccd40c4ad4d4004a0641f57), [`894b6ae`](https://github.com/TallyUI/tallyui/commit/894b6aec27fcc157e65e68fee1f8134ef201712f), [`04905ef`](https://github.com/TallyUI/tallyui/commit/04905efd0c23a77159ce0682ed34df4567896bf0), [`faa7cda`](https://github.com/TallyUI/tallyui/commit/faa7cda925c6ca52e47357bd09d920813051c62b), [`9f34416`](https://github.com/TallyUI/tallyui/commit/9f34416619db35733ef85d98b225be5c046d12d5), [`fb57e1d`](https://github.com/TallyUI/tallyui/commit/fb57e1d8d97c3e03603a3bcc49470ce73bdb3b6d), [`898e98b`](https://github.com/TallyUI/tallyui/commit/898e98ba31387bbece8b79c5c0cc50d27f8cd3af), [`75c5dce`](https://github.com/TallyUI/tallyui/commit/75c5dced41a1c99da03614304fc87adad4bc684c), [`ba63f04`](https://github.com/TallyUI/tallyui/commit/ba63f04ef725774ec762a34a619534abb3bf2339), [`0d04d13`](https://github.com/TallyUI/tallyui/commit/0d04d13eff8a3bf7aed7cf747464e145a74dea35), [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4), [`24b74fd`](https://github.com/TallyUI/tallyui/commit/24b74fdfe39198c124cac707c31106affd7cc93b), [`54ee98a`](https://github.com/TallyUI/tallyui/commit/54ee98a583d5543538fb0641aa322a87e5f8cfaf), [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1), [`e59ebec`](https://github.com/TallyUI/tallyui/commit/e59ebecfc580bc5bca706c8e37fc825281a88cef), [`2ecaa36`](https://github.com/TallyUI/tallyui/commit/2ecaa3661eae0ad8ec5d0ce3a344dc24262f387b), [`901fa66`](https://github.com/TallyUI/tallyui/commit/901fa666f4ab345bf07b2d6b38c6e5dc58596f39), [`bf2d805`](https://github.com/TallyUI/tallyui/commit/bf2d805334c83d4f20f408e185add336331de38e), [`ca0beac`](https://github.com/TallyUI/tallyui/commit/ca0beacdafb14f3b5cae7c7593de23ed82b0d2d5), [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f), [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8), [`5c90aed`](https://github.com/TallyUI/tallyui/commit/5c90aed083d8245e12a645aafa9c9e6a3e7bbc61), [`668f71f`](https://github.com/TallyUI/tallyui/commit/668f71f6cf06af4a41fe686e98546f25e2e191ee), [`457162d`](https://github.com/TallyUI/tallyui/commit/457162d04dcd3c6f588cdb6ab90efea36081f4df), [`222543b`](https://github.com/TallyUI/tallyui/commit/222543b8c9130d2c79a294603195940143bd611c), [`8141c1c`](https://github.com/TallyUI/tallyui/commit/8141c1cb1591a8b8299ffc00fe4f9a77a7cd8289), [`ce4f796`](https://github.com/TallyUI/tallyui/commit/ce4f796aff7c739cb555b61f9a167cc803d8b5c2), [`6673faf`](https://github.com/TallyUI/tallyui/commit/6673fafcc682e825c94cfc66932da07cabd24e35), [`1f4d0ab`](https://github.com/TallyUI/tallyui/commit/1f4d0ab8006f41586740195831aaa0c9adc17f15), [`5ed6281`](https://github.com/TallyUI/tallyui/commit/5ed62816fe28a3ef3b001600b9d6a08de22d4a7e), [`5a204a9`](https://github.com/TallyUI/tallyui/commit/5a204a949e33f53d6087845d59e4bab1fe4a1474), [`7d1bc98`](https://github.com/TallyUI/tallyui/commit/7d1bc98b842258d67f6d5d380bc925e16e649ca2)]:
  - @tallyui/core@3.0.0-next.0

## 2.0.0

### Major Changes

- [#71](https://github.com/TallyUI/tallyui/pull/71) [`14871a2`](https://github.com/TallyUI/tallyui/commit/14871a272e201dc11ed64ebc16a2c19dc6971e2d) Thanks [@kilbot](https://github.com/kilbot)! - **Breaking:** `getStorage()` on the web no longer returns Dexie. It throws with guidance to pass RxDB Premium's SQLite-wasm storage explicitly (`@tallyui/storage-sqlite/web`), bundling its worker entry — the web engine ADR-061 pins as `createTallyDatabase`'s target. Any app that relied on the Dexie default breaks; switching is a cold resync, not a data migration.

  **Breaking:** `multiInstance: true` now throws for every storage (ADR-061): the pinned web engine (opfs-sahpool) cannot share exclusive OPFS handles between tabs, so multi-instance is unsupported until job 3 removes the option along with #42's outbox code.

  **Breaking:** the storage deadline is now a watchdog. `withWriteDeadline`, `STORAGE_WRITE_DEADLINE_MS`, `StorageWorkerTimeoutError` and `isStorageWorkerTimeout` are removed; `isStorageWorkerFailure` now recognises only `StorageWorkerStartError`. `createTallyDatabase` wraps a storage marked `tallyEngine: 'sqlite-sahpool'` with `withStorageWatchdog`, following WCPOS (ADR-061), and no storage call is ever settled on a clock, because a timed-out write may still commit:

  - A write pending longer than 10s (`STORAGE_WRITE_STALL_MS`) is flagged as `stalled`, never rejected; its promise stays pending until the worker answers, and the status returns to `ok` once no stalled writes remain.
  - Reads are watched: two consecutive silent 30s windows (`STORAGE_READ_WATCHDOG_MS`), with reads pending and no storage call settling, set the status to `dead`, which is sticky. The recovery is to reload.
  - Creating the storage has no deadline, since the worker and wasm can be slow to download.

  `getStorageHealth(db)` returns the `Observable<StorageHealth>` (`{ status: 'ok' | 'stalled' | 'dead', stalledWrites, stalledSince? }`) for a database on that storage, and `undefined` for any other, so an app can show "saving is slow…" or "storage stopped, reload".

### Minor Changes

- [#99](https://github.com/TallyUI/tallyui/pull/99) [`9649259`](https://github.com/TallyUI/tallyui/commit/96492599bdb93fa573f588ae84585dc027289da8) Thanks [@kilbot](https://github.com/kilbot)! - `ReconcileFeedEntry` (core) gains `refreshOnly?: boolean`: a missing product is skipped instead of tombstoned when its entry is refresh-only, so only the id reconcile's braked entries can delete (ADR-060, backlog 43). Merging in `enqueue` keeps `refreshOnly` true only when every entry queued for that id was refresh-only, so a deletable id-reconcile entry is never downgraded by a later refresh-only one. The fingerprint runner (`startFingerprintReconcile`, database) now enqueues its entries this way; the id runner is unchanged.

  `FingerprintReconcileState` (database) gains `lastResultAt`/`lastErrorAt`, stamped from an injectable `now` (default `Date.now`), so a kept `lastResult` next to a newer `lastError` can be told apart from a current one. The new `isFingerprintResultCurrent(state)` helper does that comparison (backlog 46).

- [#85](https://github.com/TallyUI/tallyui/pull/85) [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09) Thanks [@kilbot](https://github.com/kilbot)! - Add the fingerprint reconcile (ADR-060 amendment 8): a neutral runner that compares a remote fingerprint per product against the local documents and re-delivers products whose fingerprint differs, through the collection's pull. `@tallyui/core` adds the `FingerprintReconcileAdapter` contract (`fetchPages`, a pure `fingerprint` and `enqueue`) and an optional `reconcile.prices` on `TallyConnector`. `@tallyui/database` adds `startFingerprintReconcile`, which runs no pass at start by default and otherwise mirrors the id reconcile: a complete, successful pass only, `state$` (`running`, `lastResult`, `lastError`), and `stop()`. `@tallyui/connector-medusa` adds `reconcile.prices`, a nightly base-price backstop (`MEDUSA_PRICE_RECONCILE_INTERVAL_MS`) for the variant feed (ADR-060 job D1): it fingerprints each product's base prices (variant id, currency and amount, sorted, price-list prices excluded) from `/admin/product-variants`. Nothing is written locally; corrections arrive only through the reconcile feed's pull.

- [#61](https://github.com/TallyUI/tallyui/pull/61) [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8) Thanks [@kilbot](https://github.com/kilbot)! - Add the id reconcile (ADR-060): a periodic pass that reads every live product id and its live variant ids, so a deleted product or a deleted variant (whose parent's `updatedAt` does not change) reaches the local copy. `@tallyui/core` adds the `IdReconcileAdapter` contract and `createReconcileFeed`, which turns queued corrections into a pull-only adapter meant as the last key of `combinePullAdapters`. `@tallyui/database` adds the `startIdReconcile` runner. `@tallyui/connector-vendure` implements the Vendure side and wires it into `replication.products` and `reconcile.ids`. Nothing is written locally into the replicated collection; corrections arrive only through the collection's own pull.

- [#69](https://github.com/TallyUI/tallyui/pull/69) [`0ef1c7e`](https://github.com/TallyUI/tallyui/commit/0ef1c7e166ddcc9dc7d67570cd0fcafbc5302b38) Thanks [@kilbot](https://github.com/kilbot)! - ADR-061: `startLiveTab` (`@tallyui/database`) coordinates exactly one live tab per store over a Web Lock and a `BroadcastChannel`. A new tab asks the live tab to hand over; the live tab may delay while busy, then parks and releases the lock; a tab that gets no acknowledgement is blocked and must be closed. `LiveTabScreen` (`@tallyui/components`) renders the parked and blocked screens, with translatable label props. On platforms without Web Locks (React Native, Node), a tab is simply live at once.

- [#92](https://github.com/TallyUI/tallyui/pull/92) [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17) Thanks [@kilbot](https://github.com/kilbot)! - Medusa prices as Medusa charges them (ADR-060 D2b). `SyncContext` gains an optional `pricingContext` (from `storeSettings()`), `ProductPrice` an optional `taxInclusive`, and `TallyConnector.reconcile` a `calculatedPrices` slot. With a pricing context, every Medusa product document build fills each variant's `calculated_price` from the store API (`null` when the sales channel or region does not sell it), and the traits price from it: sale lists as a sale against the original price, override lists as the base price, `null` as unsellable. `reconcile.calculatedPrices` re-delivers products whose calculated prices changed with no timestamp bump; run it every `MEDUSA_CALCULATED_PRICE_RECONCILE_INTERVAL_MS` (30 minutes) with `maxPages: 1000`. Without a pricing context, documents and prices are unchanged.

- [#63](https://github.com/TallyUI/tallyui/pull/63) [`d9fe1e3`](https://github.com/TallyUI/tallyui/commit/d9fe1e398b9bc790176b15c00caf8e73f0d5abdf) Thanks [@kilbot](https://github.com/kilbot)! - Fix the Medusa connector's incremental pull: Medusa 2.21 honours only the operator form `updated_at[$gte]`, and silently ignored the connector's `updated_at[gte]`, so every pass read the whole catalogue. Add the Medusa id reconcile (ADR-060), so a deleted product or a deleted variant (whose parent's `updated_at` does not change) now reaches the local copy through `replication.products` and `reconcile.ids`. `@tallyui/database` adds a mass-deletion brake to `startIdReconcile`: a pass that would tombstone more than `maxDeleteShare` (default 20%) of local products, and more than 10 of them, queues nothing and warns instead, unless `allowMassDelete` is set.

- [#102](https://github.com/TallyUI/tallyui/pull/102) [`7490a3f`](https://github.com/TallyUI/tallyui/commit/7490a3fbd3d0e4ef28efdb1f6205d33177ee6be2) Thanks [@kilbot](https://github.com/kilbot)! - A connector schema version bump now drops and resyncs its collection (ADR-060 amendment 9). `createTallyDatabase` adds RxDB's migration-schema plugin and gives each connector collection above version 0 a `v => null` strategy per earlier version, and `startReplication` appends `-v<version>` to the replication identifier above version 0, so the pull starts from no checkpoint. Version 0 collections keep their identifier and never resync. `stock_levels` and `pos_orders` are untouched.

  The Medusa products schema is now version 1 and declares `variants[].calculated_price` (object or `null`). **The first sync after upgrading resyncs the Medusa catalogue**: the stored products are dropped when the database opens and download again, once, on the first sync. A collection created with `medusaProductSchema` outside `createTallyDatabase` must use `connectorCollection(medusaProductSchema)` from `@tallyui/database`, which supplies the strategies and the migration plugin; otherwise RxDB throws COL12.

- [#74](https://github.com/TallyUI/tallyui/pull/74) [`0121559`](https://github.com/TallyUI/tallyui/commit/01215594f7fd15414c91b1d9333b0b9c6ba53309) Thanks [@kilbot](https://github.com/kilbot)! - Removes the unreleased multi-tab database machinery in favour of one live tab per store (ADR-061): `CreateDatabaseOptions.multiInstance` (`createTallyDatabase` always passes `multiInstance: false`), the `tally-outbox-flush` and `tally-outbox-state` local documents, and follower forwarding between tabs are all gone. The outbox's public API (`flush`, `requeue`, `start`, `stop`, `state$`) and its single-instance behaviour are unchanged. Apps enforce one live tab with `startLiveTab`.

  `@tallyui/storage-sqlite`'s worker now swallows the `ready` promise's rejection so a pool install failure before any `createStorageInstance` call doesn't surface as an unhandled rejection, and its `files` list no longer publishes test files, matching `@tallyui/database` and `@tallyui/pos`.

- [#55](https://github.com/TallyUI/tallyui/pull/55) [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5) Thanks [@kilbot](https://github.com/kilbot)! - Stock reads use the reconciled overlay (ADR-060) and show how fresh it is. `@tallyui/core` now holds `withStockOverlay` and `getProductStock` (`@tallyui/pos` re-exports them), adds `STOCK_LEVELS_LAST_PASS`, `stockOverlay` and `stockOverlayAsOf` props on `ConnectorProvider`, and a `useProductStock(doc)` hook that returns overlay stock plus `asOf`, or `getStock(doc)` when no overlay is given. `@tallyui/database`: `startStockReconcile` also returns `state$` (`running`, `truncated`, `lastError`, `lastCompletedAt`), `reconcileStock()` resolves with `completedAt`, and each successful pass stores `{ completedAt }` in the `last-pass` local document of `stock_levels`, which `createTallyDatabase` now creates with local documents (apps that create the collection themselves use the new `stockLevelsCollection` config; without local documents a pass rejects with a clear error); a restarted runner seeds `lastCompletedAt` from it. `@tallyui/pos` adds `stockOverlayAsOf$`. `ProductStockBadge` reads stock through `useProductStock` and appends " · as of <time>" when an overlay is given (`showAsOf={false}` hides it).

- [#53](https://github.com/TallyUI/tallyui/pull/53) [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6) Thanks [@kilbot](https://github.com/kilbot)! - Add a stock reconcile pass (ADR-060). `@tallyui/core` adds the `StockReconcileAdapter` contract (`fetchPages` and a pure `overlay`) and an optional `reconcile.stock` on `TallyConnector`. `@tallyui/database` adds the local-only `stock_levels` collection (`STOCK_LEVELS_COLLECTION`, `stockLevelsSchema`), which `createTallyDatabase` creates for connectors with `reconcile.stock`, and `startStockReconcile`, which re-reads stock every 5 minutes (and on demand through `reconcileStock()`) into that collection: it writes only changed rows, removes keys the backend no longer returns, writes nothing after a failed, truncated or stopped read, and never writes the replicated products. `@tallyui/pos` adds `stockOverlay$`, `withStockOverlay` and `getProductStock`, which read stock from the overlay where it has an entry and from the replicated product otherwise. The Vendure connector reconciles variant `stockLevels`, and the Medusa connector reconciles inventory item location levels, so stock changes that bump no product timestamp reach the POS.

### Patch Changes

- [#66](https://github.com/TallyUI/tallyui/pull/66) [`b029839`](https://github.com/TallyUI/tallyui/commit/b0298391812c454a67b8e583051fcb2a806a74f3) Thanks [@kilbot](https://github.com/kilbot)! - The id reconcile's mass-delete brake now also trips when every local product would be tombstoned, whatever the count, unless `allowMassDelete` is set. Previously the brake applied only above `MASS_DELETE_MINIMUM` (10) would-be tombstones, so a wrong channel token that made a shop of 10 or fewer products look empty could tombstone its whole catalogue.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`184901f`](https://github.com/TallyUI/tallyui/commit/184901fb0f6f20a4f9822068e1d8633b6bf2f542) Thanks [@kilbot](https://github.com/kilbot)! - `createTallyDatabase` now wraps its storage in the AJV schema validator in development. RxDB dev-mode refuses to create a database without one (error DVM1), so every app using the default options failed at startup.

- [#14](https://github.com/TallyUI/tallyui/pull/14) [`c9b0bb8`](https://github.com/TallyUI/tallyui/commit/c9b0bb8334f747136d98aefb457e213cdbc7eec0) Thanks [@kilbot](https://github.com/kilbot)! - `createTallyDatabase` now works in production builds. It passed `ignoreDuplicate: true` unconditionally, which RxDB rejects with error DB9 whenever dev mode is off, so no production app could open its database. The option is now only set in dev mode, where hot reload still re-creates a database with the same name.

- [#78](https://github.com/TallyUI/tallyui/pull/78) [`9168278`](https://github.com/TallyUI/tallyui/commit/91682780fb8123473ba3ba694ef6a9538b8a2126) Thanks [@kilbot](https://github.com/kilbot)! - The live tab's busy-defer now caps by wall-clock time elapsed since the hand-over ack, not by counting `sleep(100)` calls. The live tab is in the background exactly when a new tab asks it to hand over, and browsers throttle background timers to about 1 s or more, so a sleep count could stretch the intended `maxDeferMs` (10 s by default) far beyond that, leaving the new tab stuck in `acquiring`.

- [#157](https://github.com/TallyUI/tallyui/pull/157) [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766) Thanks [@kilbot](https://github.com/kilbot)! - `readFresh`, `countFresh` and `watchFresh` move to a new, side-effect-free subpath, `@tallyui/core/rxdb`. Core now lists `rxdb` (`>=16`) and `rxjs` (`>=7`) as optional peer dependencies, needed only by that subpath; core's main entry stays free of both. `@tallyui/pos` re-exports the helpers unchanged. The id and fingerprint reconciles in `@tallyui/database` read the local products with `readFresh` instead of a cached `find()`, so a product the pull inserts or deletes while a pass reads them no longer leaves every later pass reading a stale list (RxDB 16.21.1 bug 4): an inserted product is now checked, and tombstoned or re-fetched, on the next pass, and a deleted one is no longer re-enqueued or counted towards the mass-delete brake.

- [#108](https://github.com/TallyUI/tallyui/pull/108) [`caa1fd2`](https://github.com/TallyUI/tallyui/commit/caa1fd27e6df1109bfed62b940a5d573f3ca4d8d) Thanks [@kilbot](https://github.com/kilbot)! - A reconcile trigger during a pass now runs one follow-up pass instead of being dropped.

- Updated dependencies [[`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b), [`50317c8`](https://github.com/TallyUI/tallyui/commit/50317c8520ebc04f2f6cdd47b9b9c6a0ed3efdd6), [`3e09957`](https://github.com/TallyUI/tallyui/commit/3e099573c771f130ffb6a5a3736527e908899257), [`a219ae0`](https://github.com/TallyUI/tallyui/commit/a219ae03588234d6e1a685a9924b52e115dcb7d1), [`4df9be4`](https://github.com/TallyUI/tallyui/commit/4df9be400debddb67859482c17f9e68dadbf46d1), [`9649259`](https://github.com/TallyUI/tallyui/commit/96492599bdb93fa573f588ae84585dc027289da8), [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09), [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005), [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e), [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8), [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17), [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99), [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a), [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764), [`f1af98c`](https://github.com/TallyUI/tallyui/commit/f1af98ce0161ded267e873ead952e8d7deafe471), [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be), [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d), [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766), [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588), [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4), [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9), [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9), [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5), [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6), [`ac2a24a`](https://github.com/TallyUI/tallyui/commit/ac2a24a147d1a759e7c5e28e73d0be90caa5e29b), [`8df0569`](https://github.com/TallyUI/tallyui/commit/8df0569d849f6099ec260eeb06e5c230172e12b5)]:
  - @tallyui/core@2.0.0

## 1.0.0

### Minor Changes

- [#4](https://github.com/TallyUI/tallyui/pull/4) [`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90) Thanks [@kilbot](https://github.com/kilbot)! - Initial npm release with build tooling

### Patch Changes

- Updated dependencies [[`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90)]:
  - @tallyui/core@0.2.0
