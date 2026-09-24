import { BehaviorSubject, type Observable } from 'rxjs';
import type { RxStorage } from 'rxdb';

/** WCPOS's value (ADR-061): a write pending longer than this is flagged as stalled, never failed. */
export const STORAGE_WRITE_STALL_MS = 10_000;

/** WCPOS's value (ADR-061): two consecutive silent read windows of this length mean the worker is dead. */
export const STORAGE_READ_WATCHDOG_MS = 30_000;

export interface StorageHealth {
  /** 'ok'; 'stalled' while a write has been pending longer than writeStallMs; 'dead' after two silent read windows (reload to recover, ADR-061). */
  status: 'ok' | 'stalled' | 'dead';
  /** Writes pending longer than writeStallMs right now. */
  stalledWrites: number;
  /** When the oldest stalled write started (ms since epoch), if any. */
  stalledSince?: number;
}

export interface StorageWatchdogOptions {
  writeStallMs?: number;
  readWatchdogMs?: number;
  /** Injectable clock, for tests. */
  now?: () => number;
  /** Injectable timer, for tests: runs `fn` once after `ms` and returns a cancel function. */
  setTimer?: (fn: () => void, ms: number) => () => void;
}

/**
 * True for `StorageWorkerStartError` (raised by `@tallyui/storage-sqlite/web`
 * when the worker cannot open the opfs-sahpool pool), matched by `name` or by
 * the substring `StorageWorkerStartError` anywhere in the message. RxDB's
 * remote storage re-throws the worker's error serialised across the worker
 * boundary as a plain `Error` whose message embeds the original name as JSON,
 * so a substring match (`includes`, not `startsWith`) is needed to still
 * recognise it.
 *
 * A worker that crashes mid-call never replies (RxDB `storage-remote`,
 * 16.21.1), so that case surfaces through `health$` (`dead`), not an error.
 */
export function isStorageWorkerFailure(error: unknown): boolean {
  return error instanceof Error
    && (error.name === 'StorageWorkerStartError' || error.message.includes('StorageWorkerStartError'));
}

const READ_METHODS = ['query', 'count', 'findDocumentsById', 'getChangedDocumentsSince'] as const;

/**
 * Wraps a storage so its instances report health on `health$` (ADR-061,
 * following WCPOS). No storage call is ever settled on a clock: a timed-out
 * write may still commit, so a slow write is only flagged as `stalled`, and
 * its promise stays pending until the worker answers. Reads are watched: two
 * consecutive `readWatchdogMs` windows in which reads were pending and no
 * call settled mark the worker `dead` (sticky; the recovery is reload).
 * `createStorageInstance` has no deadline, because the worker and wasm can be
 * slow to download.
 *
 * Instance methods are replaced in place, the way RxDB's own validator wraps
 * `bulkWrite`, so a later wrapper that assigns over ours calls ours, not itself.
 * The `tallyEngine` marker is kept.
 */
export function withStorageWatchdog(
  storage: RxStorage<any, any>,
  options: StorageWatchdogOptions = {},
): RxStorage<any, any> & { health$: Observable<StorageHealth> } {
  const {
    writeStallMs = STORAGE_WRITE_STALL_MS,
    readWatchdogMs = STORAGE_READ_WATCHDOG_MS,
    now = Date.now,
    setTimer = (fn, ms) => { const timer = setTimeout(fn, ms); return () => clearTimeout(timer); },
  } = options;
  const health$ = new BehaviorSubject<StorageHealth>({ status: 'ok', stalledWrites: 0 });
  const stalledStarts: number[] = [];
  let dead = false;
  let pendingReads = 0;
  let silentWindows = 0;
  let settledThisWindow = false;
  let cancelReadTimer: (() => void) | undefined;

  const emit = () => health$.next({
    status: dead ? 'dead' : stalledStarts.length > 0 ? 'stalled' : 'ok',
    stalledWrites: stalledStarts.length,
    ...(stalledStarts.length > 0 ? { stalledSince: Math.min(...stalledStarts) } : {}),
  });
  const settled = () => { settledThisWindow = true; silentWindows = 0; };

  // Ticks only while a read is pending, and stops once dead (sticky). A window
  // is silent when nothing settled during it.
  const armReadTimer = () => {
    settledThisWindow = false;
    cancelReadTimer = setTimer(() => {
      cancelReadTimer = undefined;
      silentWindows = settledThisWindow ? 0 : silentWindows + 1;
      if (silentWindows >= 2) { dead = true; emit(); } else armReadTimer();
    }, readWatchdogMs);
  };

  const watchWrite = <T>(promise: Promise<T>): Promise<T> => {
    const start = now();
    let stalled = false;
    const cancel = setTimer(() => { stalled = true; stalledStarts.push(start); emit(); }, writeStallMs);
    const done = () => {
      cancel();
      settled();
      if (stalled) { stalledStarts.splice(stalledStarts.indexOf(start), 1); emit(); }
    };
    promise.then(done, done);
    return promise;
  };

  const watchRead = <T>(promise: Promise<T>): Promise<T> => {
    if (pendingReads++ === 0 && !dead) armReadTimer();
    const done = () => {
      settled();
      if (--pendingReads === 0) { cancelReadTimer?.(); cancelReadTimer = undefined; }
    };
    promise.then(done, done);
    return promise;
  };

  return Object.assign(Object.create(storage), {
    health$: health$.asObservable(),
    async createStorageInstance(params: any) {
      const instance: any = await storage.createStorageInstance(params);
      const originalBulkWrite = instance.bulkWrite.bind(instance);
      instance.bulkWrite = (...args: any[]) => watchWrite(originalBulkWrite(...args));
      for (const method of READ_METHODS) {
        if (typeof instance[method] !== 'function') continue;
        const original = instance[method].bind(instance);
        instance[method] = (...args: any[]) => watchRead(original(...args));
      }
      return instance;
    },
  });
}
