# @tallyui/storage-sqlite

RxDB Premium SQLite storage for TallyUI: a synchronous SQLite handle
(`expo-sqlite`) on native, and SQLite-wasm on `opfs-sahpool` in one dedicated
worker on the web (ADR-061 in `docs/DECISIONS.md`).

`rxdb-premium` needs a licence key to install (ADR-031). Locally, set
`RXDB_PREMIUM=<token>`, see `docs/CONTRIBUTING.md`; in CI it comes from the
`RXDB_PREMIUM` secret. `expo-sqlite` and `@sqlite.org/sqlite-wasm` are both
optional peer dependencies: a native app installs only the first, a web app
only the second.

## Upgrading to 3.0.0

3.0.0 moves to RxDB and RxDB Premium 17.5.0 (with `@tallyui/pos` and
`@tallyui/database` 3.0.0). See ADR-069 in `docs/DECISIONS.md`.

- **Storage is one-way.** Once a till has opened 3.0.0, an older build shows
  no orders and sends none of the pending ones until the till is upgraded
  again. Nothing is deleted. Never roll an app back across 3.0.0, and never
  re-ring the sales it hides.
- A web app ships the 17.5.0 storage worker with the 17.5.0 main thread.
- Pin `rxdb` and `rxdb-premium` to exactly `17.5.0`.
- RxDB 17 defaults `toggleOnDocumentVisible` to true: a replication no longer
  keeps a hidden tab awake, so a browser may throttle its pull (see the
  changeset for the detail).

## Supported handles

- Native: expo-sqlite 16's `SQLiteDatabase` from `openDatabaseSync`, checked at
  compile time by `typecheck/expo-handle.ts`. The peer range allows 15, which
  isn't checked.
- Node: a `node:sqlite` `DatabaseSync` wrapped like `src/node-sqlite.test-helper.ts`.
- Web: `getRxStorageSQLiteWasm` takes `workerInput`; the worker opens its own
  SQLite-wasm `opfs-sahpool` handle, so callers do not supply a database handle.

Any handle with `execSync`, `getAllSync`, and `runSync` matching the minimal
`SQLiteDatabase` interface works with `getRxStorageSQLite`.

## Web (SQLite-wasm)

`getRxStorageSQLiteWasm` (from `@tallyui/storage-sqlite/web`) runs SQLite-wasm
on `opfs-sahpool` inside one dedicated worker, reached through RxDB Premium's
`getRxStorageWorker` in mode `'one'`. `createSyncAccessHandle`, which
opfs-sahpool needs, exists only inside a dedicated worker, and opfs-sahpool
holds exclusive OPFS access handles for the whole origin — so the app must
run **exactly one live tab, one dedicated worker** per store (ADR-061 in
`docs/DECISIONS.md`); a second tab cannot open storage at all, and the
recovery from a dead or hung worker is a reload.

The app supplies the worker itself, as `workerInput`:

```ts
import { getRxStorageSQLiteWasm } from '@tallyui/storage-sqlite/web';

const storage = getRxStorageSQLiteWasm({ workerInput /* see below */ });
```

### Vite

Pass a module-worker factory as `workerInput`:

```ts
const storage = getRxStorageSQLiteWasm({
  workerInput: () =>
    new Worker(new URL('@tallyui/storage-sqlite/web-worker', import.meta.url), { type: 'module' }),
});
```

and exclude the wasm package from dependency pre-bundling, so Vite emits
`sqlite3.wasm` as a static asset instead of trying to bundle it:

```ts
// vite.config.ts
export default defineConfig({
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
});
```

### Expo web (Metro)

Metro cannot bundle a module worker, so a Metro app prebuilds the
`@tallyui/storage-sqlite/web-worker` entry, together with `sqlite3.wasm`,
into the app's `public/` folder, as part of the app's own build:

```sh
npm install --save-dev esbuild
npx tallyui-build-sqlite-worker public/
```

Add the built files to the app's `.gitignore` (they link rxdb-premium code
under the app's own licence, so they must never be committed or published):

```
public/tallyui-sqlite-worker.js
public/sqlite3.wasm
```

and pass the built file's string URL as `workerInput`:

```ts
const storage = getRxStorageSQLiteWasm({ workerInput: '/tallyui-sqlite-worker.js' });
```

WCPOS `next` prebuilds its own worker the same way, as part of its own build
step.

`workerOptions` (the module type and the worker's debug name) only applies
when `workerInput` is a string or URL — RxDB Premium then constructs the
`Worker` itself. When `workerInput` is a function, as in the Vite example,
the function creates the `Worker`, so `workerOptions` is ignored; pass
`{ type: 'module' }` (and a name, if wanted) to the constructor call inside
the function instead.

### Recognising a failed start

If the worker's start-up fails, every storage call rejects instead of
hanging, with one of two errors. Each carries its cause's name and message in
its own message, since the cause itself doesn't cross the worker channel.

- **Storage unavailable: `StorageUnavailableError`**, recognised with
  `isStorageUnavailableError`. The browser gives the page no usable OPFS:
  `navigator.storage.getDirectory()` fails, or sync access handles are
  missing. This is what happens in a **private window**: Safari Private
  Browsing (WebKit's ephemeral storage, #293) refuses OPFS. No other tab is
  involved, and neither closing tabs nor reloading helps, so
  `isStorageWorkerStartError` is false for it.
- **Held by another tab, or a stale worker: `StorageWorkerStartError`**,
  recognised with `isStorageWorkerStartError`. OPFS is reachable, but another
  tab holds the opfs-sahpool database (WebKit's `InvalidStateError`,
  Chromium's `NoModificationAllowedError`). A stale worker counts too: after
  an upgrade the browser may still have the old worker cached, and RxDB
  refuses it (RM1). Any other start failure is a `StorageWorkerStartError`
  as well, with its cause in the message.

Check for storage unavailable first. The wording TallyUI apps use:

```ts
import { isStorageUnavailableError, isStorageWorkerStartError } from '@tallyui/storage-sqlite/web';

try {
  await db.addCollections({ /* ... */ });
} catch (error) {
  if (isStorageUnavailableError(error)) {
    showMessage(
      "This till can't save sales in a private window.",
      'Open it in a normal Safari window (or another browser) and sign in again. Nothing has been lost: no sale was taken here.'
    );
  } else if (isStorageWorkerStartError(error)) {
    showMessage('This till is already open in another tab. Close the other tab, then reload this one.');
  } else {
    throw error;
  }
}
```

### Single live tab

A second tab must never open storage while the first one holds it; see
ADR-061 in `docs/DECISIONS.md` for the accepted take-over flow (a
BroadcastChannel hand-over with a timeout, and a parked "POS is open in
another tab" screen), which is a separate job from this package.
