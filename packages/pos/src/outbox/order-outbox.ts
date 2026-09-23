import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import { toOrderCreateEnvelope, type PosOrder } from '../pos-order';
import type { CommandTransport, OutboxState } from './types';

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
  const batchSize = Math.min(options.batchSize ?? 10, 50);
  const initialBackoff = options.initialBackoffMs ?? 1000;
  const maxBackoff = options.maxBackoffMs ?? 60000;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const state$ = new BehaviorSubject<OutboxState>({ pending: 0, sending: false });
  const attempts = new Map<string, number>();
  let backoff = initialBackoff;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let subscription: Subscription | undefined;
  let stopped = false;
  let insertedDuringRun = false;

  async function updateState(patch: Partial<OutboxState> = {}) {
    const pending = await collection.count({ selector: { syncStatus: 'pending' } }).exec();
    state$.next({ ...state$.value, ...patch, pending });
  }

  async function run() {
    await updateState({ sending: true, nextAttemptAt: undefined });
    while (!stopped) {
      insertedDuringRun = false;
      const orders = await collection.find({
        selector: { syncStatus: 'pending' }, sort: [{ createdAt: 'asc' }], limit: batchSize,
      }).exec();
      if (!orders.length || stopped) return;
      const batch = orders.map((order) => {
        const attempt = (attempts.get(order.commandId) ?? 0) + 1;
        attempts.set(order.commandId, attempt);
        return toOrderCreateEnvelope(order.toMutableJSON(), deviceId, attempt);
      });
      const outcome = await transport.send(batch);
      if (outcome.kind === 'retry') {
        await updateState({ lastRetryReason: outcome.reason });
        if (stopped) return;
        const delay = Math.max(outcome.retryAfterMs ?? 0, backoff * (0.9 + 0.2 * random()));
        backoff = Math.min(backoff * 2, maxBackoff);
        timer = setTimeout(() => { timer = undefined; void flush(); }, delay);
        state$.next({ ...state$.value, sending: false, nextAttemptAt: now() + delay });
        return;
      }
      backoff = initialBackoff;
      state$.next({ ...state$.value, lastRetryReason: undefined });
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
        await updateState();
      }
    }
  }

  function flush(): Promise<void> {
    if (running) return running;
    stopped = false;
    clearTimeout(timer);
    timer = undefined;
    running = Promise.resolve().then(run).finally(async () => {
      await updateState({ sending: false });
      running = undefined;
      if (insertedDuringRun && !stopped && timer === undefined) void flush();
    });
    return running;
  }

  void updateState();
  return {
    state$,
    flush,
    start() {
      if (subscription) return;
      subscription = collection.insert$.subscribe((event) => {
        if (event.documentData.syncStatus === 'pending') {
          insertedDuringRun = true;
          void flush();
        }
      });
      void flush();
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
