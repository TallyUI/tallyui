import type { OrderCreateEnvelope } from '@tallyui/core';
import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import { outboxLogger } from './logger';
import { toOrderCreateEnvelope, UnsupportedOrderVersionError, uuidv7, type PosOrder } from '../pos-order';
import { countFresh, readFresh } from '../rxdb';
import type { CommandTransport, OutboxState } from './types';

// Pause after three 401s since the server last accepted credentials.
const AUTH_FAILURES_BEFORE_PROMPT = 3;

// Rejections that may hide an order the server already created: resending under a new
// command id could duplicate it, so requeue() leaves these for manual reconciliation.
const NOT_REQUEUEABLE = new Set(['idempotency_mismatch']);

// After this many consecutive failures the store answered (not offline) with the same head order and
// no progress, that batch is probed one order at a time, so an order the store can't take holds up only
// itself. With the default backoff the first probe goes after about 30 s: sales keep flowing within minutes.
export const ISOLATE_AFTER_ATTEMPTS = 5;

// The head batch, or an isolated order, still failing server-answered this long after its failures began
// is flagged in OutboxState.stuck. It stays pending and keeps retrying.
export const STUCK_AFTER_MS = 15 * 60_000;

export interface OrderOutboxOptions {
  collection: RxCollection<PosOrder>;
  transport: CommandTransport<OrderCreateEnvelope>;
  deviceId: string;
  getMaxOrderCreateVersion?: () => number | undefined | Promise<number | undefined>;
  refreshCapabilities?: () => Promise<void>;
  batchSize?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  random?: () => number;
  now?: () => number;
  /** Tests only: overrides ISOLATE_AFTER_ATTEMPTS. */
  isolateAfterAttempts?: number;
  /** Tests only: overrides STUCK_AFTER_MS. */
  stuckAfterMs?: number;
}

export interface OrderOutbox {
  /** Sends pending orders until empty or retrying. Concurrent calls share one run. */
  flush(): Promise<void>;
  /** Moves rejected orders (all, or those whose id is listed) back to pending with a new commandId, then flushes.
   * Orders rejected with idempotency_mismatch are left for reconciliation. Resolves to the number requeued. */
  requeue(orderIds?: string[]): Promise<number>;
  /** Watches for pending orders and sends them. */
  start(): void;
  /** Stops watching and retrying. */
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
  const isolateAfter = options.isolateAfterAttempts ?? ISOLATE_AFTER_ATTEMPTS;
  const stuckAfter = options.stuckAfterMs ?? STUCK_AFTER_MS;
  // In memory only: a restart starts the counts again. `head` is the batch at the front of the queue
  // while the store keeps failing it: its orders, the failure count (by head order), when the failures
  // began and the latest reason (both unset after an offline attempt, which never flags an order).
  let head: { ids: string[]; count: number; since?: number; seq: number; reason?: string } | undefined;
  // After `isolateAfter` failures the head batch is walked: its orders are sent alone, in order. Until one
  // makes progress the store may be down, so one probe per backoff interval; then the rest go at once.
  let walk: { ids: string[]; failed: Map<string, string>; since: number; proven: boolean } | undefined;
  // An isolated order is retried alone on its own backoff while it stays pending under its commandId.
  const isolated = new Map<string, { since: number; seq: number; reason?: string; backoff: number; nextAt: number }>();
  let isolatedWait = false;
  let failureSeq = 0; // numbers failures, so `stuck` can name the latest reason
  let runProgressed = false;

  function stuckState(): OutboxState['stuck'] {
    const failing = [...isolated].filter(([, entry]) => entry.reason)
      .map(([id, { since, seq, reason }]) => ({ ids: [id], since, seq, reason }));
    if (head?.reason && head.since !== undefined) failing.push({ ids: head.ids, since: head.since, seq: head.seq, reason: head.reason });
    const stuck = failing.filter((entry) => now() - entry.since >= stuckAfter);
    if (!stuck.length) return undefined;
    return { commandIds: [...new Set(stuck.flatMap((entry) => entry.ids))], since: Math.min(...stuck.map((entry) => entry.since)),
      reason: stuck.reduce((latest, entry) => (entry.seq > latest.seq ? entry : latest)).reason! };
  }

  // An isolated order is due once its backoff has passed, or when the clock was set back further than any backoff.
  function isDue(id: string) {
    const entry = isolated.get(id);
    return !!entry && (entry.nextAt <= now() || entry.nextAt - now() > maxBackoff);
  }

