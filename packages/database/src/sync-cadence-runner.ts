import { BehaviorSubject, type Observable } from 'rxjs';

import type { ConnectivityTracker } from './connectivity';
import type { SyncCadence } from './sync-cadence';

/** What a tick asks to check again. RxDB's replication state (and TallyReplicationState) fits as is. */
export interface SyncCadenceTarget {
  /** A returned promise that rejects counts the tick as an error. */
  reSync(): void | PromiseLike<unknown>;
  isPaused?(): boolean;
}

export interface StartSyncCadenceOptions {
  targets: readonly SyncCadenceTarget[];
  /** Usually syncCadence$(collection). No timer runs until its first value. */
  cadence$: Observable<SyncCadence>;
  connectivity?: ConnectivityTracker;
  /** Injectable for tests; default Math.random. */
  random?: () => number;
  /** Injectable for tests; default Date.now. Only used for nextDueAtMs$ and lastTick. */
  now?: () => number;
}

/** One finished tick: when it finished (the `now()` clock) and whether every target's reSync went through. v2's lane `lastTick`. */
export interface SyncCadenceTick { atMs: number; status: 'ok' | 'error' }

export interface SyncCadenceRunner {
  /** When the next tick is due (the `now()` clock), or undefined before the first cadence value and after stop. */
  readonly nextDueAtMs$: Observable<number | undefined>;
  /** Tick now ("Check now"), then re-arm from now. A no-op after stop. */
  tickNow(): void;
  /** Clears the timer, unsubscribes from cadence$, and emits undefined then completes nextDueAtMs$. Idempotent. */
  stop(): void;
}

export interface SyncCadenceTicker extends SyncCadenceRunner {
  /** The last finished tick on subscribe, then each new one; null before the first. Completes on stop. */
  readonly lastTick$: Observable<SyncCadenceTick | null>;
  /** The last finished tick, or null before the first. Still readable after stop. */
  lastTick(): SyncCadenceTick | null;
}

/** v2's ±20 % jitter (sync-engine change-signal/tick-cadence.ts). Exported for tests and for a "next check in" line. */
export function jitteredIntervalMs(intervalMs: number, random: () => number): number {
  return Math.round(intervalMs * (0.8 + 0.4 * random()));
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function';

/**
 * Opt-in polling beside startReplication: on each jittered tick, `reSync()` on every target that is not paused. A new
 * cadence value re-arms the timer from now, as v2's reconfigure does. A tick is skipped while connectivity's
 * update-required latch is set, never for offline or degraded: the replication's own backoff and holds decide those.
 * The last finished tick is on `lastTick$`/`lastTick()`; a target may return a promise from `reSync()`, and a rejection
 * counts as an error.
 */
export function startSyncCadence({
  targets, cadence$, connectivity, random = Math.random, now = Date.now,
}: StartSyncCadenceOptions): SyncCadenceTicker {
  const nextDueAtMs$ = new BehaviorSubject<number | undefined>(undefined);
  const lastTick$ = new BehaviorSubject<SyncCadenceTick | null>(null);
  let tickSeq = 0;
  let recordedSeq = 0;
  let current: SyncCadence | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const tick = () => {
    if (connectivity?.current().updateRequired) return;
    const seq = ++tickSeq;
    let failed = false;
    const pending: PromiseLike<unknown>[] = [];
    for (const target of targets) {
      // One throwing target never stops the others or the timer.
      try {
        if (target.isPaused?.() !== true) {
          const result: unknown = target.reSync();
          if (isThenable(result)) pending.push(result);
        }
      } catch { failed = true; }
    }
    // A tick that settles after stop, or after a newer tick recorded, records nothing.
    const record = (ok: boolean) => {
      if (stopped || seq <= recordedSeq) return;
      recordedSeq = seq;
      lastTick$.next({ atMs: now(), status: ok ? 'ok' : 'error' });
    };
    if (pending.length === 0) record(!failed);
    else void Promise.allSettled(pending).then((results) => record(!failed && results.every((r) => r.status === 'fulfilled')));
  };
  const arm = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (stopped || !current) return;
    const delay = jitteredIntervalMs(current.checkIntervalMs, random);
    timer = setTimeout(() => {
      timer = undefined;
      tick();
      arm();
    }, delay);
    nextDueAtMs$.next(now() + delay);
  };

  const subscription = cadence$.subscribe((cadence) => {
    if (stopped) return;
    if (current && current.checkIntervalMs === cadence.checkIntervalMs && current.pullBatchSize === cadence.pullBatchSize) return;
    current = cadence;
    arm();
  });

  return {
    nextDueAtMs$: nextDueAtMs$.asObservable(),
    lastTick$: lastTick$.asObservable(),
    lastTick: () => lastTick$.getValue(),
    tickNow: () => {
      if (stopped) return;
      tick();
      arm();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      subscription.unsubscribe();
      nextDueAtMs$.next(undefined);
      nextDueAtMs$.complete();
      lastTick$.complete();
    },
  };
}
