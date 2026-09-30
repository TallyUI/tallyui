// How RxDB's remote storage re-throws a worker's rejected createStorageInstance on the main thread
// (rxdb 17.5.0 src/plugins/storage-remote/rx-storage-remote.ts:100):
// `new Error('could not create instance ' + JSON.stringify(error))`.
const REMOTE_CREATE_PREFIX = 'could not create instance ';

/**
 * True for RxDB's RM1: the remote storage worker was built on another RxDB
 * version than the main thread, e.g. a stale worker the browser cached from
 * before an upgrade. Reloading loads the matching worker.
 *
 * Matched by structure, never by substring. An `RxError` (rxdb 17.5.0
 * src/rx-error.ts) has own `code`, `message`, `url`, `parameters` and
 * `rxdb: true`; its `name` is a getter. So RM1 is either an object whose own
 * `code` is `'RM1'` (with `rxdb === true` when `rxdb` is present), or an
 * error, `{ message }` copy or string whose message is the remote storage's
 * `could not create instance ` followed by JSON with `rxdb: true` and
 * `code: 'RM1'`. Needs no rxdb import.
 */
export function isRxdbRemoteVersionMismatch(error: unknown): boolean {
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
