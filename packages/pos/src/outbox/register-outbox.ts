import type { CommandResult, RegisterCommandEnvelope } from '@tallyui/core';
import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import { registerCommandsLogger, type RegisterCommand } from '../register/register-commands';
import { countFresh, readFresh } from '../rxdb';
import { createBackendNotFound, type BackendNotFound } from './backend-not-found';
import { STUCK_AFTER_MS } from './order-outbox';
import type { CommandTransport, OutboxState } from './types';

export interface RegisterOutboxOptions {
  collection: RxCollection<RegisterCommand>;
  transport: CommandTransport<RegisterCommandEnvelope>;
  deviceId: string;
  /** Checked at the start of every run; false sends nothing. */
  isEnabled?: () => boolean;
  /** Runs before marking, so a crash resends; a throw is logged and marking continues. */
  onResult?: (command: RegisterCommand, result: CommandResult) => Promise<void> | void;
  batchSize?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  random?: () => number;
  now?: () => number;
  /** Tests only: overrides STUCK_AFTER_MS. */
  stuckAfterMs?: number;
  /** Counts 404s toward OutboxState.backendMissing; pass the order outbox's too, so either one's 404s show one notice. */
  backendNotFound?: BackendNotFound;
}
export interface RegisterOutbox {
  flush(): Promise<void>;
  start(): void;
  stop(): void;
  state$: Observable<OutboxState>;
}

function plainCommand({ key, registerId, seq, commandId, type, version, payload, createdAt, syncStatus,
  error, result, updatedAt }: RegisterCommand): RegisterCommand {
  return structuredClone({ key, registerId, seq, commandId, type, version, payload, createdAt, syncStatus,
    ...(error ? { error } : {}), ...(result ? { result } : {}), updatedAt });
}

