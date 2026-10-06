import type { RxCollection, RxDatabase } from 'rxdb';
import { createLogger } from '../logging';
import { openMigratedCollection } from '../rxdb/open-migrated-collection';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';

/** `addPosOrderCollection`'s logger: attach a sink to see, for example, the status writes a closing open dropped. */
export const posOrdersLogger = createLogger('pos-orders');

/**
 * After this long waiting for the open, a close gives up rather than hang forever. RxDB 17.5 cancels
 * a running migration as the database closes, and the open then rejects with
 * `PosOrderOpenClosedError`; the run reads or writes nothing more in a store the close closes (see
 * `openMigratedCollection`). The next open adds the collection without `autoMigrate` and starts and awaits the
 * migration directly, so it migrates again: RxDB 17.5's `startMigration()` ignores the leftover status
 * (only `migratePromise()` trusts a leftover `DONE`). It also resets that status, so the record
 * describes the new run, and removes the run's checkpoint (RxDB bug 1). An order that run already
 * copied is found equal and skipped, so no order is lost.
 */
export const POS_ORDER_MIGRATION_CLOSE_WAIT_MS = 10_000;

/**
 * `addPosOrderCollection` stopped, before any further write, because its database is closing: it
 * was called once `close()` had begun, the close cancelled its migration (RxDB 17.5), or the close
 * stopped waiting for it (after `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`). No order is lost: reopen the
 * database and call it again.
 */
export class PosOrderOpenClosedError extends Error {
  readonly code = 'POS_ORDER_OPEN_CLOSED';
  constructor(readonly databaseName: string) {
    super(`addPosOrderCollection: database ${databaseName} closed during the open; reopen it and open pos_orders again`);
    this.name = 'PosOrderOpenClosedError';
  }
}

/**
 * Adds `pos_orders` to `db` and resolves once no order of an older version is left to migrate.
 * On DM4 it rejects after the migration has stopped and closes the collection. It rejects with
 * `PosOrderOpenClosedError` when the database is closing. `closeWaitMs` is for tests only.
 * See `openMigratedCollection` for the migration and close mechanism.
 */
export function addPosOrderCollection(db: RxDatabase, closeWaitMs = POS_ORDER_MIGRATION_CLOSE_WAIT_MS): Promise<RxCollection<PosOrder>> {
  return openMigratedCollection<PosOrder>(db, { name: 'pos_orders', creator: posOrderCollection, label: 'addPosOrderCollection',
    logger: posOrdersLogger, closedError: (name) => new PosOrderOpenClosedError(name) }, closeWaitMs);
}
