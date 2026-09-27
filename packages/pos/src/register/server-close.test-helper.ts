import { expect } from 'vitest';
import type { RegisterSessionCollection } from './session-store';

/**
 * Closes a session straight in storage, as a replication pull (registers c2's server sync) would:
 * past the store's `transition`, the cached `findOne(id)` and any local guard.
 */
export async function serverClose(sessions: RegisterSessionCollection, id: string) {
  const storage = sessions.storageInstance;
  const [previous] = await storage.findDocumentsById([id], false);
  const at = new Date().toISOString();
  const closed = { ...previous, status: 'closed' as const, pending_status: 'closed', status_at: at, closed_at_gmt: at, closure_id: id };
  expect((await storage.bulkWrite([{ previous, document: closed }], 'server-close')).error).toEqual([]);
}
