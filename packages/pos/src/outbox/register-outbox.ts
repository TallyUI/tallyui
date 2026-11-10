import type { CommandResult, RegisterCommandEnvelope } from '@tallyui/core';
import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import { registerCommandsLogger, type RegisterCommand } from '../register/register-commands';
import type { RegisterSessionCollection } from '../register/session-store';
import { countFresh, readFresh } from '../rxdb';
import { createBackendNotFound, type BackendNotFound } from './backend-not-found';
import { STUCK_AFTER_MS } from './order-outbox';
import { safeErrorMessage, safeErrorString } from './safe-error';
import type { CommandTransport, OutboxState } from './types';

/** Final rejections that do not stop their register's ledger (ADR-078): the commands behind them are still sent. */
export const NON_BLOCKING_REJECTIONS: ReadonlySet<string> = new Set(['register_session_superseded', 'register_session_abandoned']);

/** Refused approvals (ADR-082 decision 6). Like NON_BLOCKING_REJECTIONS they do not stop their register's ledger,
 * but its next `register.closure.submit` and every command after it wait: the store numbers closures in order. */
export const CLOSURE_HOLDING_REJECTIONS: ReadonlySet<string> = new Set(['register_approval_required', 'register_approval_invalid']);

// Codes the register requeue never resends (ADR-068 decision 5, ADR-078 decisions 4, 6 and 8): the store recorded
// these business conflicts, so the same id replays the refusal; superseded and abandoned are final; an already-open
// refusal has its own exits (Take over, Choose another register); idempotency_mismatch means the bytes differ.
// A refused approval replays at the store for its command id; recovery is a new command id (ADR-082 decisions 6 and 7).
const REGISTER_NOT_REQUEUEABLE: ReadonlySet<string> = new Set(['register_session_already_open',
  'register_session_closed', 'register_approval_required', 'register_approval_invalid', 'register_closure_exists',
  'register_closure_number_invalid', 'register_session_superseded', 'register_session_abandoned',
  'register_supersede_forbidden', 'idempotency_mismatch']);
/** Whether the register outbox's requeue() resends a rejection with this code. */
export function isRegisterRequeueable(code: string | undefined): boolean {
  return !REGISTER_NOT_REQUEUEABLE.has(code ?? '');
}

export interface RegisterOutboxOptions {
  collection: RxCollection<RegisterCommand>;
  /** The till's `register_sessions`. With it, a refused open (`register_session_already_open`) stops blocking its register
   * once its session is `abandoned` (ADR-078 decision 9). Without it, that refusal always blocks. */
  sessions?: RegisterSessionCollection;
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
  /** Moves rejected commands (all, or those whose commandId is listed) back to pending in their ledger place, under
   * the same commandId and payload, then flushes: a refusal the store did not record is weighed again on a resend
   * of the same id (ADR-068 decision 5). Codes isRegisterRequeueable refuses are left. Resolves to the number requeued. */
  requeue(commandIds?: string[]): Promise<number>;
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
  const { collection, sessions, transport, deviceId } = options;
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
  let sessionsSubscription: Subscription | undefined;
  let stopped = false;
  let insertedDuringRun = false;
  let stoppedDuringRun = false;
  const stuckAfter = options.stuckAfterMs ?? STUCK_AFTER_MS;
  // Each command's stuck clock counts only answered time, by the order outbox's rules. It starts when a batch that
  // sent the command fails with a failure the store answered (a `retry` other than `network`, where `timeout` counts
  // like a 503, or `no_progress`); a running clock keeps its `since` and takes the latest reason. A `network` failure
  // pauses every clock (`pausedAt`), and the next answer of any kind resumes them, moving `since` on by the offline
  // gap, so `since` is now minus the answered time. A clock clears when its command is no longer pending under its
  // commandId (applied or rejected), or when a blocking rejected command comes ahead of it in its ledger (it is not being
  // sent: Front desk, 2026-09-30), or when it is a held closure or comes after one, behind a refused approval in its
  // ledger (ADR-082 decision 6); commands never sent have none. Nothing is isolated: a stuck command at the head
  // of a register's ledger holds up the commands behind it, by design, since register facts apply in `seq` order.
  // In memory only: a restart starts with no clocks, and the first answered failure after it starts them afresh
  // (accepted: register commands are few, and a restart re-sends at once).
  const clocks = new Map<string, { since: number; firstFailedAt: number; pausedAt?: number; seq: number; reason: string }>();
  let failureSeq = 0; // numbers failures, so `stuck` can name the latest reason

