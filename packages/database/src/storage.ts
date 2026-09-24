import type { RxStorage } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

/**
 * Returns the appropriate RxDB storage adapter for the current platform.
 *
 * - Web browser: throws with guidance to pass the SQLite-wasm storage
 *   explicitly (ADR-061) — there is no default web storage any more.
 * - React Native: throws with guidance to provide SQLite storage explicitly
 * - Node/SSR/test: In-memory
 *
 * Override by passing a storage directly to createTallyDatabase().
 */
export function getStorage(): RxStorage<any, any> {
  // Node.js / SSR / test — no persistent storage needed
  if (typeof window === 'undefined') {
    return getRxStorageMemory();
  }

  // React Native — no IndexedDB available.
  // Users must provide SQLite storage explicitly via createTallyDatabase({ storage }).
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    throw new Error(
      'React Native detected. Pass a storage adapter explicitly:\n' +
      '  import { getRxStorageSQLite } from "@tallyui/storage-sqlite";\n' +
      '  createTallyDatabase({ connector, storage: getRxStorageSQLite({ database }) })'
    );
  }

  // Web browser (ADR-061, breaking): the web storage is no longer Dexie.
  // getStorage() can't build it itself — it needs a worker entry the app's
  // own bundler emits — so pass it explicitly.
  throw new Error(
    'Web storage is RxDB Premium SQLite-wasm, not Dexie (ADR-061). Pass it explicitly, bundling the worker entry:\n' +
    '  import { getRxStorageSQLiteWasm } from "@tallyui/storage-sqlite/web";\n' +
    '  const workerInput = new URL("@tallyui/storage-sqlite/web-worker", import.meta.url);\n' +
    '  createTallyDatabase({ connector, storage: getRxStorageSQLiteWasm({ workerInput }) })'
  );
}