  // Every read goes past RxDB's query cache: in RxDB 16.21.1 a sale inserted while a cached
  // query's read is in flight never reaches that query, and stayed unsent until a restart.
  async function updateState(patch: Partial<OutboxState> = {}) {
    const pending = await countFresh(collection, { syncStatus: 'pending' });
    state$.next({ ...state$.value, ...patch, pending, stuck: stuckState() });
  }

  function isolate(id: string, reason: string, since: number, retryAfterMs = 0) {
    const prior = isolated.get(id);
    const entry = prior ?? { since, seq: 0, backoff: initialBackoff, nextAt: 0 };
    const delay = Math.min(Math.max(retryAfterMs, entry.backoff * (0.9 + 0.2 * random())), maxBackoff);
    isolated.set(id, { ...entry, since: prior && !prior.reason ? now() : entry.since, seq: ++failureSeq, reason,
      backoff: Math.min(entry.backoff * 2, maxBackoff), nextAt: now() + delay });
  }

  // A failure the store answered (not offline). Returns undefined when the run goes on at once, or the
  // floor for the retry: an isolated order's own backoff, or the store's Retry-After.
  function serverFailed(orders: PosOrder[], alone: 'walk' | 'isolated' | undefined, reason: string, retryAfterMs = 0) {
    const id = orders[0].commandId;
    if (alone === 'isolated') {
      isolate(id, reason, now(), retryAfterMs);
      // Unless the store took something this run, it may be down: one request per backoff interval,
      // except that a sale inserted during the run is still sent now, as without isolation.
      return runProgressed || insertedDuringRun ? undefined : isolated.get(id)!.nextAt - now();
    }
    if (walk?.proven) {
      walk.ids.shift();
      isolate(id, reason, walk.since, retryAfterMs);
      if (!walk.ids.length) walk = undefined;
      return undefined;
    }
    const same = !!walk || head?.ids[0] === id;
    head = { ids: walk && head ? head.ids : orders.map((order) => order.commandId), count: (same ? head?.count ?? 0 : 0) + (walk ? 0 : 1),
      since: (same ? head?.since : undefined) ?? now(), seq: ++failureSeq, reason };
    if (walk) {
      walk.failed.set(id, reason);
      walk.ids.shift();
      // No probe made progress: the store is down, not one order. Isolate nothing; batch again, and walk
      // again only after another `isolateAfter` failures.
      if (!walk.ids.length) { walk = undefined; head.count = 0; }
    } else if (head.count >= isolateAfter) walk = { ids: [...head.ids], failed: new Map(), since: head.since!, proven: false };
    return retryAfterMs;
  }

  // `wait` arms the timer for an isolated order's own backoff, leaving the outbox's backoff alone.
  function scheduleRetry(reason: string, retryAfterMs = 0, wait?: number) {
    state$.next({ ...state$.value, lastRetryReason: reason });
    if (stopped) { stoppedDuringRun = true; return; }
    const delay = wait ?? Math.min(Math.max(retryAfterMs, backoff * (0.9 + 0.2 * random())), maxBackoff);
    if (wait === undefined) backoff = Math.min(backoff * 2, maxBackoff);
    isolatedWait = wait !== undefined;
    timer = setTimeout(() => { timer = undefined; flush().catch(() => {}); }, delay);
    state$.next({ ...state$.value, sending: false, nextAttemptAt: now() + delay });
  }

