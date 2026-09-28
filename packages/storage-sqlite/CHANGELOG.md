# @tallyui/storage-sqlite

## 2.1.0

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
