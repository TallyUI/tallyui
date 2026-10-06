# @tallyui/storage-sqlite

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

- 3332558: Tell the three start failures apart (#293), each with its own sentence for the cashier. Storage unavailable, as in a Safari private window where the browser gives the worker no usable OPFS, is the new `StorageUnavailableError`, recognised with `isStorageUnavailableError`. Another tab holding the database is recognised with the new `isStorageHeldError`. A stale worker stays `isRxdbRemoteVersionMismatch` from `@tallyui/core` (RM1). `isStorageWorkerStartError` still means any failed start except storage unavailable, and every start error carries its cause's name and message in its own message.

### Patch Changes

- 1f4d0ab: `isStorageWorkerStartError` and `isStorageWorkerFailure` also recognise RxDB's RM1, a stale storage worker built on another RxDB version (for example a cached old worker after an upgrade), so apps show their reload advice for it. Both call the new `isRxdbRemoteVersionMismatch` in `@tallyui/core`, which recognises RM1 by structure only: an RxError's own `code`, or the remote storage's `could not create instance ` wrapping of an RxError's JSON. `@tallyui/storage-sqlite` now has `@tallyui/core` as a peer dependency.
- f96d185: Make the SQLite handle type the minimal interface used by the adapter, accepting expo-sqlite 16's `SQLiteDatabase`.
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

- [#304](https://github.com/TallyUI/tallyui/pull/304) [`3332558`](https://github.com/TallyUI/tallyui/commit/3332558f2cc710f4b3ae7589bcf9ea07c31e42ec) Thanks [@kilbot](https://github.com/kilbot)! - Tell the three start failures apart (#293), each with its own sentence for the cashier. Storage unavailable, as in a Safari private window where the browser gives the worker no usable OPFS, is the new `StorageUnavailableError`, recognised with `isStorageUnavailableError`. Another tab holding the database is recognised with the new `isStorageHeldError`. A stale worker stays `isRxdbRemoteVersionMismatch` from `@tallyui/core` (RM1). `isStorageWorkerStartError` still means any failed start except storage unavailable, and every start error carries its cause's name and message in its own message.

### Patch Changes

- [#280](https://github.com/TallyUI/tallyui/pull/280) [`1f4d0ab`](https://github.com/TallyUI/tallyui/commit/1f4d0ab8006f41586740195831aaa0c9adc17f15) Thanks [@kilbot](https://github.com/kilbot)! - `isStorageWorkerStartError` and `isStorageWorkerFailure` also recognise RxDB's RM1, a stale storage worker built on another RxDB version (for example a cached old worker after an upgrade), so apps show their reload advice for it. Both call the new `isRxdbRemoteVersionMismatch` in `@tallyui/core`, which recognises RM1 by structure only: an RxError's own `code`, or the remote storage's `could not create instance ` wrapping of an RxError's JSON. `@tallyui/storage-sqlite` now has `@tallyui/core` as a peer dependency.

- [#198](https://github.com/TallyUI/tallyui/pull/198) [`f96d185`](https://github.com/TallyUI/tallyui/commit/f96d1851ef6732f3f69dccb5f5008eaf81889a57) Thanks [@kilbot](https://github.com/kilbot)! - Make the SQLite handle type the minimal interface used by the adapter, accepting expo-sqlite 16's `SQLiteDatabase`.

- Updated dependencies [[`4de75c2`](https://github.com/TallyUI/tallyui/commit/4de75c2e844d53fdbccd40c4ad4d4004a0641f57), [`894b6ae`](https://github.com/TallyUI/tallyui/commit/894b6aec27fcc157e65e68fee1f8134ef201712f), [`04905ef`](https://github.com/TallyUI/tallyui/commit/04905efd0c23a77159ce0682ed34df4567896bf0), [`faa7cda`](https://github.com/TallyUI/tallyui/commit/faa7cda925c6ca52e47357bd09d920813051c62b), [`9f34416`](https://github.com/TallyUI/tallyui/commit/9f34416619db35733ef85d98b225be5c046d12d5), [`fb57e1d`](https://github.com/TallyUI/tallyui/commit/fb57e1d8d97c3e03603a3bcc49470ce73bdb3b6d), [`898e98b`](https://github.com/TallyUI/tallyui/commit/898e98ba31387bbece8b79c5c0cc50d27f8cd3af), [`75c5dce`](https://github.com/TallyUI/tallyui/commit/75c5dced41a1c99da03614304fc87adad4bc684c), [`ba63f04`](https://github.com/TallyUI/tallyui/commit/ba63f04ef725774ec762a34a619534abb3bf2339), [`0d04d13`](https://github.com/TallyUI/tallyui/commit/0d04d13eff8a3bf7aed7cf747464e145a74dea35), [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4), [`24b74fd`](https://github.com/TallyUI/tallyui/commit/24b74fdfe39198c124cac707c31106affd7cc93b), [`54ee98a`](https://github.com/TallyUI/tallyui/commit/54ee98a583d5543538fb0641aa322a87e5f8cfaf), [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1), [`e59ebec`](https://github.com/TallyUI/tallyui/commit/e59ebecfc580bc5bca706c8e37fc825281a88cef), [`2ecaa36`](https://github.com/TallyUI/tallyui/commit/2ecaa3661eae0ad8ec5d0ce3a344dc24262f387b), [`901fa66`](https://github.com/TallyUI/tallyui/commit/901fa666f4ab345bf07b2d6b38c6e5dc58596f39), [`bf2d805`](https://github.com/TallyUI/tallyui/commit/bf2d805334c83d4f20f408e185add336331de38e), [`ca0beac`](https://github.com/TallyUI/tallyui/commit/ca0beacdafb14f3b5cae7c7593de23ed82b0d2d5), [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f), [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8), [`5c90aed`](https://github.com/TallyUI/tallyui/commit/5c90aed083d8245e12a645aafa9c9e6a3e7bbc61), [`668f71f`](https://github.com/TallyUI/tallyui/commit/668f71f6cf06af4a41fe686e98546f25e2e191ee), [`457162d`](https://github.com/TallyUI/tallyui/commit/457162d04dcd3c6f588cdb6ab90efea36081f4df), [`222543b`](https://github.com/TallyUI/tallyui/commit/222543b8c9130d2c79a294603195940143bd611c), [`8141c1c`](https://github.com/TallyUI/tallyui/commit/8141c1cb1591a8b8299ffc00fe4f9a77a7cd8289), [`ce4f796`](https://github.com/TallyUI/tallyui/commit/ce4f796aff7c739cb555b61f9a167cc803d8b5c2), [`6673faf`](https://github.com/TallyUI/tallyui/commit/6673fafcc682e825c94cfc66932da07cabd24e35), [`1f4d0ab`](https://github.com/TallyUI/tallyui/commit/1f4d0ab8006f41586740195831aaa0c9adc17f15), [`5ed6281`](https://github.com/TallyUI/tallyui/commit/5ed62816fe28a3ef3b001600b9d6a08de22d4a7e), [`5a204a9`](https://github.com/TallyUI/tallyui/commit/5a204a949e33f53d6087845d59e4bab1fe4a1474), [`7d1bc98`](https://github.com/TallyUI/tallyui/commit/7d1bc98b842258d67f6d5d380bc925e16e649ca2)]:
  - @tallyui/core@3.0.0-next.0

## 2.0.0

### Minor Changes

- [#33](https://github.com/TallyUI/tallyui/pull/33) [`a0d2b90`](https://github.com/TallyUI/tallyui/commit/a0d2b903c012747bed500221e9ec212367328b87) Thanks [@kilbot](https://github.com/kilbot)! - `getRxStorageSQLite(database)` now returns RxDB Premium's SQLite storage instead of TallyUI's own engine, so writes are transactional and queries run on real SQLite. The call is unchanged: pass a synchronous SQLite handle such as expo-sqlite's `openDatabaseSync(...)`. `rxdb-premium@16.21.1` is now a peer dependency that your app installs under its own RxDB Premium licence. Use one handle per RxDB database; the storage never closes the handle, your app does.

- [#70](https://github.com/TallyUI/tallyui/pull/70) [`c15c04d`](https://github.com/TallyUI/tallyui/commit/c15c04d154ad41b60f560aabf1f054d3fe97ae74) Thanks [@kilbot](https://github.com/kilbot)! - Adds the web storage (ADR-061): `getRxStorageSQLiteWasm` from `@tallyui/storage-sqlite/web` runs RxDB Premium's SQLite storage on `@sqlite.org/sqlite-wasm`'s opfs-sahpool VFS, in one dedicated worker owned by the live tab, reached through premium's `getRxStorageWorker` in mode `'one'`. The app supplies the worker input, for example `() => new Worker(new URL('@tallyui/storage-sqlite/web-worker', import.meta.url), { type: 'module' })`. `@sqlite.org/sqlite-wasm` is now a peer dependency that your app installs. The returned storage carries `tallyEngine: 'sqlite-sahpool'` so callers can recognise it. The root export is unchanged and does not pull in wasm.

- [#71](https://github.com/TallyUI/tallyui/pull/71) [`14871a2`](https://github.com/TallyUI/tallyui/commit/14871a272e201dc11ed64ebc16a2c19dc6971e2d) Thanks [@kilbot](https://github.com/kilbot)! - Added `tallyui-build-sqlite-worker`, a bin script that prebuilds the web-worker entry (with esbuild) and copies `sqlite3.wasm` next to it, for Metro/Expo web apps that can't bundle a module worker at runtime.

- [#100](https://github.com/TallyUI/tallyui/pull/100) [`94e1f09`](https://github.com/TallyUI/tallyui/commit/94e1f097ff3ebe548d9d83169f872732bac4d6bd) Thanks [@kilbot](https://github.com/kilbot)! - `getRxStorageSQLiteWasm` returns a storage with `terminate()`, which stops its worker and clears the cached channel, so a fresh open after the live-tab park no longer hangs.

### Patch Changes

- [#74](https://github.com/TallyUI/tallyui/pull/74) [`0121559`](https://github.com/TallyUI/tallyui/commit/01215594f7fd15414c91b1d9333b0b9c6ba53309) Thanks [@kilbot](https://github.com/kilbot)! - Removes the unreleased multi-tab database machinery in favour of one live tab per store (ADR-061): `CreateDatabaseOptions.multiInstance` (`createTallyDatabase` always passes `multiInstance: false`), the `tally-outbox-flush` and `tally-outbox-state` local documents, and follower forwarding between tabs are all gone. The outbox's public API (`flush`, `requeue`, `start`, `stop`, `state$`) and its single-instance behaviour are unchanged. Apps enforce one live tab with `startLiveTab`.

  `@tallyui/storage-sqlite`'s worker now swallows the `ready` promise's rejection so a pool install failure before any `createStorageInstance` call doesn't surface as an unhandled rejection, and its `files` list no longer publishes test files, matching `@tallyui/database` and `@tallyui/pos`.

- [#72](https://github.com/TallyUI/tallyui/pull/72) [`91d9169`](https://github.com/TallyUI/tallyui/commit/91d9169a004b24c2b9a9f5d5f7e8b835b37b9730) Thanks [@kilbot](https://github.com/kilbot)! - The worker listens before start-up finishes, fixing a hang on every cold start in real browsers.

- [#91](https://github.com/TallyUI/tallyui/pull/91) [`fec2ee7`](https://github.com/TallyUI/tallyui/commit/fec2ee7748324944059e9ba569d35d7f9bf4f44b) Thanks [@kilbot](https://github.com/kilbot)! - The worker build bin no longer needs a built dist.

## 0.2.0

### Minor Changes

- [#4](https://github.com/TallyUI/tallyui/pull/4) [`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90) Thanks [@kilbot](https://github.com/kilbot)! - Initial npm release with build tooling
