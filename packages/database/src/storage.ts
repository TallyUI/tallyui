import type { RxStorage } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

/**
 * Returns the appropriate RxDB storage adapter for the current platform.
 *
 * - Web browser: Dexie (IndexedDB)
 * - React Native: SQLite (via @tallyui/storage-sqlite, when available)
 * - Node/SSR/test: In-memory
 *
 * Override by passing a storage directly to createTallyDatabase().
 */
export function getStorage(): RxStorage<any, any> {
  // Node.js / SSR / test — no persistent storage needed
  if (typeof window === 'undefined') {
    return getRxStorageMemory();
  }

  // Web browser — use Dexie (IndexedDB)
  // Dynamic import avoided here; Dexie is bundled with rxdb.
  const { getRxStorageDexie } = require('rxdb/plugins/storage-dexie');
  return getRxStorageDexie();
}
