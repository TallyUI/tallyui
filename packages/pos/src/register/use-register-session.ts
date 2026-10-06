/**
 * `useRegisterSession`: the till's register session as React state, and its actions (ADR-032).
 * Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c` `use-register-session.ts`.
 *
 * Neutral changes: the app supplies every input, as with the order outbox (no context, no
 * WooCommerce store document, no engine query). A session's sales are the `pos_orders` whose
 * `sessionId` is its id, and its expected figures and sales count are derived locally from them
 * and its movements. Nothing is sent to any server. Money is integer minor units.
 *
 * Not ported (registers job c2 owns the server side; TallyUI has no refund model yet):
 * - `retryMovement` and `refusedMovements`: there's no outbox to refuse a movement (c2).
 * - Refund records, refund parents and their demand and close-time wait: no refund model.
 * - Anchor invalidation, `server_expected` and `server_sales_count`: no server figures (c2).
 * - `unsyncedCount` and the `sync_status` filters: nothing is sent (c2).
 * - The binding (`useRegisterBinding`) and `blind` from WooCommerce capabilities: app inputs.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { combineLatest, map, of, switchMap } from 'rxjs';
import type { RxCollection } from 'rxdb';
import type { ServerCapabilities } from '@tallyui/core';
import type { PosOrder } from '../pos-order/types';
import { readFresh, watchFresh } from '../rxdb';
import { deriveExpected, type LedgerRow } from './expected';
import { recordRegisterFact, registerFactsLogger, type Actor } from './facts';
import { closeNeedsApproval } from './register-count.helpers';
import { reconcileRegisterCommands, registerCommandsLogger, type RegisterCommandCollection } from './register-commands';
import { observeRegister$, readRegister, type RegisterBucket, type RegisterDocument, type RegisterHost } from './register-document';
import type { CashMovement, Closure, RegisterSession } from './schemas';
import * as store from './session-store';
import { RegisterSessionRequiredError, type CashMovementCollection, type ClosureCollection, type RegisterSessionCollection } from './session-store';

/** A sale is at tender, so the till can't count or close under it. Its message can be shown to a cashier as it is. */
export class RegisterTenderInProgressError extends Error {
  constructor() {
    super('Finish or cancel the sale in progress first.');
    this.name = 'RegisterTenderInProgressError';
  }
}

/** The register already has an `open` or `counting` session, or an open is in flight. Its message can be shown to a cashier as it is. */
export class RegisterSessionAlreadyOpenError extends Error {
  constructor() {
    super('This register already has an open session.');
    this.name = 'RegisterSessionAlreadyOpenError';
  }
}

/** An earlier session's close didn't finish (its closure is unwritten or unapplied); close it first. Its message can be shown to a cashier as it is. */
export class RegisterCloseIncompleteError extends Error {
  constructor() {
    super('Finish closing the previous session first.');
    this.name = 'RegisterCloseIncompleteError';
  }
}

/** The count is over `varianceThreshold` and the close carries no `approvedBy`. Its message is `RegisterCount`'s refusal copy, so it can be shown to a cashier as it is. */
export class RegisterApprovalRequiredError extends Error {
  constructor() {
    super('Manager approval needed. Ask a manager to approve, or count again.');
    this.name = 'RegisterApprovalRequiredError';
  }
}

// Module-wide, so two hook instances for one register can't both open (keyed by `registerId`).
const openingByRegister = new Map<string, Promise<unknown>>();
// The close in flight per register, which a second close joins; its listeners re-render `closing`.
const closingByRegister = new Map<string, ReturnType<typeof store.writeClosure>>();
const closingListeners = new Set<() => void>();
const notifyClosing = () => closingListeners.forEach((listener) => listener());
const subscribeClosing = (listener: () => void) => {
  closingListeners.add(listener);
  return () => { closingListeners.delete(listener); };
};
// Closures whose `session-closed` fact is logged, so a double-tapped close logs it once.
const closedFacts = new Set<string>();

