// Kept apart from `StorageWorkerStartError` (./errors), which the worker imports: @tallyui/core's
// main entry carries React context, and it must stay out of the worker bundle.
import { isRxdbRemoteVersionMismatch } from '@tallyui/core';

/**
 * True for a `StorageWorkerStartError`, its `{ name, message }` copy or its
 * message (see ./errors), and for RxDB's RM1: a stale worker is a failed
 * start too, and reloading loads the matching worker. False for a
 * `StorageUnavailableError`, whose message never names this error.
 * It means "any failed start": to choose wording, an app maps the three
 * specific predicates instead: `isStorageUnavailableError`,
 * `isStorageHeldError`, and `isRxdbRemoteVersionMismatch` (@tallyui/core).
 */
export function isStorageWorkerStartError(error: unknown): boolean {
  if (isRxdbRemoteVersionMismatch(error)) return true;
  if (typeof error === 'string') return error.includes('StorageWorkerStartError');
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === 'StorageWorkerStartError' || (typeof message === 'string' && message.includes('StorageWorkerStartError'));
}