  async function run() {
    stoppedDuringRun = false;
    runProgressed = false;
    const sentAlone = new Set<string>();
    while (!stopped) try {
      await updateState({ sending: true, nextAttemptAt: undefined });
      insertedDuringRun = false;
      // An order no longer pending under its commandId leaves the walk and the isolated set.
      const held = walk || isolated.size ? await readFresh(collection, { selector: { syncStatus: 'pending',
        commandId: { $in: [...walk?.ids ?? [], ...isolated.keys()] } } }) : [];
      for (const id of isolated.keys()) if (!held.some((order) => order.commandId === id)) isolated.delete(id);
      if (walk) walk.ids = walk.ids.filter((id) => held.some((order) => order.commandId === id));
      if (walk && !walk.ids.length) walk = undefined;
      // A walk's next order alone; else a batch without the isolated orders; else a due isolated order alone (once per run).
      const probe = walk && held.find((order) => order.commandId === walk!.ids[0]);
      let orders = probe ? [probe] : await readFresh(collection, {
        selector: { syncStatus: 'pending', ...(isolated.size ? { commandId: { $nin: [...isolated.keys()] } } : {}) },
        sort: [{ createdAt: 'asc' }], limit: batchSize,
      });
      const retrying = !probe && !orders.length ? held.find((order) => isDue(order.commandId) && !sentAlone.has(order.commandId)) : undefined;
      if (retrying) { orders = [retrying]; sentAlone.add(retrying.commandId); }
      const alone = probe ? 'walk' : retrying ? 'isolated' : undefined;
      if (!orders.length || stopped) {
        if (stopped || !isolated.size) { stoppedDuringRun = stopped; return; }
        if (insertedDuringRun) continue;
        const next = [...isolated.values()].sort((a, b) => a.nextAt - b.nextAt)[0];
        return scheduleRetry(next.reason ?? 'network', 0, Math.min(maxBackoff, Math.max(0, next.nextAt - now())));
      }
      const batch = orders.map((order) => {
        const attempt = (attempts.get(order.commandId) ?? 0) + 1;
        attempts.set(order.commandId, attempt);
        return toOrderCreateEnvelope(order, deviceId, attempt);
      });
      let outcome = await transport.send(batch);
      let batchMax: number | undefined;
      let capabilitiesRefreshed = false;
      if (outcome.kind === 'retry') {
        let floor = outcome.retryAfterMs;
        if (outcome.reason === 'network') {
          // Offline neither counts nor resets the count, but it ends a walk, and the stuck clock
          // starts again at the next failure the store answers.
          if (head) head = { ...head, since: undefined, reason: undefined };
          walk = undefined;
          const entry = alone === 'isolated' && isolated.get(orders[0].commandId);
          if (entry) entry.reason = undefined;
        } else if ((floor = serverFailed(orders, alone, outcome.reason, outcome.retryAfterMs)) === undefined) continue;
        return scheduleRetry(outcome.reason, floor);
      }
      if (outcome.kind === 'unauthorized') {
        unauthorizedSinceAccepted++;
        if (unauthorizedSinceAccepted < AUTH_FAILURES_BEFORE_PROMPT) return scheduleRetry('unauthorized');
        state$.next({ ...state$.value, authRequired: true, lastRetryReason: 'unauthorized',
          sending: false, nextAttemptAt: undefined });
        return;
      }
      if (outcome.kind === 'refused' && outcome.status === 400 && options.getMaxOrderCreateVersion) {
        const match = /^Invalid commands\[(\d+)\]\.version$/.exec(outcome.reason);
        if (match) {
          try { await options.refreshCapabilities?.(); } catch (cause) { outboxLogger.warn('Failed to refresh capabilities', { cause }); }
          const advertised = await options.getMaxOrderCreateVersion();
          const max = typeof advertised === 'number' && Number.isSafeInteger(advertised) && advertised > 0 ? advertised : undefined;
          if (max !== undefined && max < batch[Number(match[1])]?.version) {
            batchMax = max;
            capabilitiesRefreshed = true;
            const message = outcome.reason;
            // Validation refused the whole batch before processing: only orders above the cap need changes.
            outcome = { kind: 'results', results: batch.filter((command) => command.version > max).map((command) => ({
              id: command.id, status: 'rejected', error: { code: 'unsupported_version', message, data: { orderCreate: max } },
            })) };
          }
        }
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
      let downgraded = false;
      for (const order of orders) {
        const result = outcome.results.find((entry) => entry.id === order.commandId);
        if (!result) continue;
        // A primary-key lookup straight on the storage instance: skips the query cache (like
        // readFresh, but without its full index scan here) and excludes a deleted document as not
        // found. The commandId check catches an order requeued while this one was in flight.
        const [stored] = await collection.storageInstance.findDocumentsById([order.id], false);
        if (stored?.syncStatus !== 'pending' || stored.commandId !== order.commandId) continue;
        const current = await collection.findOne(order.id).exec();
        if (!current) continue;
        let error = result.error;
        if (result.status === 'rejected' && error?.code === 'unsupported_version' && options.getMaxOrderCreateVersion) {
          if (!capabilitiesRefreshed) {
            try { await options.refreshCapabilities?.(); } catch (cause) { outboxLogger.warn('Failed to refresh capabilities', { cause }); }
            const advertised = error.data?.orderCreate;
            const max = typeof advertised === 'number' && Number.isSafeInteger(advertised) && advertised > 0
              ? advertised : await options.getMaxOrderCreateVersion();
            batchMax = typeof max === 'number' && Number.isSafeInteger(max) && max > 0 ? max : undefined;
            capabilitiesRefreshed = true;
          }
          const max = batchMax;
          const from = batch.find((command) => command.id === order.commandId)!.version;
          if (max !== undefined && max < (stored.sentVersion ?? from)) {
            try {
              const to = toOrderCreateEnvelope(stored, deviceId, 1, { maxVersion: max }).version;
              let changed = false;
              await current.incrementalModify((data) => {
                changed = data.syncStatus === 'pending' && data.commandId === order.commandId && max < (data.sentVersion ?? from);
                if (changed) { data.sentVersion = to; data.downgradedFrom ??= from; }
                return data;
              });
              if (changed) {
                outboxLogger.warn('Sent an order at a lower order.create version', { orderId: order.id, from, to });
                progressed = downgraded = true;
              }
              continue;
            } catch (cause) {
              if (!(cause instanceof UnsupportedOrderVersionError)) throw cause;
              error = { code: 'unsupported_version', message: cause.message };
            }
          }
        }
        if (result.status === 'rejected' && error?.code === 'unsupported_version') outboxLogger.error(error.message, { orderId: order.id });
        const updatedAt = new Date(now()).toISOString();
        await current.incrementalPatch(result.status === 'rejected'
          ? { syncStatus: 'rejected', error, updatedAt }
          : { syncStatus: 'applied', serverRefs: result.serverRefs,
            ...(result.warnings ? { warnings: result.warnings } : {}), updatedAt });
        attempts.delete(order.commandId);
        isolated.delete(order.commandId);
        progressed = true;
        await updateState();
      }
      if (!progressed) {
        const floor = serverFailed(orders, alone, 'no_progress');
        if (floor === undefined) continue;
        return scheduleRetry('no_progress', floor);
      }
      runProgressed = true;
      if (alone !== 'isolated') head = undefined;
      if (walk && alone === 'walk') {
        // The store took a probe, so it is up: earlier failed probes are isolated and the rest go at once.
        walk.ids.shift();
        if (!walk.proven) for (const [id, reason] of walk.failed) isolate(id, reason, walk.since);
        walk.proven = true;
        if (!walk.ids.length) walk = undefined;
      }
      backoff = initialBackoff;
      state$.next({ ...state$.value, lastRetryReason: downgraded ? 'downgraded' : undefined });
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
      // A sale inserted while only isolated orders wait goes now, not on their backoff.
      if ((insertedDuringRun || stoppedDuringRun) && !stopped && (timer === undefined || insertedDuringRun && isolatedWait)) flush().catch(() => {});
    });
    return running;
  }

