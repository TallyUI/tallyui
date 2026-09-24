# @tallyui/storage-sqlite

RxDB Premium SQLite storage for TallyUI: a synchronous SQLite handle
(`expo-sqlite`) on native, and SQLite-wasm on `opfs-sahpool` in one dedicated
worker on the web (ADR-061 in `docs/DECISIONS.md`).

`rxdb-premium` needs a licence key to install (ADR-031). Locally, set
`RXDB_PREMIUM=<token>`, see `docs/CONTRIBUTING.md`; in CI it comes from the
`RXDB_LICENSE_KEY` secret. `@sqlite.org/sqlite-wasm` and `expo-sqlite` are
both optional peer dependencies: a native app installs only the first, a web
app only the second.

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
into the app's `public/` folder — for example with a small esbuild script —
and passes that built file's string URL as `workerInput`:

```ts
const storage = getRxStorageSQLiteWasm({ workerInput: '/tallyui-storage-worker.js' });
```

WCPOS `next` prebuilds its own worker the same way; point an esbuild script
at it for the exact build step.

`workerOptions` (the module type and the worker's debug name) only applies
when `workerInput` is a string or URL — RxDB Premium then constructs the
`Worker` itself. When `workerInput` is a function, as in the Vite example,
the function creates the `Worker`, so `workerOptions` is ignored; pass
`{ type: 'module' }` (and a name, if wanted) to the constructor call inside
the function instead.

### Recognising a failed start

If the worker's start-up fails — most commonly another tab still holding the
opfs-sahpool database, or a browser with no OPFS or no sync access handles —
every storage call rejects with a `StorageWorkerStartError` instead of
hanging. Recognise it with `isStorageWorkerStartError` and tell the user to
close other tabs or reload:

```ts
import { isStorageWorkerStartError } from '@tallyui/storage-sqlite/web';

try {
  await db.addCollections({ /* ... */ });
} catch (error) {
  if (isStorageWorkerStartError(error)) {
    showMessage('Close other tabs or reload.');
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
