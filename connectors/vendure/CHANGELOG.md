# @tallyui/connector-vendure

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

### Minor Changes

- 5f588a6: `vendureAuth` gains `fieldSets` (email and password, or a device key) and honours an optional credential `kind: 'password' | 'api-key'`, so a SignIn screen can offer a device key without its own form; credentials without `kind` behave as before.

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

- 88e36d1: Customer search, creation and lookup (`searchCustomers`, `createCustomer`, `getCustomer`) over the Admin API in the session's channel; needs `ReadCustomer` and `CreateCustomer`.
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

- 7d1bc98: Read the store's capabilities and `taxRounding` from the Vendure plugin's `/tally/v1/info` (#287): `vendureSignIn` returns `capabilities`, and the connector gains `capabilities(context)` for a restored session or an API key.
- e15f389: The Vendure connector supplies its tax rate names, so a `per_rate_group_items` store groups a sale's tax the way Vendure does (#324). Apps no longer fetch the names themselves.

  - **`StoreSettings.taxRateCodes`** (core, optional): the backend's tax rate name per tax class, keyed like `taxRatesPpm`, including `default`.
  - **`vendureStoreSettings`** reads each rate's `name` in the tax-rate query it already runs, so no extra request is made. Only the rates `taxRatesPpm` uses count, and `default` follows the same default-category rule. `taxRateCodes` is left out when no names come back.
  - **`taxProviderProps(settings)`** passes `taxRateCodes` to `<TaxProvider>` as `rateCodes`.

### Patch Changes

- eb5a032: A `/tally/v1/info` answer that says nothing about the store no longer means the default tax rounding (a follow-up to #339).

  - **Unknown:** a 2xx that is not JSON, and a `taxRounding` value that is present but malformed, now read as "unknown" (`undefined`), like a network failure or a 5xx. The till's store settings wait and retry instead of selling on a guessed rounding.
  - **Unchanged:** a 404 still means an older plugin (`orderCreate: 1`, the default rounding), and so does a well-formed body with no `taxRounding` key.
  - **Type change:** `parseInfoCapabilities` now returns `ServerCapabilities | undefined`. It is `undefined` when the body carries a malformed `taxRounding`.

- e59ebec: Each line is taxed at its product's tax class, not the store's default (#288). `ProductTraits` gains an optional `getTaxClass(doc, variantId?)`, the backend's tax class id, a key of `StoreSettings.taxRatesPpm`. `addProduct` and `addEntryToCart` pass it to `addLine` through the new `AddLineInput.taxClass`, which the tax context resolves; a connector without the accessor is unchanged (the default rate). `TaxProvider` taxes a class with no rate at the default rate and warns once per class through the new `taxLogger`. connector-vendure replicates each variant's `taxCategory { id }` and implements the accessor, and its store settings give every tax category with no enabled rate in the default zone an explicit 0 rate, as Vendure charges; its product schema goes to version 2, so the products collection is dropped and downloaded again on the first sync after the upgrade.
- d225c58: Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.
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

- 9885075: Match variant barcodes and SKUs in product search, and skip disabled Vendure variants when reading the product barcode.
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

- 9cd4024: A GraphQL `FORBIDDEN` answer throws `ConnectorUnauthorizedError` only when a probe (`{ activeAdministrator { id } }`, same headers) finds nobody signed in (#274). With a live administrator it is a plain `Error` naming the missing permission, and a failed probe is a plain, transient `Error`, so a missing permission no longer signs the till out into a sign-in loop.
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

- [#334](https://github.com/TallyUI/tallyui/pull/334) [`e15f389`](https://github.com/TallyUI/tallyui/commit/e15f389e077a535b06a65e00c3989e7a652d7990) Thanks [@kilbot](https://github.com/kilbot)! - The Vendure connector supplies its tax rate names, so a `per_rate_group_items` store groups a sale's tax the way Vendure does (#324). Apps no longer fetch the names themselves.

  - **`StoreSettings.taxRateCodes`** (core, optional): the backend's tax rate name per tax class, keyed like `taxRatesPpm`, including `default`.
  - **`vendureStoreSettings`** reads each rate's `name` in the tax-rate query it already runs, so no extra request is made. Only the rates `taxRatesPpm` uses count, and `default` follows the same default-category rule. `taxRateCodes` is left out when no names come back.
  - **`taxProviderProps(settings)`** passes `taxRateCodes` to `<TaxProvider>` as `rateCodes`.

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

- [#322](https://github.com/TallyUI/tallyui/pull/322) [`7d1bc98`](https://github.com/TallyUI/tallyui/commit/7d1bc98b842258d67f6d5d380bc925e16e649ca2) Thanks [@kilbot](https://github.com/kilbot)! - Read the store's capabilities and `taxRounding` from the Vendure plugin's `/tally/v1/info` (#287): `vendureSignIn` returns `capabilities`, and the connector gains `capabilities(context)` for a restored session or an API key.

### Patch Changes

- [#292](https://github.com/TallyUI/tallyui/pull/292) [`e59ebec`](https://github.com/TallyUI/tallyui/commit/e59ebecfc580bc5bca706c8e37fc825281a88cef) Thanks [@kilbot](https://github.com/kilbot)! - Each line is taxed at its product's tax class, not the store's default (#288). `ProductTraits` gains an optional `getTaxClass(doc, variantId?)`, the backend's tax class id, a key of `StoreSettings.taxRatesPpm`. `addProduct` and `addEntryToCart` pass it to `addLine` through the new `AddLineInput.taxClass`, which the tax context resolves; a connector without the accessor is unchanged (the default rate). `TaxProvider` taxes a class with no rate at the default rate and warns once per class through the new `taxLogger`. connector-vendure replicates each variant's `taxCategory { id }` and implements the accessor, and its store settings give every tax category with no enabled rate in the default zone an explicit 0 rate, as Vendure charges; its product schema goes to version 2, so the products collection is dropped and downloaded again on the first sync after the upgrade.

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

- [#203](https://github.com/TallyUI/tallyui/pull/203) [`9885075`](https://github.com/TallyUI/tallyui/commit/98850759e9531a13b004a6be7be1115392f46a1d) Thanks [@kilbot](https://github.com/kilbot)! - Match variant barcodes and SKUs in product search, and skip disabled Vendure variants when reading the product barcode.

- [#279](https://github.com/TallyUI/tallyui/pull/279) [`9cd4024`](https://github.com/TallyUI/tallyui/commit/9cd4024d27e30261cac3c7a58be342c712f0bc7a) Thanks [@kilbot](https://github.com/kilbot)! - A GraphQL `FORBIDDEN` answer throws `ConnectorUnauthorizedError` only when a probe (`{ activeAdministrator { id } }`, same headers) finds nobody signed in (#274). With a live administrator it is a plain `Error` naming the missing permission, and a failed probe is a plain, transient `Error`, so a missing permission no longer signs the till out into a sign-in loop.

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

- [#45](https://github.com/TallyUI/tallyui/pull/45) [`14620d9`](https://github.com/TallyUI/tallyui/commit/14620d9ee5853f61ad5b638acd57f0236e6bcb8f) Thanks [@kilbot](https://github.com/kilbot)! - Fix Vendure product pagination with fixed timestamp windows and ID ordering. Add an opt-in barcode field and stock-location configuration, use available stock from stockLevels, and support the Admin API in the mock.

  Complete pull passes using totalItems, restart empty mid-pass pages, and use a pass-start high-water mark with idle detection to preserve updates in RxDB replication. Include GraphQL error messages on failed HTTP responses. Existing users must set barcodeField to read barcodes: getBarcode now returns undefined unless barcodeField is configured.

  Guard each pull pass against skewed Vendure updatedAt filters and add updatedAtSkewMs to widen lower bounds when the server cannot run with TZ=UTC.

- [#58](https://github.com/TallyUI/tallyui/pull/58) [`3e09957`](https://github.com/TallyUI/tallyui/commit/3e099573c771f130ffb6a5a3736527e908899257) Thanks [@kilbot](https://github.com/kilbot)! - Add `combinePullAdapters` to `@tallyui/core`: it combines several pull adapters into the one adapter a collection replicates with, calling them one after another with a checkpoint per sub-adapter. Two replications on one collection can skip each other's pulled versions, so run one per collection.

  Vendure's `replication.products` now includes a variant feed that re-delivers parent products whose variants changed. Vendure does not bump `Product.updatedAt` on a variant price or stock edit, so the product feed alone misses those changes. An existing install's product-feed checkpoint carries over; the variant feed runs one full pass on first sync.

- [#50](https://github.com/TallyUI/tallyui/pull/50) [`2424107`](https://github.com/TallyUI/tallyui/commit/2424107478e6770f59580e870a71511b2e11bd13) Thanks [@kilbot](https://github.com/kilbot)! - Add variant summaries for barcode scanning and variant pickers. Add a pricesIncludeTax option, defaulting to false, so product and variant prices use net amounts by default and gross amounts for tax-inclusive channels.

- [#61](https://github.com/TallyUI/tallyui/pull/61) [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8) Thanks [@kilbot](https://github.com/kilbot)! - Add the id reconcile (ADR-060): a periodic pass that reads every live product id and its live variant ids, so a deleted product or a deleted variant (whose parent's `updatedAt` does not change) reaches the local copy. `@tallyui/core` adds the `IdReconcileAdapter` contract and `createReconcileFeed`, which turns queued corrections into a pull-only adapter meant as the last key of `combinePullAdapters`. `@tallyui/database` adds the `startIdReconcile` runner. `@tallyui/connector-vendure` implements the Vendure side and wires it into `replication.products` and `reconcile.ids`. Nothing is written locally into the replicated collection; corrections arrive only through the collection's own pull.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99) Thanks [@kilbot](https://github.com/kilbot)! - Add backend-neutral price and stock traits. `ProductTraits` gains `getPrices` (a price list of integer minor-unit `Money` entries, `base` or `sale`, per currency) and `getStock` (`in_stock | out_of_stock | backorder | unknown` plus an optional quantity). Core adds `resolvePrice`, `moneyFromMajor`, `moneyToMajor` and `minorUnitDigits`. Every connector maps its own shape into them; WooCommerce's `instock`/`outofstock`/`onbackorder` strings now stay inside the WooCommerce connector. The string-price and WooCommerce-style stock accessors remain and are deprecated.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4) Thanks [@kilbot](https://github.com/kilbot)! - Add `isSellable` and `getVariantCount` product traits to core and all four connectors.

- [#57](https://github.com/TallyUI/tallyui/pull/57) [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9) Thanks [@kilbot](https://github.com/kilbot)! - `SignInErrorCode` splits the old `failed` in two: `failed` now means no response arrived (a network error), and the new `server_error` means a response arrived but was unusable (a bad status, a malformed body, or a missing token). `SignInError` gains an optional `status` from a third constructor argument. Callers that switch on `code` should handle `server_error`.

  Medusa's sign-in now treats `mfa_required: true` and `verification_required: true` the same as a `location` body: `unsupported`, and no token is ever returned from a body like that. A malformed response body, any other non-OK status and a missing or non-string token are now `server_error` with the HTTP status.

  Vendure's sign-in now treats `NATIVE_AUTH_STRATEGY_ERROR` as `unsupported`, since native email/password auth is disabled on the server. A malformed response body, a non-OK status, GraphQL errors, a missing `data.login` and any other `ErrorResult` are now `server_error` with the HTTP status.

- [#64](https://github.com/TallyUI/tallyui/pull/64) [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9) Thanks [@kilbot](https://github.com/kilbot)! - Both connectors now store a product's variants sorted by id, since neither Medusa nor Vendure guarantees variant order across requests: `@tallyui/core` adds `compareIds`, and the Medusa and Vendure product projections (`toDocument`, `toProductDocument`) sort `variants` with it before the document is stored. Traits that read `variants[0]` (`getPrices`, `getSku`, `getPrice`, `getStockQuantity`, `getBarcode` and others) now see a stable variant across runs.

  Already-stored documents take the new order the next time they are delivered. Vendure's variant feed re-delivers every product on its first pass anyway, so it heals immediately.

- [#53](https://github.com/TallyUI/tallyui/pull/53) [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6) Thanks [@kilbot](https://github.com/kilbot)! - Add a stock reconcile pass (ADR-060). `@tallyui/core` adds the `StockReconcileAdapter` contract (`fetchPages` and a pure `overlay`) and an optional `reconcile.stock` on `TallyConnector`. `@tallyui/database` adds the local-only `stock_levels` collection (`STOCK_LEVELS_COLLECTION`, `stockLevelsSchema`), which `createTallyDatabase` creates for connectors with `reconcile.stock`, and `startStockReconcile`, which re-reads stock every 5 minutes (and on demand through `reconcileStock()`) into that collection: it writes only changed rows, removes keys the backend no longer returns, writes nothing after a failed, truncated or stopped read, and never writes the replicated products. `@tallyui/pos` adds `stockOverlay$`, `withStockOverlay` and `getProductStock`, which read stock from the overlay where it has an entry and from the replicated product otherwise. The Vendure connector reconciles variant `stockLevels`, and the Medusa connector reconciles inventory item location levels, so stock changes that bump no product timestamp reach the POS.

- [#87](https://github.com/TallyUI/tallyui/pull/87) [`ac2a24a`](https://github.com/TallyUI/tallyui/commit/ac2a24a147d1a759e7c5e28e73d0be90caa5e29b) Thanks [@kilbot](https://github.com/kilbot)! - `TallyConnector` gains an optional `storeSettings(context, choice?)` (TV4): one read-only call for the store's currency, `pricesIncludeTax`, `taxRatesPpm` and an opaque connector-specific `pricingContext`, so the app can feed the connector's own tax-inclusivity option and the POS `TaxProvider` from a single source of truth instead of two hand-matched settings. Rejects with a `StoreSettingsError` (`choice_required` with `choices`, or `failed`).

  Vendure's `storeSettings` reads the active channel's currency and `pricesIncludeTax`, and the default tax zone's enabled, non-customer-group rates keyed by tax category id (rounded to integer ppm once, at the connector's edge). `default` is the `isDefault` category's rate, or, when none is flagged, the first category Vendure's own `taxCategories` lists — the same fallback Vendure uses for a variant created without a category — and is 0 when that category has no rate in the zone. `createVendureConnector`'s `pricesIncludeTax` option is unchanged; pass `settings.pricesIncludeTax` from `storeSettings` instead of hand-matching it to the POS.

- [#112](https://github.com/TallyUI/tallyui/pull/112) [`8a3f323`](https://github.com/TallyUI/tallyui/commit/8a3f3239553128f86e5ffd841566687a4dd72a35) Thanks [@kilbot](https://github.com/kilbot)! - Adds a nightly price reconcile pass (`reconcile.prices`), a fingerprint backstop for tax-rate changes: a zone's rate change for a category moves every affected variant's `priceWithTax` without bumping the variant's `updatedAt`, so neither the product feed nor the variant feed re-delivers it (ADR-060).

- [#110](https://github.com/TallyUI/tallyui/pull/110) [`b814bf3`](https://github.com/TallyUI/tallyui/commit/b814bf3c167d6b7dd8dfec9e6d89b47b34f87928) Thanks [@kilbot](https://github.com/kilbot)! - Fixes three Vendure stock gaps (backlog 28, from the #45 stock review): a variant with `trackInventory` `FALSE`, or `INHERIT` with the global setting off, is now always in stock; `outOfStockThreshold` (per variant, or the global one through `useGlobalOutOfStockThreshold`) is now subtracted from available stock, matching Vendure's own saleable rule; `getStockStatus` and `getStockQuantity` now aggregate every variant, as `getStock` already did, instead of reading variant 0 only.

  Adds `vendureGlobalStockSettings(context)` for the channel's stock defaults, and `createVendureConnector` options `globalTrackInventory` and `globalOutOfStockThreshold`.

  The Vendure product schema is now version 1, declaring `variants[].trackInventory`, `outOfStockThreshold`, `useGlobalOutOfStockThreshold` and `enabled`. **The first sync after upgrading resyncs the Vendure catalogue once**: a schema version bump drops the stored products and downloads them again (ADR-060 amendment 9). A collection created with `vendureProductSchema` outside `createTallyDatabase` must use `connectorCollection(vendureProductSchema)` from `@tallyui/database`.

### Patch Changes

- [#97](https://github.com/TallyUI/tallyui/pull/97) [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005) Thanks [@kilbot](https://github.com/kilbot)! - A fresh install downloads the catalogue once. A pull adapter can now declare `pull.seedCheckpoint`; on a fresh install (no stored checkpoint) `combinePullAdapters` reads every seed before any feed runs and starts that feed from it. The Medusa and Vendure variant feeds seed their cursor at the newest variant's `updated_at`, so their first pass no longer re-delivers every product the product feed has just delivered, and a variant edit made during the product feed's first pass still arrives. An install upgrading from a stored checkpoint is never seeded and keeps the variant feed's full healing pass.

- [#88](https://github.com/TallyUI/tallyui/pull/88) [`5053527`](https://github.com/TallyUI/tallyui/commit/5053527066d9f9f49efff37ccf18ce2910518b89) Thanks [@kilbot](https://github.com/kilbot)! - no longer publishes test files

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d) Thanks [@kilbot](https://github.com/kilbot)! - Report product-level stock across all variants, showing the total quantity only when every variant has tracked, known stock.
  Draw the search magnifier with an attached, rounded handle and a larger ring.

- [#113](https://github.com/TallyUI/tallyui/pull/113) [`5885373`](https://github.com/TallyUI/tallyui/commit/58853734233d57ae3ceae4d67f3a64bd08aa569f) Thanks [@kilbot](https://github.com/kilbot)! - A variant disabled in Vendure (`enabled: false`, replicated since #110) is no longer offered, priced or counted: `getVariants`, `getPrices`, `getPrice`, `getRegularPrice`, `getStock` and `getVariantCount` now consider live variants only, and `isSellable` also requires at least one when the product has variants at all. A product with none left is not sellable, so `addProduct` refuses it (#104).

- [#114](https://github.com/TallyUI/tallyui/pull/114) [`51d4818`](https://github.com/TallyUI/tallyui/commit/51d4818161349bdb0cf9145a1a00a4bac4d5b4c8) Thanks [@kilbot](https://github.com/kilbot)! - Vendure pull robustness (backlog 29, 30, 31). The high-water mark and both skew probes now select only `id updatedAt`, not the full product query. A mid-pass checkpoint in the shape saved before #45's pass-state fields (`skip` and `updatedAt` alone) is recognised and normalised into a clean restart of the pass from offset 0, instead of resuming at an offset that no longer lines up with this pull's fixed-window paging. The skew guard's probe re-reads the high-water mark once before throwing, so a product deleted between the mark read and the probe settles into a clean pass instead of an error RxDB then has to retry.

- Updated dependencies [[`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b), [`50317c8`](https://github.com/TallyUI/tallyui/commit/50317c8520ebc04f2f6cdd47b9b9c6a0ed3efdd6), [`3e09957`](https://github.com/TallyUI/tallyui/commit/3e099573c771f130ffb6a5a3736527e908899257), [`a219ae0`](https://github.com/TallyUI/tallyui/commit/a219ae03588234d6e1a685a9924b52e115dcb7d1), [`4df9be4`](https://github.com/TallyUI/tallyui/commit/4df9be400debddb67859482c17f9e68dadbf46d1), [`9649259`](https://github.com/TallyUI/tallyui/commit/96492599bdb93fa573f588ae84585dc027289da8), [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09), [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005), [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e), [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8), [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17), [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99), [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a), [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764), [`f1af98c`](https://github.com/TallyUI/tallyui/commit/f1af98ce0161ded267e873ead952e8d7deafe471), [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be), [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d), [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766), [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588), [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4), [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9), [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9), [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5), [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6), [`ac2a24a`](https://github.com/TallyUI/tallyui/commit/ac2a24a147d1a759e7c5e28e73d0be90caa5e29b), [`8df0569`](https://github.com/TallyUI/tallyui/commit/8df0569d849f6099ec260eeb06e5c230172e12b5)]:
  - @tallyui/core@2.0.0

## 1.0.0

### Minor Changes

- [#4](https://github.com/TallyUI/tallyui/pull/4) [`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90) Thanks [@kilbot](https://github.com/kilbot)! - Initial npm release with build tooling

### Patch Changes

- Updated dependencies [[`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90)]:
  - @tallyui/core@0.2.0
