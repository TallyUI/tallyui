import type { OrderCreateEnvelope } from '@tallyui/core';
import { deepEqual, type RxCollection, type RxDocumentData } from 'rxdb';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import { outboxLogger } from './logger';
import { toOrderCreateEnvelope, UnsupportedOrderVersionError, uuidv7, type PosOrder, type PosOrderServerFailures } from '../pos-order';
import { freezeSentForm } from '../pos-order/finalize';
import { countFresh, readFresh } from '../rxdb';
import { createBackendNotFound, type BackendNotFound } from './backend-not-found';
import type { CommandTransport, OutboxState } from './types';

// Pause after three 401s since the server last accepted credentials.
const AUTH_FAILURES_BEFORE_PROMPT = 3;

// Rejections that may hide an order the server already created: resending under a new
// command id could duplicate it, so requeue() leaves these for manual reconciliation.
const NOT_REQUEUEABLE = new Set(['idempotency_mismatch']);

// After this many consecutive failures the store answered (not offline) with the same head order and
// no progress, the queue is probed one order at a time, so an order the store can't take holds up only
// itself. With the default backoff the first probe goes after about 30 s: sales keep flowing within minutes.
export const ISOLATE_AFTER_ATTEMPTS = 5;

// An order the store has kept failing (server-answered) for this much answered time, offline gaps left out,
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
  /** Counts 404s toward OutboxState.backendMissing; pass the register outbox's too, so either one's 404s show one notice. */
  backendNotFound?: BackendNotFound;
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
  const backendNotFound = options.backendNotFound ?? createBackendNotFound();
  backendNotFound.backendMissing$.subscribe((backendMissing) => {
    if (backendMissing !== state$.value.backendMissing) state$.next({ ...state$.value, backendMissing });
  });
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
  // Each order's stuck clock and isolation are mirrored onto its stored `serverFailures` and restored when an outbox
  // starts. In memory only, so a restart starts them again: `head`, its failure count, and an unfinished walk (whose
  // failed probes are stored as isolated). `head` counts server-answered failures of batches
  // led by one order. At `isolateAfter` a walk starts: one probe (an order sent alone) per backoff interval,
  // through the whole pending queue, oldest first, each order once. When the store takes a probe it is up:
  // the orders whose probes failed are isolated and batching resumes. When no order is left to probe, the
  // store is down: nothing is isolated, and batching resumes with its backoff.
  let head: { id: string; count: number } | undefined;
  let walk: { failed: Map<string, string> } | undefined;
  // Isolated orders are left out of batches and retried alone, each on its own backoff, while pending
  // under their commandId.
  const isolated = new Map<string, { backoff: number; nextAt: number; reason: string }>();
  // Each order's stuck clock counts only answered time. It starts at the order's first server-answered failure (in
  // a batch, as a probe or alone; `timeout` counts, like a 503); an offline (`network`) failure pauses every running
  // clock (`pausedAt`), and the next response the store answers, of any kind and for any order, resumes them all,
  // moving `since` on by the offline gap: a pause is about the connection. So `since` is when the clock would have
  // started had there been no offline gaps: now minus its answered time (while paused, as of the pause). Progress,
  // or the order leaving pending, clears it.
  const clocks = new Map<string, { since: number; pausedAt?: number; seq: number; reason: string }>();
  let failureSeq = 0; // numbers failures, so `stuck` can name the latest reason
  // Timer runs alternate between the batch turn (the batch, or the walk's probe) and the isolated turn (one due
  // isolated order); a turn with nothing to send gives way to the other, so neither side can starve the other.
  let turn: 'batch' | 'isolated' = 'batch';
  let isolatedWait = false;
  let runProgressed = false;
  let timerFiredDuringRun = false;
  let restored = false;

  function stuckState(): OutboxState['stuck'] {
    const stuck = [...clocks].filter(([, clock]) => (clock.pausedAt ?? now()) - clock.since >= stuckAfter);
    if (!stuck.length) return undefined;
    return { commandIds: stuck.map(([id]) => id), since: Math.min(...stuck.map(([, clock]) => clock.since)),
      reason: stuck.reduce((latest, entry) => (entry[1].seq > latest[1].seq ? entry : latest))[1].reason,
      orders: stuck.map(([commandId, { since, reason }]) => ({ commandId, since, reason })) };
  }

  // An isolated order is due once its backoff has passed, or when the clock was set back further than any backoff.
  function isDue(id: string) {
    const entry = isolated.get(id);
    return !!entry && (entry.nextAt <= now() || entry.nextAt - now() > maxBackoff);
  }

  // An order's stored serverFailures: its clock, and whether it failed alone (isolated, or a failed probe).
  function failuresOf(commandId: string): PosOrderServerFailures | undefined {
    const clock = clocks.get(commandId);
    return clock && { since: clock.since, reason: clock.reason.slice(0, 64),
      isolated: isolated.has(commandId) || !!walk?.failed.has(commandId) };
  }

  // Writes each clocked pending order's serverFailures when the stored value would change. The writes that clear a
  // clock (applied, rejected, downgraded, requeued) remove the field, so every stored field has a clock here.
  async function mirror() {
    if (!clocks.size) return;
    for (const order of await readFresh(collection, { selector: { syncStatus: 'pending', commandId: { $in: [...clocks.keys()] } } })) {
      const value = failuresOf(order.commandId);
      if (!value || deepEqual(value, order.serverFailures)) continue;
      await (await collection.findOne(order.id).exec())?.incrementalModify((data) => {
        if (data.syncStatus === 'pending' && data.commandId === order.commandId) data.serverFailures = value;
        return data;
      });
    }
  }

  // Before the first send: each pending order's stored clock, paused until the store next answers (so the time the
  // till was off counts as answered: never a later flag than before), and its isolation, due at once.
  async function restore() {
    for (const { commandId, serverFailures } of await readFresh(collection, { selector: { syncStatus: 'pending',
      serverFailures: { $exists: true } }, sort: [{ createdAt: 'asc' }] })) if (serverFailures) {
      const { since, reason } = serverFailures;
      clocks.set(commandId, { since, pausedAt: now(), seq: ++failureSeq, reason });
      if (serverFailures.isolated) isolated.set(commandId, { backoff: initialBackoff, nextAt: now(), reason });
    }
    restored = true;
  }

  // An update that changed only serverFailures is the outbox's own mirror write: nothing new to send.
  const bare = ({ serverFailures, _rev, _meta, ...data }: RxDocumentData<PosOrder>) => data;
  const failuresOnly = (before: RxDocumentData<PosOrder>, after: RxDocumentData<PosOrder>) =>
    !deepEqual(before.serverFailures, after.serverFailures) && deepEqual(bare(before), bare(after));

  // Every read bypasses the query cache. RxDB 17 fixed RxDB 16.21.1's bug 4 (rxdb#7067);
  // readFresh, countFresh and watchFresh remain correct public API.
  // Retiring them is a separate decision.
  async function updateState(patch: Partial<OutboxState> = {}) {
    const pending = await countFresh(collection, { syncStatus: 'pending' });
    state$.next({ ...state$.value, ...patch, pending, stuck: stuckState() });
  }

  function isolate(id: string, reason: string, retryAfterMs = 0) {
    const entry = isolated.get(id) ?? { backoff: initialBackoff };
    const delay = Math.min(Math.max(retryAfterMs, entry.backoff * (0.9 + 0.2 * random())), maxBackoff);
    isolated.set(id, { reason, backoff: Math.min(entry.backoff * 2, maxBackoff), nextAt: now() + delay });
  }

  // A failure the store answered (not offline). Returns undefined when the run goes on at once, or the
  // floor for the retry: the store's Retry-After, or an isolated order's own backoff.
  function serverFailed(orders: PosOrder[], alone: 'probe' | 'isolated' | undefined, reason: string, retryAfterMs?: number) {
    const at = now();
    for (const { commandId } of orders) clocks.set(commandId, { since: clocks.get(commandId)?.since ?? at, seq: ++failureSeq, reason });
    const id = orders[0].commandId;
    if (alone === 'isolated') {
      isolate(id, reason, retryAfterMs);
      // Once the store took something this run it is up, and the run goes on, unless it asked to wait
      // (Retry-After, 429). Otherwise it may be down: one request per backoff interval.
      if (runProgressed && retryAfterMs === undefined && reason !== 'status_429') return undefined;
      return Math.max(retryAfterMs ?? 0, isolated.get(id)!.nextAt - now());
    }
    if (alone === 'probe') walk?.failed.set(id, reason);
    else {
      head = { id, count: head?.id === id ? head.count + 1 : 1 };
      if (head.count >= isolateAfter) walk ??= { failed: new Map() };
    }
    return retryAfterMs ?? 0;
  }

  // `wait` arms the timer for an isolated order's own backoff, leaving the outbox's backoff alone.
  function scheduleRetry(reason: string, retryAfterMs = 0, wait?: number) {
    state$.next({ ...state$.value, lastRetryReason: reason });
    if (stopped) { stoppedDuringRun = true; return; }
    const delay = wait ?? Math.min(Math.max(retryAfterMs, backoff * (0.9 + 0.2 * random())), maxBackoff);
    if (wait === undefined) backoff = Math.min(backoff * 2, maxBackoff);
    isolatedWait = wait !== undefined;
    // A timer firing while a run is still finishing finds it busy: the run's end flushes again.
    timer = setTimeout(() => { timer = undefined; if (running) timerFiredDuringRun = true; flush().catch(() => {}); }, delay);
    state$.next({ ...state$.value, sending: false, nextAttemptAt: now() + delay });
  }

  async function run() {
    stoppedDuringRun = false;
    runProgressed = false;
    const sentAlone = new Set<string>();
    while (!stopped) try {
      if (!restored) await restore();
      await updateState({ sending: true, nextAttemptAt: undefined });
      insertedDuringRun = false;
      // An order no longer pending under its commandId leaves the isolated set and loses its stuck clock.
      const tracked = [...new Set([...isolated.keys(), ...clocks.keys()])];
      const held = tracked.length ? await readFresh(collection, { selector: { syncStatus: 'pending', commandId: { $in: tracked } },
        sort: [{ createdAt: 'asc' }] }) : [];
      for (const id of tracked) if (!held.some((order) => order.commandId === id)) { isolated.delete(id); clocks.delete(id); }
      // During a walk, the oldest pending order neither probed nor isolated, alone. A sale rung up during
      // a walk triggers its next probe: still one request per sale. None left: the store is down.
      let probe: PosOrder | undefined;
      if (walk) {
        [probe] = await readFresh(collection, { selector: { syncStatus: 'pending',
          commandId: { $nin: [...isolated.keys(), ...walk.failed.keys()] } }, sort: [{ createdAt: 'asc' }], limit: 1 });
        if (!probe) { walk = undefined; head = undefined; }
      }
      // The isolated turn: an isolated order whose backoff is due, alone (once per run), the one due longest, so
      // isolated orders take turns too. The batch turn: the probe, else a batch without the isolated orders.
      // Whichever turn is next goes, unless it has nothing.
      const [due] = held.filter((order) => isDue(order.commandId) && !sentAlone.has(order.commandId))
        .sort((a, b) => isolated.get(a.commandId)!.nextAt - isolated.get(b.commandId)!.nextAt);
      let orders = turn === 'isolated' && due ? [due] : probe ? [probe] : await readFresh(collection, {
        selector: { syncStatus: 'pending', ...(isolated.size ? { commandId: { $nin: [...isolated.keys()] } } : {}) },
        sort: [{ createdAt: 'asc' }], limit: batchSize,
      });
      if (!orders.length && due) orders = [due];
      if (!orders.length || stopped) {
        if (stopped || !isolated.size) { stoppedDuringRun = stopped; return; }
        if (insertedDuringRun) continue;
        const next = [...isolated.values()].sort((a, b) => a.nextAt - b.nextAt)[0];
        return scheduleRetry(next.reason, 0, Math.min(maxBackoff, Math.max(initialBackoff, next.nextAt - now())));
      }
      const alone = due && orders[0] === due ? 'isolated' : probe ? 'probe' : undefined;
      if (alone === 'isolated') sentAlone.add(orders[0].commandId);
      turn = alone === 'isolated' ? 'batch' : 'isolated';
      // Bounds apply when frozen: persist older tills' sent forms before sending (Front desk, 2026-09-29).
      const batch = await Promise.all(orders.map(async (order) => {
        const frozen = freezeSentForm(order);
        if (frozen !== order) await (await collection.findOne(order.id).exec())?.incrementalModify((data) => freezeSentForm(data));
        const attempt = (attempts.get(order.commandId) ?? 0) + 1;
        attempts.set(order.commandId, attempt);
        return toOrderCreateEnvelope(frozen, deviceId, attempt);
      }));
      let outcome = await transport.send(batch);
      // A 404 answers the whole batch (the route is missing); any other answer resets the count. Offline changes nothing.
      backendNotFound.record(outcome, now());
      if (outcome.kind !== 'retry' || outcome.reason !== 'network') {
        // The store answered: every paused clock resumes, leaving out the offline gap. A device clock set back
        // during it makes the gap negative, which keeps the answered time exact, since `now` moved back too.
        const at = now();
        for (const clock of clocks.values()) if (clock.pausedAt !== undefined) {
          clock.since += at - clock.pausedAt;
          clock.pausedAt = undefined;
        }
      }
      let batchMax: number | undefined;
      let capabilitiesRefreshed = false;
      if (outcome.kind === 'retry') {
        let floor = outcome.retryAfterMs;
        if (outcome.reason === 'network') {
          // Offline never counts: it pauses every stuck clock and ends a walk, isolating nothing. The
          // failure count stands, so the next failure the store answers walks again. A `timeout` (sent, but
          // no answer in time) is not offline: it counts like a 503 and never pauses a clock.
          for (const clock of clocks.values()) clock.pausedAt ??= now();
          walk = undefined;
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
                if (changed) { data.sentVersion = to; data.downgradedFrom ??= from; delete data.serverFailures; }
                return data;
              });
              if (changed) {
                outboxLogger.warn('Sent an order at a lower order.create version', { orderId: order.id, from, to });
                progressed = downgraded = true;
                clocks.delete(order.commandId);
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
        // Progress removes the stored serverFailures in the write that marks the order applied or rejected.
        await current.incrementalModify((data) => {
          delete data.serverFailures;
          return Object.assign(data, result.status === 'rejected'
            ? { syncStatus: 'rejected' as const, error, updatedAt }
            : { syncStatus: 'applied' as const, serverRefs: result.serverRefs,
              ...(result.warnings ? { warnings: result.warnings } : {}), updatedAt });
        });
        attempts.delete(order.commandId);
        isolated.delete(order.commandId);
        clocks.delete(order.commandId);
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
      if (walk && alone === 'probe') {
        // The store took a probe, so it is up: the orders whose probes failed are isolated, and batching resumes.
        for (const [id, reason] of walk.failed) isolate(id, reason);
        walk = undefined;
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
      try { await mirror(); } catch (cause) { outboxLogger.warn('Failed to store server failures', { cause }); }
      try { await updateState({ sending: false }); } catch {}
      running = undefined;
      const missed = timerFiredDuringRun;
      timerFiredDuringRun = false;
      // A timer that fired during the run is not lost; a sale inserted while only isolated orders wait goes now.
      if (!stopped && (missed || (insertedDuringRun || stoppedDuringRun) && (timer === undefined || insertedDuringRun && isolatedWait))) {
        flush().catch(() => {});
      }
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
          delete data.serverFailures;
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
        // An UPDATE without previousDocumentData counts as a change: a needless send costs a request, a skipped one a sale.
        if (event.documentData?.syncStatus === 'pending' && (event.operation === 'INSERT' || event.operation === 'UPDATE' &&
          !(event.previousDocumentData !== undefined && failuresOnly(event.previousDocumentData, event.documentData)))) {
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