export interface UseRegisterSessionOptions {
  /** `register_sessions`, created with `addRegisterSessionCollection`; `null` while it opens. */
  sessions: RegisterSessionCollection | null;
  /** `cash_movements`; `null` while it opens. */
  movements: CashMovementCollection | null;
  /** `closures`; `null` while it opens. */
  closures: ClosureCollection | null;
  /** `register_commands`, created with `registerCommandCollection()`; `null` while it opens. */
  commands?: RegisterCommandCollection | null;
  capabilities?: ServerCapabilities;
  /** The till's name from the app's settings, sent on a register v2 open; the app supplies its platform fallback. */
  deviceName?: string | null;
  /** `pos_orders`: a session's sales are those whose `sessionId` is its id. */
  orders: RxCollection<PosOrder> | null;
  /** The register document's host, for the closure number and perpetual totals (`writeClosure`); `null` while it opens. */
  register: RegisterHost | null;
  /** The app's neutral store key (see `bindRegister`). */
  storeKey: string;
  /** The register (drawer) this till is bound to, or `null` when it isn't bound. */
  registerId: string | null;
  /** The store uses register sessions; `false` turns everything off, as WCPOS's `sessionsOn`. */
  enabled: boolean;
  /** The signed-in cashier, for the facts and `opened_by`/`closed_by`. */
  actor: Actor;
  /** The store's IANA zone, or `'device'`: the business day a session opens on. */
  timezone: string;
  /** The app's version, stamped on the closure. */
  softwareVersion: string;
  /** A sale is at tender (`sale.stage.kind === 'tender'`): counting and closing refuse. */
  tenderInProgress: boolean;
  /** The count variance, in minor units, over which the app asks for approval. */
  varianceThreshold?: number;
  /** `'HH:mm'` on the device's clock; an open session after it is `overdue`. */
  expectedCloseTime?: string;
  /** The cashier may not see expected figures while counting. */
  blind?: boolean;
  /** The closure's register name, and a person id's display name. */
  labels?: { registerName?: string; resolveCashierName?: (id: string) => string };
}

type Reservation = RegisterBucket['closure_reservation'];
type Snapshot = {
  rows: RegisterSession[]; closureRows: Closure[]; reservation: Reservation;
  entries: CashMovement[]; sales: PosOrder[];
};

const reservationOf = (register: RegisterDocument | null, storeKey: string, registerId: string) =>
  register?.stores[storeKey]?.registers?.[registerId]?.closure_reservation;

/** A closed session whose close didn't finish: its closure row was never written. */
const unwritten = (row: RegisterSession, closureRows: readonly { id: string }[]) =>
  row.status === 'closed' && row.closure_id === row.id && !closureRows.some((closure) => closure.id === row.id);

/**
 * The session for this register: first the one an unapplied closure reservation names (its close
 * was interrupted after the number was reserved, perhaps after its row was written), so it can
 * finish; then the open or counting one; then a conflict one; then a closed one whose closure row was never written; null if any status is unknown.
 */
function currentSession(rows: RegisterSession[], closureRows: Closure[], reservation: Reservation) {
  if (rows.some((row) => !store.isKnownSessionStatus(row.status))) return null;
  return (reservation && !reservation.applied ? rows.find((row) => row.id === reservation.row.session_id) : undefined)
    ?? rows.find((row) => row.status === 'open' || row.status === 'counting')
    ?? rows.find((row) => row.status === 'conflict')
    ?? rows.find((row) => unwritten(row, closureRows))
    ?? null;
}

/** A session's ledger rows, built from its orders' payments the way `writeClosure` builds them. */
function ledgerRows(orders: readonly PosOrder[]): LedgerRow[] {
  return orders.flatMap((order) => order.payments.map((payment) => ({
    session_id: order.sessionId, kind: payment.method === 'cash' ? 'cash' : 'other', method_id: payment.method,
    status: 'captured', amountMinor: payment.amountMinor,
  })));
}

