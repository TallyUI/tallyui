# @tallyui/connector-medusa

## 3.7.0

### Patch Changes

- @tallyui/core@3.7.0

## 3.6.0

### Patch Changes

- Updated dependencies [2894a59]
  - @tallyui/core@3.6.0

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

- a5b432e: Products report flat categories with string ids through the new optional `getCategories` trait (WooCommerce and Medusa categories, Vendure collections, Shopify product type). `@tallyui/pos` adds `productCategories`, `listCategories` and `inCategory`, which fall back to `getCategoryNames` for connectors without the trait.

### Patch Changes

- Updated dependencies [a5b432e]
  - @tallyui/core@3.5.0

## 3.4.0

### Patch Changes

- @tallyui/core@3.4.0

## 3.3.0

### Patch Changes

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

- @tallyui/core@3.2.1

## 3.2.0

### Patch Changes

- @tallyui/core@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [63a7431]
  - @tallyui/core@3.1.1

## 3.1.0

### Patch Changes

- @tallyui/core@3.1.0

## 3.0.4

### Patch Changes

- b10c3e2: Faster first catalogue sync: 250-product admin pages and up to 3 concurrent store-API price requests per page (ADR-074).
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

### Minor Changes

- faa7cda: Expose ConnectorUnauthorizedError for expired or rejected stored credentials in Vendure and Medusa requests.
- 0d04d13: Add neutral Customer, CustomerInput and CustomerServiceError exports and optional online-only customer search, create and get connector methods.

  Implement customer search, create and get for Medusa's admin-user connector.

