import { BehaviorSubject, type Observable } from 'rxjs';

import type { ConnectivityTracker } from './connectivity';
import type { SyncCadence } from './sync-cadence';

/** What a tick asks to check again. RxDB's replication state (and TallyReplicationState) fits as is. */
export interface SyncCadenceTarget { reSync(): void; isPaused?(): boolean }

export interface StartSyncCadenceOptions {
  targets: readonly SyncCadenceTarget[];
  /** Usually syncCadence$(collection). No timer runs until its first value. */
  cadence$: Observable<SyncCadence>;
  connectivity?: ConnectivityTracker;
  /** Injectable for tests; default Math.random. */
  random?: () => number;
  /** Injectable for tests; default Date.now. Only used for nextDueAtMs$. */
  now?: () => number;
}

export interface SyncCadenceRunner {
  /** When the next tick is due (the `now()` clock), or undefined before the first cadence value and after stop. */
  readonly nextDueAtMs$: Observable<number | undefined>;
  /** Tick now ("Check now"), then re-arm from now. A no-op after stop. */
  tickNow(): void;
  /** Clears the timer, unsubscribes from cadence$, and emits undefined then completes nextDueAtMs$. Idempotent. */
  stop(): void;
}

/** v2's ±20 % jitter (sync-engine change-signal/tick-cadence.ts). Exported for tests and for a "next check in" line. */
export function jitteredIntervalMs(intervalMs: number, random: () => number): number {
  return Math.round(intervalMs * (0.8 + 0.4 * random()));
}

/**
 * Opt-in polling beside startReplication: on each jittered tick, `reSync()` on every target that is not paused. A new
 * cadence value re-arms the timer from now, as v2's reconfigure does. A tick is skipped while connectivity's
 * update-required latch is set, never for offline or degraded: the replication's own backoff and holds decide those.
 */
export function startSyncCadence({
  targets, cadence$, connectivity, random = Math.random, now = Date.now,
}: StartSyncCadenceOptions): SyncCadenceRunner {
  const nextDueAtMs$ = new BehaviorSubject<number | undefined>(undefined);
  let current: SyncCadence | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const tick = () => {
    if (connectivity?.current().updateRequired) return;
    for (const target of targets) {
      // One throwing target never stops the others or the timer.
      try {
        if (target.isPaused?.() !== true) target.reSync();
      } catch { /* swallowed */ }
    }
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
    },
  };
}
