import type { RxStorage } from 'rxdb';

/** WCPOS's value (ADR-061): the deadline for a storage worker call. */
export const STORAGE_WRITE_DEADLINE_MS = 10_000;

/** Raised when a storage worker call (create or write) misses its deadline. */
export class StorageWorkerTimeoutError extends Error {
  constructor(message = `Storage worker call did not complete within ${STORAGE_WRITE_DEADLINE_MS}ms; the worker may be dead. Reload the app to recover.`) {
    super(message);
    this.name = 'StorageWorkerTimeoutError';
  }
}

export function isStorageWorkerTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'StorageWorkerTimeoutError';
}

/**
 * True for the write-deadline timeout, and for `StorageWorkerStartError`
 * (raised by `@tallyui/storage-sqlite/web` when the worker cannot open the
 * opfs-sahpool pool), matched by `name` or by the substring
 * `StorageWorkerStartError` anywhere in the message. RxDB's remote storage
 * re-throws the worker's error serialised across the worker boundary as a
 * plain `Error` whose message embeds the original name as JSON, so a
 * substring match (`includes`, not `startsWith`) is needed to still
 * recognise it.
 *
 * A worker that crashes mid-call never replies (RxDB `storage-remote`,
 * 16.21.1), so the deadline is what catches that case.
 */
export function isStorageWorkerFailure(error: unknown): boolean {
  return isStorageWorkerTimeout(error) || (error instanceof Error
    && (error.name === 'StorageWorkerStartError' || error.message.includes('StorageWorkerStartError')));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new StorageWorkerTimeoutError()), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// A Proxy that forwards everything to `target` unchanged — methods bound to
// `target`, not the proxy — except `prop`, which is replaced.
function proxyExcept<T extends object>(target: T, prop: string, replacement: (...args: any[]) => any): T {
  return new Proxy(target, {
    get(t, p) {
      if (p === prop) return replacement;
      const value = Reflect.get(t, p, t);
      return typeof value === 'function' ? value.bind(t) : value;
    },
  });
}

/**
 * Wraps a storage so each instance's `createStorageInstance` and `bulkWrite`
 * race against `ms` (default `STORAGE_WRITE_DEADLINE_MS`), rejecting with
 * `StorageWorkerTimeoutError` on timeout. The storage and its instances are
 * otherwise unchanged, and the `tallyEngine` marker is kept.
 */
export function withWriteDeadline(storage: RxStorage<any, any>, ms: number = STORAGE_WRITE_DEADLINE_MS): RxStorage<any, any> {
  return proxyExcept(storage, 'createStorageInstance', async (params: unknown) => {
    const instance: any = await withTimeout((storage as any).createStorageInstance(params), ms);
    return proxyExcept(instance, 'bulkWrite', (...args: unknown[]) => withTimeout(instance.bulkWrite(...args), ms));
  }) as RxStorage<any, any>;
}