export function createRegisterOutbox(options: RegisterOutboxOptions): RegisterOutbox {
  const { collection, transport, deviceId } = options;
  const size = options.batchSize;
  const batchSize = Math.max(1, Math.min(typeof size === 'number' && Number.isFinite(size) ? Math.floor(size) : 10, 10));
  const initialBackoff = options.initialBackoffMs ?? 1000;
  const maxBackoff = options.maxBackoffMs ?? 60000;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const state$ = new BehaviorSubject<OutboxState>({ pending: 0, sending: false });
  const backendNotFound = options.backendNotFound ?? createBackendNotFound();
  let missingSubscription: Subscription | undefined; // stop() lets go of the (maybe shared) tracker; start() and flush() take it up again
  const watchBackendMissing = () => missingSubscription ??= backendNotFound.backendMissing$.subscribe((backendMissing) => {
    if (backendMissing !== state$.value.backendMissing) state$.next({ ...state$.value, backendMissing });
  });
  watchBackendMissing();
  const attempts = new Map<string, number>();
  let backoff = initialBackoff;
  let unauthorizedSinceAccepted = 0;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let subscription: Subscription | undefined;
  let stopped = false;
  let insertedDuringRun = false;
  let stoppedDuringRun = false;
  const stuckAfter = options.stuckAfterMs ?? STUCK_AFTER_MS;
  // Each command's stuck clock counts only answered time, by the order outbox's rules. It starts when a batch that
  // sent the command fails with a failure the store answered (a `retry` other than `network`, where `timeout` counts
  // like a 503, or `no_progress`); a running clock keeps its `since` and takes the latest reason. A `network` failure
  // pauses every clock (`pausedAt`), and the next answer of any kind resumes them, moving `since` on by the offline
  // gap, so `since` is now minus the answered time. A clock clears when its command is no longer pending under its
  // commandId (applied or rejected); commands never sent have none. Nothing is isolated: a stuck command at the head
  // of a register's ledger holds up the commands behind it, by design, since register facts apply in `seq` order.
  // In memory only: a restart starts with no clocks, and the first answered failure after it starts them afresh
  // (accepted: register commands are few, and a restart re-sends at once).
  const clocks = new Map<string, { since: number; pausedAt?: number; seq: number; reason: string }>();
  let failureSeq = 0; // numbers failures, so `stuck` can name the latest reason

  function stuckState(): OutboxState['stuck'] {
    const stuck = [...clocks].filter(([, clock]) => (clock.pausedAt ?? now()) - clock.since >= stuckAfter);
    if (!stuck.length) return undefined;
    return { commandIds: stuck.map(([id]) => id), since: Math.min(...stuck.map(([, clock]) => clock.since)),
      reason: stuck.reduce((latest, entry) => (entry[1].seq > latest[1].seq ? entry : latest))[1].reason,
      orders: stuck.map(([commandId, { since, reason }]) => ({ commandId, since, reason })) };
  }
  function serverFailed(commands: RegisterCommand[], reason: string) {
    const at = now();
    for (const { commandId } of commands) clocks.set(commandId, { since: clocks.get(commandId)?.since ?? at, seq: ++failureSeq, reason });
  }

  async function updateState(patch: Partial<OutboxState> = {}) {
    const pending = await countFresh(collection, { syncStatus: 'pending' });
    const held = clocks.size ? await readFresh(collection, { selector: { syncStatus: 'pending', commandId: { $in: [...clocks.keys()] } } }) : [];
    for (const id of clocks.keys()) if (!held.some((command) => command.commandId === id)) clocks.delete(id);
    state$.next({ ...state$.value, ...patch, pending, stuck: stuckState() });
  }
  function scheduleRetry(reason: string, retryAfterMs = 0) {
    state$.next({ ...state$.value, lastRetryReason: reason, stuck: stuckState() });
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
      if (options.isEnabled?.() === false) return;
      const pending = await readFresh(collection, { selector: { syncStatus: 'pending' } });
      const registerIds = [...new Set(pending.map((command) => command.registerId))].sort();
      let sent = false;
      for (const registerId of registerIds) {
        const ledger = await readFresh(collection, {
          selector: { registerId, syncStatus: { $in: ['pending', 'rejected'] } },
          sort: [{ seq: 'asc' }, { key: 'asc' }],
        });
        const commands: RegisterCommand[] = [];
        for (const command of ledger) {
          if (command.syncStatus === 'rejected') break;
          commands.push(command);
          if (commands.length >= batchSize) break;
        }
        if (stopped) { stoppedDuringRun = true; return; }
        if (!commands.length) continue;
        sent = true;
        const batch: RegisterCommandEnvelope[] = commands.map((doc) => {
          const attempt = (attempts.get(doc.commandId) ?? 0) + 1;
          attempts.set(doc.commandId, attempt);
          return { id: doc.commandId, type: doc.type, version: doc.version, payload: doc.payload,
            createdAt: doc.createdAt, deviceId, attempt };
        });
        const outcome = await transport.send(batch);
        backendNotFound.record(outcome, now());
        const at = now();
        if (outcome.kind === 'retry' && outcome.reason === 'network') for (const clock of clocks.values()) clock.pausedAt ??= at;
        else for (const clock of clocks.values()) if (clock.pausedAt !== undefined) {
          clock.since += at - clock.pausedAt;
          clock.pausedAt = undefined;
        }
        if (outcome.kind === 'retry') {
          if (outcome.reason !== 'network') serverFailed(commands, outcome.reason);
          return scheduleRetry(outcome.reason, outcome.retryAfterMs);
        }
        if (outcome.kind === 'unauthorized') {
          unauthorizedSinceAccepted++;
          if (unauthorizedSinceAccepted < 3) return scheduleRetry('unauthorized');
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
        for (const command of commands) {
          const result = outcome.results.find((entry) => entry.id === command.commandId);
          if (!result) continue;
          // Skip the query cache and ignore a command changed while its send was in flight.
          const [stored] = await collection.storageInstance.findDocumentsById([command.key], false);
          if (stored?.syncStatus !== 'pending' || stored.commandId !== command.commandId) continue;
          const current = await collection.findOne(command.key).exec();
          if (!current) continue;
          const error = result.error && { code: result.error.code, message: result.error.message,
            ...(result.error.data ? { data: result.error.data } : {}) };
          const normalized: CommandResult = result.status === 'duplicate' && error
            ? { id: result.id, status: 'rejected', error }
            : { ...result, ...(error ? { error } : {}) };
          try { await options.onResult?.(plainCommand(stored), normalized); }
          catch (cause) { registerCommandsLogger.warn('Failed to apply register command result', { commandId: command.commandId, cause }); }
          const updatedAt = new Date(now()).toISOString();
          await current.incrementalModify((row) => {
            if (row.syncStatus !== 'pending' || row.commandId !== command.commandId) return row;
            return Object.assign(row, normalized.status === 'rejected'
              ? { syncStatus: 'rejected', error: normalized.error, updatedAt }
              : { syncStatus: 'applied', ...(normalized.register ? { result: normalized.register } : {}), updatedAt });
          });
          attempts.delete(command.commandId);
          progressed = true;
          await updateState();
        }
        if (!progressed) {
          serverFailed(commands, 'no_progress');
          return scheduleRetry('no_progress');
        }
        backoff = initialBackoff;
        state$.next({ ...state$.value, lastRetryReason: undefined });
      }
      if (!sent) return;
    } catch (error) {
      scheduleRetry('error: ' + (error instanceof Error ? error.message : String(error)));
      return;
    }
    stoppedDuringRun = true;
  }

  function flush(): Promise<void> {
    if (running) return running;
    stopped = false;
    watchBackendMissing();
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
      watchBackendMissing();
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
      missingSubscription?.unsubscribe(); missingSubscription = undefined;
      state$.next({ ...state$.value, nextAttemptAt: undefined });
    },
  };
}
