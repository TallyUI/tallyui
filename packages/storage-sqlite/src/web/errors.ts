/**
 * Thrown by the web SQLite worker's storage (ADR-061) when start-up failed
 * with OPFS reachable: another tab holds the opfs-sahpool database, or an
 * unexpected failure. Keeps the original failure as `cause`, and its name
 * and message in this error's message.
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

/**
 * Thrown by the worker's storage when the browser gives it no usable OPFS, as in a Safari private window (#293):
 * `getDirectory()` fails or sync access handles are missing. Closing tabs or reloading can't help, so its message,
 * which carries its name like `StorageWorkerStartError`'s, never contains `StorageWorkerStartError`.
 */
export class StorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

/** True for a `StorageUnavailableError`, its `{ name, message }` copy or its message (see above). */
export function isStorageUnavailableError(error: unknown): boolean {
  if (typeof error === 'string') return error.includes('StorageUnavailableError');
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === 'StorageUnavailableError' || (typeof message === 'string' && message.includes('StorageUnavailableError'));
}
