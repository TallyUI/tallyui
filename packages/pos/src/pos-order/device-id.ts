import { uuidv7 } from './uuidv7';

/** The device id used when no storage is available, shared by every caller in this process. */
let processId: string | undefined;

/**
 * Returns this device's id (a UUIDv7), stored under `key` in `storage` (web storage, or an app's
 * equivalent) and minted on first use; medusapos passes `'medusapos.register_id'`. With no storage,
 * or one that throws on read or write, it falls back to one id per process.
 */
export function getDeviceId(storage: { getItem(key: string): string | null; setItem(key: string, value: string): void } | null,
  key: string): string {
  try {
    if (storage) {
      const existing = storage.getItem(key);
      if (existing) return existing;
      const id = uuidv7();
      storage.setItem(key, id);
      return id;
    }
  } catch { /* Use the process id when web storage is unavailable. */ }
  return processId ??= uuidv7();
}