  function stuckState(): OutboxState['stuck'] {
    const stuck = [...clocks].filter(([, clock]) => (clock.pausedAt ?? now()) - clock.since >= stuckAfter);
    if (!stuck.length) return undefined;
    return { commandIds: stuck.map(([id]) => id), since: Math.min(...stuck.map(([, clock]) => clock.since)),
      firstFailedAt: Math.min(...stuck.map(([, clock]) => clock.firstFailedAt)),
      reason: stuck.reduce((latest, entry) => (entry[1].seq > latest[1].seq ? entry : latest))[1].reason,
      orders: stuck.map(([commandId, { since, firstFailedAt, reason }]) => ({ commandId, since, firstFailedAt, reason })) };
  }
  function serverFailed(commands: RegisterCommand[], reason: string) {
    const at = now();
    for (const { commandId } of commands) clocks.set(commandId, { ...(clocks.get(commandId) ?? { since: at, firstFailedAt: at }), seq: ++failureSeq, reason });
  }

  function isNonBlocking(command: RegisterCommand, abandoned: ReadonlySet<string>): boolean {
    return NON_BLOCKING_REJECTIONS.has(command.error?.code ?? '') ||
      CLOSURE_HOLDING_REJECTIONS.has(command.error?.code ?? '') ||
      (command.error?.code === 'register_session_already_open' &&
        typeof command.payload.sessionId === 'string' && abandoned.has(command.payload.sessionId));
  }

  async function updateState(patch: Partial<OutboxState> = {}) {
    const rejectedRows = await readFresh(collection, { selector: { syncStatus: 'rejected' } });
    const abandoned = new Set(sessions && (clocks.size || rejectedRows.some((row) => row.error?.code === 'register_session_already_open'))
      ? (await readFresh(sessions, { selector: { status: 'abandoned' } })).map((session) => session.id) : []);
    const pending = await countFresh(collection, { syncStatus: 'pending' });
    const rejected = rejectedRows.filter((row) => !isNonBlocking(row, abandoned)).length;
    // Only commands in a register's sendable prefix (pending, before its first rejected command) keep a clock.
    const sendable = new Set<string>();
    const blocked = new Set<string>();
    const held = new Set<string>();
    if (clocks.size) for (const command of await readFresh(collection, { selector: { syncStatus: { $in: ['pending', 'rejected'] } },
      sort: [{ seq: 'asc' }, { key: 'asc' }] })) {
      if (command.syncStatus === 'rejected') {
        if (CLOSURE_HOLDING_REJECTIONS.has(command.error?.code ?? '')) held.add(command.registerId);
        if (!isNonBlocking(command, abandoned)) blocked.add(command.registerId);
      } else if (held.has(command.registerId) && command.type === 'register.closure.submit') blocked.add(command.registerId);
      else if (!blocked.has(command.registerId)) sendable.add(command.commandId);
    }
    for (const id of clocks.keys()) if (!sendable.has(id)) clocks.delete(id);
    state$.next({ ...state$.value, ...patch, pending, rejected, stuck: stuckState() });
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
      const abandoned = new Set(sessions
        ? (await readFresh(sessions, { selector: { status: 'abandoned' } })).map((session) => session.id) : []);
      let sent = false;
      for (const registerId of registerIds) {
        const ledger = await readFresh(collection, {
          selector: { registerId, syncStatus: { $in: ['pending', 'rejected'] } },
          sort: [{ seq: 'asc' }, { key: 'asc' }],
        });
        const commands: RegisterCommand[] = [];
        let held = false;
        for (const command of ledger) {
          if (command.syncStatus === 'rejected' && CLOSURE_HOLDING_REJECTIONS.has(command.error?.code ?? '')) held = true;
          if (command.syncStatus === 'rejected' && isNonBlocking(command, abandoned)) continue;
          if (command.syncStatus === 'rejected') break;
          if (held && command.type === 'register.closure.submit') break;
          commands.push(command);
          if (command.type === 'register.session.open' || commands.length >= batchSize) break;
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
          catch (cause) { registerCommandsLogger.warn('Failed to apply register command result', { commandId: command.commandId, error: safeErrorString(cause) }); }
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
      scheduleRetry('error: ' + safeErrorMessage(error));
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
    async requeue(commandIds) {
      const commands = (await readFresh(collection, { selector: { syncStatus: 'rejected',
        ...(commandIds ? { commandId: { $in: commandIds } } : {}) } }))
        .filter((row) => isRegisterRequeueable(row.error?.code));
      let count = 0;
      for (const command of commands) {
        let changed = false;
        await (await collection.findOne(command.key).exec())?.incrementalModify((row) => {
          changed = row.syncStatus === 'rejected' && row.commandId === command.commandId && isRegisterRequeueable(row.error?.code);
          if (!changed) return row;
          row.syncStatus = 'pending';
          delete row.error;
          row.updatedAt = new Date(now()).toISOString();
          return row;
        });
        if (changed) count++;
      }
      await updateState();
      if (count && !stopped) flush().catch(() => {});
      return count;
    },
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
      if (sessions && !sessionsSubscription) sessionsSubscription = sessions.$.subscribe((event) => {
        if (event.documentData?.status === 'abandoned') {
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
      sessionsSubscription?.unsubscribe();
      sessionsSubscription = undefined;
      missingSubscription?.unsubscribe(); missingSubscription = undefined;
      state$.next({ ...state$.value, nextAttemptAt: undefined });
    },
  };
}
