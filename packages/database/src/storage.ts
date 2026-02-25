import type { RxStorage } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

/**
 * Returns the appropriate RxDB storage adapter for the current platform.
 *
 * - Web browser: Dexie (IndexedDB)
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

  // Web browser — use Dexie (IndexedDB)
  // Dynamic import avoided here; Dexie is bundled with rxdb.
  const { getRxStorageDexie } = require('rxdb/plugins/storage-dexie');
  return getRxStorageDexie();
}