- 457162d: **One reconcile feed per store session** (#307, a release gate). The WooCommerce and Medusa reconcile feeds were module-level singletons, so after a store switch in one runtime, store A's queued tombstones and refetches could reach store B's database.

  - **New factories.** `createWooCommerceConnector()`, `createMedusaConnector()` and `createMedusaAdminUserConnector()` each build their own feed; `createVendureConnector(options)` already did. **Build a connector per store session**, anew on each sign-in or store change.
  - **Deprecated exports.** `woocommerceConnector`, `medusaConnector`, `medusaAdminUserConnector` and `vendureConnector` are deprecated: one instance for the whole app can leak queued reconcile work across stores. **They are removed in 4.0.**
  - **A development warning.** `startReplication` warns once when the same adapter object replicates into two collections at once.
  - **Refetch budget by requests.** `refetchBatchSize` on the reconcile adapters makes a page that enqueues `n` refetches take `ceil(n / refetchBatchSize)` request-budget slots (WooCommerce 100, Medusa 100, Vendure 1,000).
  - **WooCommerce 426 errors.** A foreign (non-WCPOS) 426 keeps the store's `code` beside its message, and the message is capped at 200 characters.

- 7d1bc98: Add `parseTaxRounding` and `parseInfoCapabilities`, which read `/tally/v1/info` including its top-level `taxRounding` (#287). The Medusa connector's capability read now carries the store's `taxRounding`.

### Patch Changes

- eb5a032: A `/tally/v1/info` answer that says nothing about the store no longer means the default tax rounding (a follow-up to #339).

  - **Unknown:** a 2xx that is not JSON, and a `taxRounding` value that is present but malformed, now read as "unknown" (`undefined`), like a network failure or a 5xx. The till's store settings wait and retry instead of selling on a guessed rounding.
  - **Unchanged:** a 404 still means an older plugin (`orderCreate: 1`, the default rounding), and so does a well-formed body with no `taxRounding` key.
  - **Type change:** `parseInfoCapabilities` now returns `ServerCapabilities | undefined`. It is `undefined` when the body carries a malformed `taxRounding`.

- 2ecaa36: A replication adapter can set `pull.batchSize`, and the Medusa connector pulls 500 products per page.
- d225c58: Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.
- 222543b: Add `RegisterCommandType`, `RegisterCommandEnvelope` and `AnyCommandEnvelope`, register payloads and results, and the register server capability. `CommandType` and `CommandEnvelope` are unchanged.

  Record the local `register_commands` ledger through `reconcileRegisterCommands`, gated in `useRegisterSession` by its new `commands` and `capabilities` options. Commands are recorded but not sent. Medusa reads the `register` contract.

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

- 8cf3ea4: A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

  - **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
    - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
    - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
    - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
  - **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
  - **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.

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

### Patch Changes

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

- Updated dependencies [[`7fee0c1`](https://github.com/TallyUI/tallyui/commit/7fee0c19d57eb45130549101e5dd32cf593fdeea), [`eb5a032`](https://github.com/TallyUI/tallyui/commit/eb5a0322fe11b55e9158fb3374be14a12ac6b78b), [`8cf3ea4`](https://github.com/TallyUI/tallyui/commit/8cf3ea4a442a67ff0b229a6498503fd8b65a2ae5), [`e15f389`](https://github.com/TallyUI/tallyui/commit/e15f389e077a535b06a65e00c3989e7a652d7990), [`ddd9e85`](https://github.com/TallyUI/tallyui/commit/ddd9e85008f43e780cc0ee3754463eb7aa819a2a)]:
  - @tallyui/core@3.0.0-next.1

## 3.0.0-next.0

### Minor Changes

- [#196](https://github.com/TallyUI/tallyui/pull/196) [`faa7cda`](https://github.com/TallyUI/tallyui/commit/faa7cda925c6ca52e47357bd09d920813051c62b) Thanks [@kilbot](https://github.com/kilbot)! - Expose ConnectorUnauthorizedError for expired or rejected stored credentials in Vendure and Medusa requests.

- [#204](https://github.com/TallyUI/tallyui/pull/204) [`0d04d13`](https://github.com/TallyUI/tallyui/commit/0d04d13eff8a3bf7aed7cf747464e145a74dea35) Thanks [@kilbot](https://github.com/kilbot)! - Add neutral Customer, CustomerInput and CustomerServiceError exports and optional online-only customer search, create and get connector methods.

  Implement customer search, create and get for Medusa's admin-user connector.

- [#315](https://github.com/TallyUI/tallyui/pull/315) [`457162d`](https://github.com/TallyUI/tallyui/commit/457162d04dcd3c6f588cdb6ab90efea36081f4df) Thanks [@kilbot](https://github.com/kilbot)! - **One reconcile feed per store session** (#307, a release gate). The WooCommerce and Medusa reconcile feeds were module-level singletons, so after a store switch in one runtime, store A's queued tombstones and refetches could reach store B's database.

  - **New factories.** `createWooCommerceConnector()`, `createMedusaConnector()` and `createMedusaAdminUserConnector()` each build their own feed; `createVendureConnector(options)` already did. **Build a connector per store session**, anew on each sign-in or store change.
  - **Deprecated exports.** `woocommerceConnector`, `medusaConnector`, `medusaAdminUserConnector` and `vendureConnector` are deprecated: one instance for the whole app can leak queued reconcile work across stores. **They are removed in 4.0.**
  - **A development warning.** `startReplication` warns once when the same adapter object replicates into two collections at once.
  - **Refetch budget by requests.** `refetchBatchSize` on the reconcile adapters makes a page that enqueues `n` refetches take `ceil(n / refetchBatchSize)` request-budget slots (WooCommerce 100, Medusa 100, Vendure 1,000).
  - **WooCommerce 426 errors.** A foreign (non-WCPOS) 426 keeps the store's `code` beside its message, and the message is capped at 200 characters.

- [#322](https://github.com/TallyUI/tallyui/pull/322) [`7d1bc98`](https://github.com/TallyUI/tallyui/commit/7d1bc98b842258d67f6d5d380bc925e16e649ca2) Thanks [@kilbot](https://github.com/kilbot)! - Add `parseTaxRounding` and `parseInfoCapabilities`, which read `/tally/v1/info` including its top-level `taxRounding` (#287). The Medusa connector's capability read now carries the store's `taxRounding`.

### Patch Changes

- [#192](https://github.com/TallyUI/tallyui/pull/192) [`2ecaa36`](https://github.com/TallyUI/tallyui/commit/2ecaa3661eae0ad8ec5d0ce3a344dc24262f387b) Thanks [@kilbot](https://github.com/kilbot)! - A replication adapter can set `pull.batchSize`, and the Medusa connector pulls 500 products per page.

- [#186](https://github.com/TallyUI/tallyui/pull/186) [`d225c58`](https://github.com/TallyUI/tallyui/commit/d225c5819954f7c3e91e0c9180cb634530304061) Thanks [@kilbot](https://github.com/kilbot)! - Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.

- [#188](https://github.com/TallyUI/tallyui/pull/188) [`222543b`](https://github.com/TallyUI/tallyui/commit/222543b8c9130d2c79a294603195940143bd611c) Thanks [@kilbot](https://github.com/kilbot)! - Add `RegisterCommandType`, `RegisterCommandEnvelope` and `AnyCommandEnvelope`, register payloads and results, and the register server capability. `CommandType` and `CommandEnvelope` are unchanged.

  Record the local `register_commands` ledger through `reconcileRegisterCommands`, gated in `useRegisterSession` by its new `commands` and `capabilities` options. Commands are recorded but not sent. Medusa reads the `register` contract.

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

- Updated dependencies [[`4de75c2`](https://github.com/TallyUI/tallyui/commit/4de75c2e844d53fdbccd40c4ad4d4004a0641f57), [`894b6ae`](https://github.com/TallyUI/tallyui/commit/894b6aec27fcc157e65e68fee1f8134ef201712f), [`04905ef`](https://github.com/TallyUI/tallyui/commit/04905efd0c23a77159ce0682ed34df4567896bf0), [`faa7cda`](https://github.com/TallyUI/tallyui/commit/faa7cda925c6ca52e47357bd09d920813051c62b), [`9f34416`](https://github.com/TallyUI/tallyui/commit/9f34416619db35733ef85d98b225be5c046d12d5), [`fb57e1d`](https://github.com/TallyUI/tallyui/commit/fb57e1d8d97c3e03603a3bcc49470ce73bdb3b6d), [`898e98b`](https://github.com/TallyUI/tallyui/commit/898e98ba31387bbece8b79c5c0cc50d27f8cd3af), [`75c5dce`](https://github.com/TallyUI/tallyui/commit/75c5dced41a1c99da03614304fc87adad4bc684c), [`ba63f04`](https://github.com/TallyUI/tallyui/commit/ba63f04ef725774ec762a34a619534abb3bf2339), [`0d04d13`](https://github.com/TallyUI/tallyui/commit/0d04d13eff8a3bf7aed7cf747464e145a74dea35), [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4), [`24b74fd`](https://github.com/TallyUI/tallyui/commit/24b74fdfe39198c124cac707c31106affd7cc93b), [`54ee98a`](https://github.com/TallyUI/tallyui/commit/54ee98a583d5543538fb0641aa322a87e5f8cfaf), [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1), [`e59ebec`](https://github.com/TallyUI/tallyui/commit/e59ebecfc580bc5bca706c8e37fc825281a88cef), [`2ecaa36`](https://github.com/TallyUI/tallyui/commit/2ecaa3661eae0ad8ec5d0ce3a344dc24262f387b), [`901fa66`](https://github.com/TallyUI/tallyui/commit/901fa666f4ab345bf07b2d6b38c6e5dc58596f39), [`bf2d805`](https://github.com/TallyUI/tallyui/commit/bf2d805334c83d4f20f408e185add336331de38e), [`ca0beac`](https://github.com/TallyUI/tallyui/commit/ca0beacdafb14f3b5cae7c7593de23ed82b0d2d5), [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f), [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8), [`5c90aed`](https://github.com/TallyUI/tallyui/commit/5c90aed083d8245e12a645aafa9c9e6a3e7bbc61), [`668f71f`](https://github.com/TallyUI/tallyui/commit/668f71f6cf06af4a41fe686e98546f25e2e191ee), [`457162d`](https://github.com/TallyUI/tallyui/commit/457162d04dcd3c6f588cdb6ab90efea36081f4df), [`222543b`](https://github.com/TallyUI/tallyui/commit/222543b8c9130d2c79a294603195940143bd611c), [`8141c1c`](https://github.com/TallyUI/tallyui/commit/8141c1cb1591a8b8299ffc00fe4f9a77a7cd8289), [`ce4f796`](https://github.com/TallyUI/tallyui/commit/ce4f796aff7c739cb555b61f9a167cc803d8b5c2), [`6673faf`](https://github.com/TallyUI/tallyui/commit/6673fafcc682e825c94cfc66932da07cabd24e35), [`1f4d0ab`](https://github.com/TallyUI/tallyui/commit/1f4d0ab8006f41586740195831aaa0c9adc17f15), [`5ed6281`](https://github.com/TallyUI/tallyui/commit/5ed62816fe28a3ef3b001600b9d6a08de22d4a7e), [`5a204a9`](https://github.com/TallyUI/tallyui/commit/5a204a949e33f53d6087845d59e4bab1fe4a1474), [`7d1bc98`](https://github.com/TallyUI/tallyui/commit/7d1bc98b842258d67f6d5d380bc925e16e649ca2)]:
  - @tallyui/core@3.0.0-next.0

## 2.0.0

### Major Changes

- [#15](https://github.com/TallyUI/tallyui/pull/15) [`807d8da`](https://github.com/TallyUI/tallyui/commit/807d8dafc973fa7d48ca564da0a5d41935b66f8f) Thanks [@kilbot](https://github.com/kilbot)! - Product replication adapters are now pull-only. The `push` handler is removed from `medusaProductReplication`, `wooProductReplication`, `vendureProductReplication` and `shopifyProductReplication`. Catalogue data is server-owned, so the POS never writes products. The old push handlers also turned every HTTP or network error into a fake conflict, which made RxDB silently revert local edits.

  This removes a public member. Nothing in TallyUI called it, but code that called `adapter.push` directly must stop doing so.

### Minor Changes

- [#54](https://github.com/TallyUI/tallyui/pull/54) [`50317c8`](https://github.com/TallyUI/tallyui/commit/50317c8520ebc04f2f6cdd47b9b9c6a0ed3efdd6) Thanks [@kilbot](https://github.com/kilbot)! - Connectors can sign a user in: `ConnectorAuth` gains an optional `signIn(baseUrl, { email, password }, init?)` that resolves to a `SignInResult` (`token`, optional ISO 8601 `expiresAt`) and rejects with a `SignInError` whose `code` is `invalid_credentials`, `unsupported` or `failed`. The app stores the token and passes it back to `getHeaders` as `token`.

  Vendure's auth gains a sign-in flow: it runs the Admin API `login` mutation and takes the token from the `vendure-auth-token` header (the server's `tokenMethod` must include `'bearer'`). Its fields are now `url`, `email`, `password` and an optional `channel_token`. `getHeaders` sends `credentials.api_key` as `vendure-api-key`, otherwise `credentials.token` as a Bearer token, plus `vendure-token` when `channel_token` is set. The old `auth_token` credential is still accepted as a deprecated alias for `token`.

  Medusa's `medusaAdminUserAuth` signs in through `POST /auth/user/emailpass` and reads `expiresAt` from the JWT's `exp`. `medusaSecretKeyAuth` has no sign-in.

- [#85](https://github.com/TallyUI/tallyui/pull/85) [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09) Thanks [@kilbot](https://github.com/kilbot)! - Add the fingerprint reconcile (ADR-060 amendment 8): a neutral runner that compares a remote fingerprint per product against the local documents and re-delivers products whose fingerprint differs, through the collection's pull. `@tallyui/core` adds the `FingerprintReconcileAdapter` contract (`fetchPages`, a pure `fingerprint` and `enqueue`) and an optional `reconcile.prices` on `TallyConnector`. `@tallyui/database` adds `startFingerprintReconcile`, which runs no pass at start by default and otherwise mirrors the id reconcile: a complete, successful pass only, `state$` (`running`, `lastResult`, `lastError`), and `stop()`. `@tallyui/connector-medusa` adds `reconcile.prices`, a nightly base-price backstop (`MEDUSA_PRICE_RECONCILE_INTERVAL_MS`) for the variant feed (ADR-060 job D1): it fingerprints each product's base prices (variant id, currency and amount, sorted, price-list prices excluded) from `/admin/product-variants`. Nothing is written locally; corrections arrive only through the reconcile feed's pull.

- [#35](https://github.com/TallyUI/tallyui/pull/35) [`63f11fa`](https://github.com/TallyUI/tallyui/commit/63f11fa1823e55b83cb83b5b400006f3768ac32b) Thanks [@kilbot](https://github.com/kilbot)! - Add a Bearer credential type for Medusa admin users: `medusaAdminUserAuth` sends the JWT from emailpass sign-in as `Authorization: Bearer <jwt>`, and `medusaAdminUserConnector` is `medusaConnector` with that auth. The secret-key auth is now also exported as `medusaSecretKeyAuth`; `medusaConnector` is unchanged.

- [#92](https://github.com/TallyUI/tallyui/pull/92) [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17) Thanks [@kilbot](https://github.com/kilbot)! - Medusa prices as Medusa charges them (ADR-060 D2b). `SyncContext` gains an optional `pricingContext` (from `storeSettings()`), `ProductPrice` an optional `taxInclusive`, and `TallyConnector.reconcile` a `calculatedPrices` slot. With a pricing context, every Medusa product document build fills each variant's `calculated_price` from the store API (`null` when the sales channel or region does not sell it), and the traits price from it: sale lists as a sale against the original price, override lists as the base price, `null` as unsellable. `reconcile.calculatedPrices` re-delivers products whose calculated prices changed with no timestamp bump; run it every `MEDUSA_CALCULATED_PRICE_RECONCILE_INTERVAL_MS` (30 minutes) with `maxPages: 1000`. Without a pricing context, documents and prices are unchanged.

- [#63](https://github.com/TallyUI/tallyui/pull/63) [`d9fe1e3`](https://github.com/TallyUI/tallyui/commit/d9fe1e398b9bc790176b15c00caf8e73f0d5abdf) Thanks [@kilbot](https://github.com/kilbot)! - Fix the Medusa connector's incremental pull: Medusa 2.21 honours only the operator form `updated_at[$gte]`, and silently ignored the connector's `updated_at[gte]`, so every pass read the whole catalogue. Add the Medusa id reconcile (ADR-060), so a deleted product or a deleted variant (whose parent's `updated_at` does not change) now reaches the local copy through `replication.products` and `reconcile.ids`. `@tallyui/database` adds a mass-deletion brake to `startIdReconcile`: a pass that would tombstone more than `maxDeleteShare` (default 20%) of local products, and more than 10 of them, queues nothing and warns instead, unless `allowMassDelete` is set.

- [#102](https://github.com/TallyUI/tallyui/pull/102) [`7490a3f`](https://github.com/TallyUI/tallyui/commit/7490a3fbd3d0e4ef28efdb1f6205d33177ee6be2) Thanks [@kilbot](https://github.com/kilbot)! - A connector schema version bump now drops and resyncs its collection (ADR-060 amendment 9). `createTallyDatabase` adds RxDB's migration-schema plugin and gives each connector collection above version 0 a `v => null` strategy per earlier version, and `startReplication` appends `-v<version>` to the replication identifier above version 0, so the pull starts from no checkpoint. Version 0 collections keep their identifier and never resync. `stock_levels` and `pos_orders` are untouched.

  The Medusa products schema is now version 1 and declares `variants[].calculated_price` (object or `null`). **The first sync after upgrading resyncs the Medusa catalogue**: the stored products are dropped when the database opens and download again, once, on the first sync. A collection created with `medusaProductSchema` outside `createTallyDatabase` must use `connectorCollection(medusaProductSchema)` from `@tallyui/database`, which supplies the strategies and the migration plugin; otherwise RxDB throws COL12.

- [#89](https://github.com/TallyUI/tallyui/pull/89) [`4c2cf8f`](https://github.com/TallyUI/tallyui/commit/4c2cf8f6602c834000499392babc588587bbed1f) Thanks [@kilbot](https://github.com/kilbot)! - `medusaConnector.storeSettings` (TV4b) reads Medusa's admin API only: the resolved region's currency and price-preference tax inclusivity, the resolved country's tax region default rate (rounded to integer ppm once, at the connector's edge; 0 with no tax region or no default rate, matching what Medusa's system provider itself charges), and a `pricingContext` (`region_id`, `currency_code`, `publishable_key`) for pricing through the store API. Region, then country, then channel (the publishable key, excluding revoked ones): the first ambiguity reports every choice known at that point, as `StoreSettingsError('choice_required')`, so the app asks once; a store with no publishable key at all rejects with `StoreSettingsError('failed')`. The publishable key is a public credential and may sit in `pricingContext`, but never appears in an error message, `choices`, or console output.

- [#81](https://github.com/TallyUI/tallyui/pull/81) [`03cd385`](https://github.com/TallyUI/tallyui/commit/03cd38500e90b6ced24886c059b09d9dea92da6b) Thanks [@kilbot](https://github.com/kilbot)! - Medusa's `replication.products` now includes a variant feed, so price edits arrive incrementally. Medusa 2.21 bumps a variant's `updated_at` on a price-only edit but not its product's, so the product feed alone missed those changes. The variant feed pages changed variants and re-delivers their parent products. The first sync after upgrading re-delivers every product once.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99) Thanks [@kilbot](https://github.com/kilbot)! - Add backend-neutral price and stock traits. `ProductTraits` gains `getPrices` (a price list of integer minor-unit `Money` entries, `base` or `sale`, per currency) and `getStock` (`in_stock | out_of_stock | backorder | unknown` plus an optional quantity). Core adds `resolvePrice`, `moneyFromMajor`, `moneyToMajor` and `minorUnitDigits`. Every connector maps its own shape into them; WooCommerce's `instock`/`outofstock`/`onbackorder` strings now stay inside the WooCommerce connector. The string-price and WooCommerce-style stock accessors remain and are deprecated.

- [#120](https://github.com/TallyUI/tallyui/pull/120) [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764) Thanks [@kilbot](https://github.com/kilbot)! - A per-store `order.create` capability check replaces the global discount guard (ADR-062). `@tallyui/core` gains `ServerCapabilities`, `SignInResult.capabilities`, `SyncContext.capabilities`, `TallyConnector.capabilities?()` and `resolveCapabilities(fresh, stored)`. `@tallyui/connector-medusa` reads the store's supported `order.create` versions from `GET /tally/v1/info`: a 404 or a malformed response means an old plugin (version 1), a network failure or a 5xx is unknown and keeps the last known value, and a 401 throws. `medusaSignIn` returns the read capabilities, and both Medusa connectors expose `capabilities(context)` for a restored session. `finalizeOrder` in `@tallyui/pos` now rejects a discount only when the store's capability is below 2, so a store whose plugin has caught up finalizes a discounted order as `order.create` version 2.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4) Thanks [@kilbot](https://github.com/kilbot)! - Add `isSellable` and `getVariantCount` product traits to core and all four connectors.

- [#57](https://github.com/TallyUI/tallyui/pull/57) [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9) Thanks [@kilbot](https://github.com/kilbot)! - `SignInErrorCode` splits the old `failed` in two: `failed` now means no response arrived (a network error), and the new `server_error` means a response arrived but was unusable (a bad status, a malformed body, or a missing token). `SignInError` gains an optional `status` from a third constructor argument. Callers that switch on `code` should handle `server_error`.

  Medusa's sign-in now treats `mfa_required: true` and `verification_required: true` the same as a `location` body: `unsupported`, and no token is ever returned from a body like that. A malformed response body, any other non-OK status and a missing or non-string token are now `server_error` with the HTTP status.

  Vendure's sign-in now treats `NATIVE_AUTH_STRATEGY_ERROR` as `unsupported`, since native email/password auth is disabled on the server. A malformed response body, a non-OK status, GraphQL errors, a missing `data.login` and any other `ErrorResult` are now `server_error` with the HTTP status.

- [#64](https://github.com/TallyUI/tallyui/pull/64) [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9) Thanks [@kilbot](https://github.com/kilbot)! - Both connectors now store a product's variants sorted by id, since neither Medusa nor Vendure guarantees variant order across requests: `@tallyui/core` adds `compareIds`, and the Medusa and Vendure product projections (`toDocument`, `toProductDocument`) sort `variants` with it before the document is stored. Traits that read `variants[0]` (`getPrices`, `getSku`, `getPrice`, `getStockQuantity`, `getBarcode` and others) now see a stable variant across runs.

  Already-stored documents take the new order the next time they are delivered. Vendure's variant feed re-delivers every product on its first pass anyway, so it heals immediately.

- [#53](https://github.com/TallyUI/tallyui/pull/53) [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6) Thanks [@kilbot](https://github.com/kilbot)! - Add a stock reconcile pass (ADR-060). `@tallyui/core` adds the `StockReconcileAdapter` contract (`fetchPages` and a pure `overlay`) and an optional `reconcile.stock` on `TallyConnector`. `@tallyui/database` adds the local-only `stock_levels` collection (`STOCK_LEVELS_COLLECTION`, `stockLevelsSchema`), which `createTallyDatabase` creates for connectors with `reconcile.stock`, and `startStockReconcile`, which re-reads stock every 5 minutes (and on demand through `reconcileStock()`) into that collection: it writes only changed rows, removes keys the backend no longer returns, writes nothing after a failed, truncated or stopped read, and never writes the replicated products. `@tallyui/pos` adds `stockOverlay$`, `withStockOverlay` and `getProductStock`, which read stock from the overlay where it has an entry and from the replicated product otherwise. The Vendure connector reconciles variant `stockLevels`, and the Medusa connector reconciles inventory item location levels, so stock changes that bump no product timestamp reach the POS.

- [#19](https://github.com/TallyUI/tallyui/pull/19) [`8df0569`](https://github.com/TallyUI/tallyui/commit/8df0569d849f6099ec260eeb06e5c230172e12b5) Thanks [@kilbot](https://github.com/kilbot)! - Adds variant traits. `VariantSummary` (`id`, `title`, `sku`, `barcode`, `prices`, `stock`) and the optional `ProductTraits.getVariants` describe every purchasable variant of a product, and `findVariantByCode` finds a variant by barcode or SKU for scanning. The Medusa connector implements `getVariants`; its product-level `getPrices` and `getStock` results are unchanged.

### Patch Changes

- [#48](https://github.com/TallyUI/tallyui/pull/48) [`6b1b0b7`](https://github.com/TallyUI/tallyui/commit/6b1b0b7275d0ae9f7485b399bdb088b3c4f798b7) Thanks [@kilbot](https://github.com/kilbot)! - Product replication no longer loses updates inside RxDB's replication loop: a pass ends on the list count, the next pass starts from a high-water mark read at the pass start, an unchanged mark ends the loop, and a pass restarts if rows vanish mid-pass.

- [#97](https://github.com/TallyUI/tallyui/pull/97) [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005) Thanks [@kilbot](https://github.com/kilbot)! - A fresh install downloads the catalogue once. A pull adapter can now declare `pull.seedCheckpoint`; on a fresh install (no stored checkpoint) `combinePullAdapters` reads every seed before any feed runs and starts that feed from it. The Medusa and Vendure variant feeds seed their cursor at the newest variant's `updated_at`, so their first pass no longer re-delivers every product the product feed has just delivered, and a variant edit made during the product feed's first pass still arrives. An install upgrading from a stored checkpoint is never seeded and keeps the variant feed's full healing pass.

- [#98](https://github.com/TallyUI/tallyui/pull/98) [`9cd78cd`](https://github.com/TallyUI/tallyui/commit/9cd78cd46bd357d557b1a11db01b9075bc144606) Thanks [@kilbot](https://github.com/kilbot)! - `medusaStoreSettings`'s `choice_required` channel choices are named after the publishable key's sales channel(s) (joined with ", " when there is more than one), not the key's own developer-facing title. A key with no sales channel, or only blank channel names, still falls back to its title.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`4e6261f`](https://github.com/TallyUI/tallyui/commit/4e6261fffcefafb678de2ce4c1dc0b19e371647e) Thanks [@kilbot](https://github.com/kilbot)! - Fix product replication skipping a page of products per batch: the checkpoint now keeps its `updated_at` filter fixed while paging and only advances it at the end of a pass.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`ffa9f19`](https://github.com/TallyUI/tallyui/commit/ffa9f19cdd287bb095f10e75d0efbafe9fd59bd0) Thanks [@kilbot](https://github.com/kilbot)! - Fix the Medusa connector against a real Medusa v2 (2.21) backend: send the secret API key over HTTP Basic auth (Medusa rejects it as a Bearer token), read prices as major units (v2 does not store cents), derive stock from inventory levels (the Admin API does not compute `inventory_quantity`), and pull products in `updated_at` order so the checkpoint is valid.

- [#111](https://github.com/TallyUI/tallyui/pull/111) [`35a3fba`](https://github.com/TallyUI/tallyui/commit/35a3fba00e09ca352106add79e5d94209fc5d6b9) Thanks [@kilbot](https://github.com/kilbot)! - A chosen country outside the region is reported as `choice_required` instead of silently using the region's only country.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`60230f0`](https://github.com/TallyUI/tallyui/commit/60230f04711de7953caabaf80ca808e6d2f4009a) Thanks [@kilbot](https://github.com/kilbot)! - Make the Medusa product schema load under RxDB dev-mode (indexed `handle` and `status` are now required with a `maxLength`), keep pulled documents to the schema's fields so new Medusa API fields never fail validation, and page each replication pass in `id` order, since many products share an `updated_at`.

- [#88](https://github.com/TallyUI/tallyui/pull/88) [`5053527`](https://github.com/TallyUI/tallyui/commit/5053527066d9f9f49efff37ccf18ce2910518b89) Thanks [@kilbot](https://github.com/kilbot)! - no longer publishes test files

- [#94](https://github.com/TallyUI/tallyui/pull/94) [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be) Thanks [@kilbot](https://github.com/kilbot)! - `resolvePrice` keeps a price's `taxInclusive` flag on `current` and `was`. Each order-builder line keeps its price's own tax mode (`LineItem.taxInclusive`, plus `priceTaxModeConverted` when it differs from the store's `pricesIncludeTax`), so a customer pays exactly the shelf price and an inclusive price in an exclusive store is no longer taxed twice. Orders whose prices carry no flag, or one that agrees with the store, total exactly as before. The receipt shows a converted line in the order's mode, by its share of the order's once-rounded tax, so the lines still add up.

  In priced mode, the Medusa traits' deprecated `getPrice` and `getRegularPrice` return the resolved calculated price instead of the admin prices, and `isSellable` is false when no variant yields a price (for example a `calculated_price` with null amounts).

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d) Thanks [@kilbot](https://github.com/kilbot)! - Report product-level stock across all variants, showing the total quantity only when every variant has tracked, known stock.
  Draw the search magnifier with an attached, rounded handle and a larger ring.
- Updated dependencies [[`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b), [`50317c8`](https://github.com/TallyUI/tallyui/commit/50317c8520ebc04f2f6cdd47b9b9c6a0ed3efdd6), [`3e09957`](https://github.com/TallyUI/tallyui/commit/3e099573c771f130ffb6a5a3736527e908899257), [`a219ae0`](https://github.com/TallyUI/tallyui/commit/a219ae03588234d6e1a685a9924b52e115dcb7d1), [`4df9be4`](https://github.com/TallyUI/tallyui/commit/4df9be400debddb67859482c17f9e68dadbf46d1), [`9649259`](https://github.com/TallyUI/tallyui/commit/96492599bdb93fa573f588ae84585dc027289da8), [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09), [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005), [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e), [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8), [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17), [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99), [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a), [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764), [`f1af98c`](https://github.com/TallyUI/tallyui/commit/f1af98ce0161ded267e873ead952e8d7deafe471), [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be), [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d), [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766), [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588), [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4), [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9), [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9), [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5), [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6), [`ac2a24a`](https://github.com/TallyUI/tallyui/commit/ac2a24a147d1a759e7c5e28e73d0be90caa5e29b), [`8df0569`](https://github.com/TallyUI/tallyui/commit/8df0569d849f6099ec260eeb06e5c230172e12b5)]:
  - @tallyui/core@2.0.0

## 1.0.0

### Minor Changes

- [#4](https://github.com/TallyUI/tallyui/pull/4) [`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90) Thanks [@kilbot](https://github.com/kilbot)! - Initial npm release with build tooling

### Patch Changes

- Updated dependencies [[`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90)]:
  - @tallyui/core@0.2.0
