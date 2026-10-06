import type { RxCollection, RxDatabase } from 'rxdb';
import { createLogger } from '../logging';
import { openMigratedCollection } from '../rxdb/open-migrated-collection';
import { registerSessionCreator, type RegisterSession } from './schemas';

/** `addRegisterSessionCollection`'s logger: attach a sink to see dropped status writes during close. */
export const registerSessionsLogger = createLogger('register-sessions');

/** How long a close waits for the open; see `openMigratedCollection` for the cancellation mechanism. */
export const REGISTER_SESSION_MIGRATION_CLOSE_WAIT_MS = 10_000;

/** The database is closing; no session is lost. Reopen the database and call the opener again. */
export class RegisterSessionOpenClosedError extends Error {
  readonly code = 'REGISTER_SESSION_OPEN_CLOSED';
  constructor(readonly databaseName: string) {
    super(`addRegisterSessionCollection: database ${databaseName} closed during the open; reopen it and open register_sessions again`);
    this.name = 'RegisterSessionOpenClosedError';
  }
}

/**
 * Adds `register_sessions` and resolves once no older session is left to migrate; the register
 * document, a local document, is kept. On DM4 it rejects after migration stops and closes the collection.
 * A closing database rejects with `RegisterSessionOpenClosedError`; `closeWaitMs` is for tests only.
 * See `openMigratedCollection` for the migration and close mechanism.
 */
export function addRegisterSessionCollection(db: RxDatabase, closeWaitMs = REGISTER_SESSION_MIGRATION_CLOSE_WAIT_MS): Promise<RxCollection<RegisterSession>> {
  return openMigratedCollection<RegisterSession>(db, { name: 'register_sessions', creator: registerSessionCreator,
    label: 'addRegisterSessionCollection', logger: registerSessionsLogger, closedError: (name) => new RegisterSessionOpenClosedError(name) }, closeWaitMs);
}