  updateState().catch(() => {});
  return {
    state$,
    flush,
    async requeue(orderIds) {
      const orders = (await readFresh(collection, { selector: { syncStatus: 'rejected',
        ...(orderIds ? { id: { $in: orderIds } } : {}) } }))
        .filter((order) => !NOT_REQUEUEABLE.has(order.error?.code ?? ''));
      let count = 0;
      for (const order of orders) {
        const oldCommandId = order.commandId;
        let changed = false;
        // The modifier sees the stored state, even when findOne's cached result is stale.
        await (await collection.findOne(order.id).exec())?.incrementalModify((data) => {
          changed = data.syncStatus === 'rejected' && !NOT_REQUEUEABLE.has(data.error?.code ?? '');
          if (!changed) return data;
          data.syncStatus = 'pending';
          delete data.error;
          // The server ledger stored the rejection under the old id; replaying it returns that rejection.
          // For the codes requeue() accepts, the server created no order, so a fresh id cannot duplicate one.
          data.commandId = uuidv7();
          data.updatedAt = new Date(now()).toISOString();
          return data;
        });
        if (changed) { count++; attempts.delete(oldCommandId); }
      }
      await updateState();
      if (count && !stopped) flush().catch(() => {});
      return count;
    },
    start() {
      stopped = false;
      if (!subscription) subscription = collection.$.subscribe((event) => {
        if (event.documentData?.syncStatus === 'pending' &&
          (event.operation === 'INSERT' || event.operation === 'UPDATE')) {
          insertedDuringRun = true;
          flush().catch(() => {});
        }
      });
      if (!stopped) flush().catch(() => {});
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