export function useRegisterSession(options: UseRegisterSessionOptions) {
  const { sessions, movements, closures, orders, register, storeKey, registerId, enabled, actor, timezone, tenderInProgress, expectedCloseTime, labels } = options;
  const { commands } = options;
  const commandEnabled = (options.capabilities?.register ?? 0) >= 1;
  const commandTarget = useMemo(() => enabled && commandEnabled && commands && sessions && movements && closures && register && registerId
    ? { commands, sessions, movements, closures, host: register, storeKey, registerId, registerContract: options.capabilities?.register, deviceName: options.deviceName } : null,
  [enabled, commandEnabled, commands, sessions, movements, closures, register, storeKey, registerId, options.capabilities?.register, options.deviceName]);
  const commandTargetRef = useRef(commandTarget);
  commandTargetRef.current = commandTarget;
  const reconcile = (row?: RegisterSession) => {
    const target = commandTargetRef.current;
    if (!target) return;
    void reconcileRegisterCommands({ ...target, observed: row ? [row] : undefined }).catch((error: unknown) => {
      try {
        registerCommandsLogger.error('Register command reconcile failed', { context: { registerId: target.registerId, error: String(error) } });
      } catch {
        // A failing log sink must not affect a register action either.
      }
    });
  };
  useEffect(reconcile, [commandTarget]);
  const source = useMemo(() => {
    if (!enabled || !sessions || !movements || !closures || !orders || !registerId || !register) return null;
    return combineLatest([
      watchFresh(sessions, { selector: { register_id: registerId } }),
      watchFresh(closures, { selector: { register_id: registerId } }),
      observeRegister$(register).pipe(map((document) => reservationOf(document, storeKey, registerId))),
    ]).pipe(switchMap(([rows, closureRows, reservation]) => {
      const current = currentSession(rows, closureRows, reservation);
      if (!current) return of({ rows, closureRows, reservation, entries: [], sales: [] } as Snapshot);
      return combineLatest([
        watchFresh(movements, { selector: { session_id: current.id } }),
        watchFresh(orders, { selector: { sessionId: current.id } }),
      ]).pipe(map(([entries, sales]) => ({ rows, closureRows, reservation, entries, sales })));
    }));
  }, [enabled, sessions, movements, closures, orders, register, storeKey, registerId]);
  // A latest-value ref: an `actions` object from an earlier render still sees the current flag.
  const tender = useRef(tenderInProgress);
  tender.current = tenderInProgress;
  const closing = useSyncExternalStore(subscribeClosing, () => closingByRegister.has(registerId ?? ''));
  const [observed, setObserved] = useState<{ source: typeof source; snapshot: Snapshot } | null>(null);
  useEffect(() => {
    if (!source) return;
    const subscription = source.subscribe((snapshot) => setObserved({ source, snapshot }));
    return () => subscription.unsubscribe();
  }, [source]);
  // WCPOS re-evaluates `overdue` each minute.
  const [, setMinute] = useState(0);
  useEffect(() => {
    if (!enabled || !expectedCloseTime) return;
    const timer = setInterval(() => setMinute((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, [enabled, expectedCloseTime]);

  // Only an emission from the current source is trusted: a changed register or collection starts empty.
  const data = source && observed?.source === source ? observed.snapshot : null;

  // The orphan-stamp sweep (`store.sweepOrphanStamps`): one run at a time, and a request during a
  // run schedules one more, which reads afresh (carrying `full` forward if any waiting call asked
  // for it). A failure is logged, never thrown into the UI.
  const sweeper = useRef<{
    running?: Promise<void>; queued?: Promise<void>; queuedFull?: boolean;
    target?: Parameters<typeof store.sweepOrphanStamps>[0];
  }>({});
  sweeper.current.target = enabled && sessions && closures && orders && registerId && register
    ? { sessions, closures, orders, registerId, register, storeKey } : undefined;
  const sweep = (full = false): Promise<void> => {
    const state = sweeper.current;
    if (state.running) {
      state.queuedFull = state.queuedFull || full;
      return (state.queued ??= state.running.then(() => {
        const runFull = !!state.queuedFull;
        state.queued = undefined;
        state.queuedFull = undefined;
        return sweep(runFull);
      }));
    }
    const target = state.target;
    if (!target) return Promise.resolve();
    const run = store.sweepOrphanStamps({ ...target, full }).then(() => undefined, (error: unknown) => {
      try {
        registerFactsLogger.error('Register orphan-stamp sweep failed', { context: { type: 'register.sweep-failed', registerId: target.registerId, error: String(error) } });
      } catch {
        // A failing sink must not throw into the UI either.
      }
    }).finally(() => { state.running = undefined; });
    return (state.running = run);
  };
  // On start (this source's first snapshot), it sweeps every closure, ignoring `swept_closure_ids`
  // (`full`): the once-per-start repair for an insert that raced a close or a server close made
  // while the app was closed. Later, on a closure it hasn't seen (such as one a sync writes) and
  // after `closeSession`'s own closure, it runs the bounded, fast-path sweep instead.
  const seen = useRef<{ source: typeof source; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!data) return;
    const ids = data.closureRows.map((row) => row.id);
    if (seen.current?.source !== source) {
      seen.current = { source, ids: new Set(ids) };
      void sweep(true);
    } else if (ids.some((id) => !seen.current!.ids.has(id))) {
      ids.forEach((id) => seen.current!.ids.add(id));
      void sweep();
    }
  }, [data, source]);
  const session = data ? currentSession(data.rows, data.closureRows, data.reservation) : null;
  const entries = data?.entries ?? [];
  const sales = data?.sales ?? [];
  const expected = session
    ? deriveExpected({ session: { id: session.id, countedFloatMinor: session.counted_float_minor }, movements: entries, ledgerRowsBySession: ledgerRows(sales) })
    : {};
  const now = new Date();
  const [hour, minute] = String(expectedCloseTime ?? '').split(':').map(Number);
  const overdue = session?.status === 'open' && !!expectedCloseTime
    && now.getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).getTime();

  const requireOpen = () => store.requireOpenSession(sessions ?? undefined, registerId, enabled);
  // A non-null id means `sessions` was there to find it.
  const requireSaleSession = async () => {
    const id = await requireOpen();
    return id === null ? null : { id, sessions: sessions as RegisterSessionCollection };
  };
  const live = () => {
    if (!enabled || !sessions || !movements || !closures || !orders || !registerId || !register) throw new RegisterSessionRequiredError();
    return { sessions, movements, closures, orders, registerId, register };
  };
  const current = () => {
    if (!session) throw new RegisterSessionRequiredError();
    return session;
  };
  const refuseDuringTender = () => {
    if (tender.current) throw new RegisterTenderInProgressError();
  };
  const nameOf = (id: string | null | undefined) => !id ? '' : id === actor.id ? actor.name : labels?.resolveCashierName?.(id) ?? '';

  return {
    session,
    /** Any unknown session status in the current snapshot means the register needs upgrade. */
    needsUpgrade: data?.rows.some((row) => !store.isKnownSessionStatus(row.status)) ?? false,
    movements: entries,
    expected,
    salesCount: sales.length,
    overdue,
    /** A `closeSession` for this register is in flight, in any hook instance: the session can already be stored `closed` while its closure isn't written yet. */
    closing,
    lastClosure: [...(data?.closureRows ?? [])].sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0] ?? null,
    lastClosed: (data?.rows ?? []).filter((row) => row.status === 'closed')
      .sort((a, b) => (b.closed_at_gmt ?? '').localeCompare(a.closed_at_gmt ?? ''))[0] ?? null,
    varianceThreshold: options.varianceThreshold,
    enabled,
    blind: options.blind ?? false,
    /** Pass straight to useSale's `session` option: `complete()` then stamps through `stampSession`. */
    saleSession: session && sessions && (session.status === 'open' || session.status === 'counting') ? { id: session.id, sessions } : undefined,
    /** The open session's id, `null` when sessions are off, else `RegisterSessionRequiredError`. Call it when tender starts and before a card terminal captures. */
    requireOpen,
    /** `requireOpen()`, returning `{ id, sessions }`: pass it to useSale's `startTender`, which pins it (the rendered `saleSession` can lag). */
    requireSaleSession,
    actions: {
      /**
       * Refuses with `RegisterSessionAlreadyOpenError` while the register has a live session or
       * another open is running (in any hook instance), and with `RegisterCloseIncompleteError`
       * while an earlier close hasn't finished: a new session would lock the till behind it.
       * An unknown stored status refuses with `RegisterNeedsUpgradeError`.
       * A conflict session refuses with `RegisterSessionConflictError`; superseded and abandoned sessions do not block.
       */
      openSession: async (input: { expectedFloatMinor: number | null; countedFloatMinor: number }) => {
        // A double tap: the second call sees the first's promise, set before its first await.
        const key = registerId ?? '';
        if (openingByRegister.has(key)) throw new RegisterSessionAlreadyOpenError();
        const run = (async () => {
          const { sessions, closures, registerId, register } = live();
          // The storage, not the rendered snapshot or a cached query, which can lag a new write.
          const rows = await readFresh(sessions, { selector: { register_id: registerId } });
          if (rows.some((row) => !store.isKnownSessionStatus(row.status))) throw new store.RegisterNeedsUpgradeError();
          if (rows.some((row) => row.status === 'conflict')) throw new store.RegisterSessionConflictError();
          if (rows.some((row) => row.status === 'open' || row.status === 'counting')) throw new RegisterSessionAlreadyOpenError();
          // Closure rows before the reservation: a close reserves, then inserts its row, then applies the
          // reservation, so a close landing between the two reads is still caught by one of them.
          const closureRows = await readFresh(closures, { selector: { register_id: registerId } });
          const reservation = reservationOf(await readRegister(register), storeKey, registerId);
          if ((reservation && !reservation.applied) || rows.some((row) => unwritten(row, closureRows))) {
            throw new RegisterCloseIncompleteError();
          }
          const [year, month, day] = store.businessDayOf(new Date().toISOString(), timezone).split('-').map(Number);
          const row = await store.openSession(sessions, {
            ...input, registerId, openedBy: actor.id, businessDay: { year, month, day }, storeKey: options.storeKey,
          });
          recordRegisterFact({
            kind: 'session-opened', actor, sessionId: row.id, registerId: row.register_id,
            amount: row.counted_float_minor, variance: row.opening_variance_minor,
          });
          return row;
        })();
        openingByRegister.set(key, run);
        try {
          return await run;
        } finally {
          openingByRegister.delete(key);
          reconcile();
        }
      },
      startCounting: async () => {
        let row: Awaited<ReturnType<typeof store.startCounting>> | undefined;
        try {
        refuseDuringTender();
        row = await store.startCounting(live().sessions, current().id);
        recordRegisterFact({ kind: 'counting-started', actor, sessionId: row.id, registerId: row.register_id });
        return row;
        } finally {
          reconcile(row?.toJSON());
        }
      },
      backToSelling: async () => {
        let row: Awaited<ReturnType<typeof store.backToSelling>> | undefined;
        try {
        row = await store.backToSelling(live().sessions, current().id);
        recordRegisterFact({ kind: 'counting-abandoned', actor, sessionId: row.id, registerId: row.register_id });
        return row;
        } finally {
          reconcile(row?.toJSON());
        }
      },
      /**
       * `counted` maps each tender to its counted minor units. An interrupted close resumes with
       * the count persisted on the session, not the one passed to the retry (WCPOS uses the retry's).
       * Over `varianceThreshold` (`closeNeedsApproval`, as `RegisterCount`), a close without
       * `approvedBy` throws `RegisterApprovalRequiredError` before any write, blind or not; a
       * resumed close (the stored session already closed) isn't gated again. `approvedBy` reaches the Z
       * (`breakdowns.approved_by`), and `approvedByName` its `approved_by_name`.
       * One close per register runs at a time, in any hook instance: a call while one is in flight joins
       * it, getting its closure or error, and its own `counted`, `approvedBy` and `approvedByName` are ignored.
       */
      closeSession: async (input: { counted: Record<string, number>; approvedBy?: string; approvedByName?: string }) => {
        refuseDuringTender();
        const key = registerId ?? '';
        if (closingByRegister.has(key)) return closingByRegister.get(key)!;
        const run = (async () => {
        const { sessions, movements, closures, orders, register } = live();
        const open = current();
        // The gate reads the stored session and the Z's own inputs past the query cache, not this
        // render's snapshot, which can lag a sale or a close that already landed (#168 review).
        const stored = await store.readSession(sessions, open.id);
        if (!stored) throw new RegisterSessionRequiredError();
        if (stored.status !== 'closed' && !input.approvedBy) {
          // As `writeClosure` derives the Z's expected figures, from the same rows.
          const fresh = deriveExpected({
            session: { id: stored.id, countedFloatMinor: stored.counted_float_minor },
            movements: await readFresh(movements, { selector: { session_id: stored.id } }),
            ledgerRowsBySession: ledgerRows(await readFresh(orders, { selector: { sessionId: stored.id } })),
          });
          if (closeNeedsApproval(input.counted.cash ?? 0, fresh.cash ?? 0, options.varianceThreshold)) throw new RegisterApprovalRequiredError();
        }
        // By id, not `open` (plain data): `store.closeSession`'s guard runs again inside
        // `incrementalModify` on the stored document, so a close that already landed keeps its count, time, actor and approver.
        const closed = await store.closeSession(sessions, open.id, { counted: input.counted, closedBy: actor.id, approvedBy: input.approvedBy, timezone });
        // The session stores no approver name, so a close resumed without this call's name (after
        // a restart, say) falls back to `nameOf`.
        const approvedByName = (input.approvedBy && closed.approved_by === input.approvedBy && input.approvedByName) || nameOf(closed.approved_by);
        const { cash = 0, ...otherTenders } = closed.counted ?? input.counted;
        // Read past the query cache: the Z's figures are derived from these rows.
        const closure = await store.writeClosure({
          closures, register, storeKey, session: closed,
          counted: cash, otherTenders, timezone, softwareVersion: options.softwareVersion,
          movements: await readFresh(movements, { selector: { session_id: closed.id } }),
          orders: await readFresh(orders, { selector: { sessionId: closed.id } }),
          resolveCashierName: labels?.resolveCashierName,
          labels: {
            register_name: labels?.registerName ?? '', closed_by_name: nameOf(closed.closed_by),
            opened_by_name: nameOf(closed.opened_by), approved_by_name: approvedByName,
          },
        });
        // A stamp that raced this close, a resumed one included, is swept before the close returns.
        await sweep();
        // The fact's operationId is the closure id: a repeated or concurrent close logs it once.
        if (!closedFacts.has(closure.id)) {
          closedFacts.add(closure.id);
          // The approver the Z froze, not this call's: a repeat close never replaces it.
          if (closed.approved_by) {
            recordRegisterFact({ kind: 'approval-granted', actor, sessionId: closed.id, registerId: closed.register_id, approvedBy: closed.approved_by });
          }
          recordRegisterFact({
            kind: 'session-closed', actor, sessionId: closed.id, registerId: closed.register_id,
            closureId: closure.id, number: closure.number, counted: closure.counted, variance: closure.variance,
          });
        }
        return closure;
        })();
        closingByRegister.set(key, run); // Before this call's first await, so a second call sees it.
        notifyClosing();
        try {
          return await run;
        } finally {
          closingByRegister.delete(key);
          notifyClosing();
          reconcile();
        }
      },
      recordMovement: async (input: { type: 'paid_in' | 'paid_out' | 'no_sale'; amountMinor: number; reason: string }) => {
        try {
        // `live()` first: missing collections or host refuse before `requireOpen` writes anything.
        const { sessions, movements, closures, registerId } = live();
        const sessionId = await requireOpen();
        const row = await store.recordMovement(sessions, movements, closures, { ...input, sessionId: sessionId!, actor: actor.id });
        recordRegisterFact({
          kind: 'movement-recorded', actor, sessionId: row.session_id, registerId,
          movementId: row.id, movementType: row.type, amount: row.amountMinor,
        });
        return row;
        } finally {
          reconcile();
        }
      },
      voidMovement: async (id: string) => {
        try {
        const { sessions, movements, closures, registerId } = live();
        await requireOpen();
        const row = await store.voidMovement(sessions, movements, id, actor.id, closures);
        recordRegisterFact({
          kind: 'movement-voided', actor, sessionId: row.session_id, registerId,
          movementId: row.id, movementType: row.type, amount: row.amountMinor, voids: id,
        });
        return row;
        } finally {
          reconcile();
        }
      },
    },
  };
}
