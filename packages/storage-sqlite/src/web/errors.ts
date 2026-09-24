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
 */
export class StorageWorkerStartError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageWorkerStartError';
  }
}

export function isStorageWorkerStartError(error: unknown): boolean {
  if (typeof error === 'string') return error.includes('StorageWorkerStartError');
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === 'StorageWorkerStartError' || (typeof message === 'string' && message.includes('StorageWorkerStartError'));
}
