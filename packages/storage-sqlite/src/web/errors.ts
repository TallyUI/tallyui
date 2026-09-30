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

// How RM1 appears inside the remote storage's wrapping message (the RxError as JSON).
const RM1_IN_MESSAGE = '"code":"RM1"';

function namesStartError(message: string): boolean {
  return message.includes('StorageWorkerStartError') || message.includes(RM1_IN_MESSAGE);
}

export function isStorageWorkerStartError(error: unknown): boolean {
  if (typeof error === 'string') return namesStartError(error);
  if (!error || typeof error !== 'object') return false;
  const { name, message, code } = error as { name?: unknown; message?: unknown; code?: unknown };
  if (name === 'StorageWorkerStartError' || code === 'RM1') return true;
  return typeof message === 'string' && namesStartError(message);
}
