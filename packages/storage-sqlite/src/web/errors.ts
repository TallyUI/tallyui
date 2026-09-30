/**
 * Thrown by the web SQLite worker's storage (ADR-061) when start-up failed:
 * another tab may hold the opfs-sahpool database, or this browser has no
 * OPFS or sync access handles. Keeps the original failure as `cause`.
 *
 * RxDB's remote-storage channel re-throws a rejected `createStorageInstance`
 * on the main thread as a plain `Error` whose message embeds the original
 * error's `name` as JSON, since `name` itself does not survive the trip.
 * `isStorageWorkerStartError` matches that fixed substring in the message
 * too, for whichever of the error, a `{ name, message }` copy, or the
 * message alone actually arrives.
 *
 * RxDB's RM1 (the worker was built on another RxDB version, e.g. a cached old
 * worker after an upgrade) is recognised too: a stale worker is a failed
 * start, and reloading loads the matching worker.
 */
export class StorageWorkerStartError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageWorkerStartError';
  }
}

// RxDB's RM1 (rxdb 17.5.0 src/rx-error.ts): an RxError has own `code`, `message`, `url`, `parameters`
// and `rxdb: true` (`name` is a getter). RxDB's remote storage re-throws it from the worker as
// `could not create instance ` + that JSON. Keep identical to isRxdbRm1 in
// packages/database/src/storage-watchdog.ts; change both together.
const REMOTE_CREATE_PREFIX = 'could not create instance ';
function isRxdbRm1(error: unknown): boolean {
  const { code, rxdb, message } = (typeof error === 'object' && error !== null ? error : {}) as Record<string, unknown>;
  if (code === 'RM1' && (rxdb ?? true) === true) return true;
  const text = typeof error === 'string' ? error : message;
  if (typeof text !== 'string' || !text.startsWith(REMOTE_CREATE_PREFIX)) return false;
  try {
    const wrapped = JSON.parse(text.slice(REMOTE_CREATE_PREFIX.length)) as Record<string, unknown> | null;
    return wrapped?.rxdb === true && wrapped.code === 'RM1';
  } catch {
    return false;
  }
}

export function isStorageWorkerStartError(error: unknown): boolean {
  if (isRxdbRm1(error)) return true;
  if (typeof error === 'string') return error.includes('StorageWorkerStartError');
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === 'StorageWorkerStartError' || (typeof message === 'string' && message.includes('StorageWorkerStartError'));
}
