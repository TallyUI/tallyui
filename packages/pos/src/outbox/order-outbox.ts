import { addRxPlugin, type RxCollection } from 'rxdb';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { getLocalDocStateByParent, RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { BehaviorSubject, concatMap, distinctUntilChanged, filter, map, type Observable, type Subscription } from 'rxjs';
import { toOrderCreateEnvelope, uuidv7, type PosOrder } from '../pos-order';
import type { CommandTransport, OutboxState } from './types';

// The outbox relies on isLeader() and waitForLeadership(), which RxDB treats as always-leader for a single instance.
addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);

// Pause after three 401s since the server last accepted credentials.
const AUTH_FAILURES_BEFORE_PROMPT = 3;

// Rejections that may hide an order the server already created: resending under a new
// command id could duplicate it, so requeue() leaves these for manual reconciliation.
const NOT_REQUEUEABLE = new Set(['idempotency_mismatch']);

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
  /** Moves rejected orders (all, or those whose id is listed) back to pending with a new commandId, then flushes.
   * Orders rejected with idempotency_mismatch are left for reconciliation. Resolves to the number requeued. */
  requeue(orderIds?: string[]): Promise<number>;
  /** Joins the leadership election and watches for pending orders and flush requests. */
  start(): void;
  /** Stops watching and retrying. A stopped leader with its database open retains leadership:
   * no tab sends until that database closes. A tab joins the election only through start(). */
  stop(): void;
  state$: Observable<OutboxState>;
}

export function createOrderOutbox(options: OrderOutboxOptions): OrderOutbox {
  const { collection, transport, deviceId } = options;
  const database = collection.database;
  if (database.multiInstance) {
    try { getLocalDocStateByParent(database); } catch {
      throw new Error('Multi-tab outboxes need localDocuments: true on the database.');
    }
  }
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
        unauthorizedSinceAccepted = 0;
        state$.next({ ...state$.value, refused: { status: outcome.status, reason: outcome.reason },
          authRequired: false, lastRetryReason: 'refused', sending: false, nextAttemptAt: undefined });
        return;
      }
      unauthorizedSinceAccepted = 0;
      state$.next({ ...state$.value, authRequired: false, refused: undefined });
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
    if (!database.isLeader()) {
      return database.upsertLocal('tally-outbox-flush', { id: uuidv7() }).then(() => {});
    }
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
    async requeue(orderIds) {
      const orders = (await collection.find({ selector: { syncStatus: 'rejected',
        ...(orderIds ? { id: { $in: orderIds } } : {}) } }).exec())
        .filter((order) => !NOT_REQUEUEABLE.has(order.error?.code ?? ''));
      for (const order of orders) {
        const oldCommandId = order.commandId;
        await order.incrementalModify((data) => {
          data.syncStatus = 'pending';
          delete data.error;
          // The server ledger stored the rejection under the old id; replaying it returns that rejection.
          // For the codes requeue() accepts, the server created no order, so a fresh id cannot duplicate one.
          data.commandId = uuidv7();
          data.updatedAt = new Date(now()).toISOString();
          return data;
        });
        attempts.delete(oldCommandId);
      }
      await updateState();
      if (orders.length && !stopped) flush().catch(() => {});
      return orders.length;
    },
    start() {
      stopped = false;
      const alreadyStarted = !!subscription;
      if (!subscription) subscription = collection.$.subscribe((event) => {
        if (!database.isLeader()) updateState().catch(() => {});
        if (event.documentData?.syncStatus === 'pending' &&
          (event.operation === 'INSERT' || event.operation === 'UPDATE')) {
          insertedDuringRun = true;
          flush().catch(() => {});
        }
      });
      if (database.multiInstance && !alreadyStarted) {
        subscription.add(state$.pipe(
          filter(() => database.isLeader()),
          map(({ authRequired, refused, sending, lastRetryReason, nextAttemptAt }) =>
            ({ authRequired, refused, sending, lastRetryReason, nextAttemptAt })),
          distinctUntilChanged((a, b) => a.authRequired === b.authRequired &&
            a.refused?.status === b.refused?.status && a.refused?.reason === b.refused?.reason &&
            a.sending === b.sending && a.lastRetryReason === b.lastRetryReason && a.nextAttemptAt === b.nextAttemptAt),
          concatMap(({ authRequired, refused, sending, lastRetryReason, nextAttemptAt }) =>
            database.upsertLocal('tally-outbox-state', { authRequired, refused, sending, lastRetryReason, nextAttemptAt })),
        ).subscribe());
        subscription.add(database.getLocal$('tally-outbox-state').subscribe((doc) => {
          if (!doc || database.isLeader()) return;
          state$.next({ ...state$.value, authRequired: doc.get('authRequired'), refused: doc.get('refused'),
            sending: doc.get('sending'), lastRetryReason: doc.get('lastRetryReason'), nextAttemptAt: doc.get('nextAttemptAt') });
        }));
        subscription.add(database.getLocal$('tally-outbox-flush').subscribe((doc) => {
          if (doc && database.isLeader() && !stopped) flush().catch(() => {});
        }));
      }
      const started = subscription;
      database.waitForLeadership().then(() => {
        if (!started.closed && !stopped) flush().catch(() => {});
      }).catch(() => {});
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
