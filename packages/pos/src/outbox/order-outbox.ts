import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import { toOrderCreateEnvelope, type PosOrder } from '../pos-order';
import type { CommandTransport, OutboxState } from './types';

// Pause after three 401s since the server last accepted credentials.
const AUTH_FAILURES_BEFORE_PROMPT = 3;

export interface OrderOutboxOptions {
  collection: RxCollection<PosOrder>;
  transport: CommandTransport;
  deviceId: string;
  batchSize?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  random?: () => number;
  now?: () => number;
}

export interface OrderOutbox {
  /** Sends pending orders until empty or retrying. Concurrent calls share one run. */
  flush(): Promise<void>;
  start(): void;
  stop(): void;
  state$: Observable<OutboxState>;
}

export function createOrderOutbox(options: OrderOutboxOptions): OrderOutbox {
  const { collection, transport, deviceId } = options;
  const batchSize = Math.min(options.batchSize ?? 10, 10);
  const initialBackoff = options.initialBackoffMs ?? 1000;
  const maxBackoff = options.maxBackoffMs ?? 60000;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const state$ = new BehaviorSubject<OutboxState>({ pending: 0, sending: false });
  const attempts = new Map<string, number>();
  let backoff = initialBackoff;
  let unauthorizedSinceAccepted = 0;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let subscription: Subscription | undefined;
  let stopped = false;
  let insertedDuringRun = false;
  let stoppedDuringRun = false;

  async function updateState(patch: Partial<OutboxState> = {}) {
    const pending = await collection.count({ selector: { syncStatus: 'pending' } }).exec();
    state$.next({ ...state$.value, ...patch, pending });
  }

  function scheduleRetry(reason: string, retryAfterMs = 0) {
    state$.next({ ...state$.value, lastRetryReason: reason });
    if (stopped) { stoppedDuringRun = true; return; }
    const delay = Math.min(Math.max(retryAfterMs, backoff * (0.9 + 0.2 * random())), maxBackoff);
    backoff = Math.min(backoff * 2, maxBackoff);
    timer = setTimeout(() => { timer = undefined; flush().catch(() => {}); }, delay);
    state$.next({ ...state$.value, sending: false, nextAttemptAt: now() + delay });
  }

  async function run() {
    stoppedDuringRun = false;
    while (!stopped) try {
      await updateState({ sending: true, nextAttemptAt: undefined });
      insertedDuringRun = false;
      const orders = await collection.find({
        selector: { syncStatus: 'pending' }, sort: [{ createdAt: 'asc' }], limit: batchSize,
      }).exec();
      if (!orders.length || stopped) { stoppedDuringRun = stopped; return; }
      const batch = orders.map((order) => {
        const attempt = (attempts.get(order.commandId) ?? 0) + 1;
        attempts.set(order.commandId, attempt);
        return toOrderCreateEnvelope(order.toMutableJSON(), deviceId, attempt);
      });
      const outcome = await transport.send(batch);
      if (outcome.kind === 'retry') {
        return scheduleRetry(outcome.reason, outcome.retryAfterMs);
      }
      if (outcome.kind === 'unauthorized') {
        unauthorizedSinceAccepted++;
        if (unauthorizedSinceAccepted < AUTH_FAILURES_BEFORE_PROMPT) return scheduleRetry('unauthorized');
        state$.next({ ...state$.value, authRequired: true, lastRetryReason: 'unauthorized',
          sending: false, nextAttemptAt: undefined });
        return;
      }
      if (outcome.kind === 'refused') {
        for (const order of orders) {
          const current = await collection.findOne(order.id).exec();
          if (!current || current.syncStatus !== 'pending') continue;
          await current.incrementalPatch({ syncStatus: 'rejected',
            error: { code: `http_${outcome.status}`, message: outcome.reason }, updatedAt: new Date(now()).toISOString() });
          attempts.delete(order.commandId);
        }
        unauthorizedSinceAccepted = 0;
        backoff = initialBackoff;
        state$.next({ ...state$.value, lastRetryReason: undefined });
        await updateState();
        continue;
      }
      unauthorizedSinceAccepted = 0;
      state$.next({ ...state$.value, authRequired: false });
      let progressed = false;
      for (const order of orders) {
        const result = outcome.results.find((entry) => entry.id === order.commandId);
        if (!result) continue;
        const current = await collection.findOne(order.id).exec();
        if (!current || current.syncStatus !== 'pending') continue;
        const updatedAt = new Date(now()).toISOString();
        await current.incrementalPatch(result.status === 'rejected'
          ? { syncStatus: 'rejected', error: result.error, updatedAt }
          : { syncStatus: 'applied', serverRefs: result.serverRefs,
            ...(result.warnings ? { warnings: result.warnings } : {}), updatedAt });
        attempts.delete(order.commandId);
        progressed = true;
        await updateState();
      }
      if (!progressed) return scheduleRetry('no_progress');
      backoff = initialBackoff;
      state$.next({ ...state$.value, lastRetryReason: undefined });
    } catch (error) {
      scheduleRetry('error: ' + (error instanceof Error ? error.message : String(error)));
      return;
    }
    stoppedDuringRun = true;
  }

  function flush(): Promise<void> {
    if (running) return running;
    stopped = false;
    clearTimeout(timer);
    timer = undefined;
    running = Promise.resolve().then(run).finally(async () => {
      try { await updateState({ sending: false }); } catch {}
      running = undefined;
      if ((insertedDuringRun || stoppedDuringRun) && !stopped && timer === undefined) flush().catch(() => {});
    });
    return running;
  }

  updateState().catch(() => {});
  return {
    state$,
    flush,
    start() {
      stopped = false;
      if (subscription) return;
      subscription = collection.insert$.subscribe((event) => {
        if (event.documentData.syncStatus === 'pending') {
          insertedDuringRun = true;
          flush().catch(() => {});
        }
      });
      flush().catch(() => {});
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = undefined;
      subscription?.unsubscribe();
      subscription = undefined;
      state$.next({ ...state$.value, nextAttemptAt: undefined });
    },
  };
}
