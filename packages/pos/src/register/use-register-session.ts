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
import { useEffect, useMemo, useRef, useState } from 'react';
import { combineLatest, map, of, switchMap } from 'rxjs';
import type { MangoQuerySelector, RxCollection, RxDocument } from 'rxdb';
import type { PosOrder } from '../pos-order/types';
import { deriveExpected, type LedgerRow } from './expected';
import { recordRegisterFact, type Actor } from './facts';
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

// Module-wide, so two hook instances for one register can't both open (keyed by `registerId`).
const openingByRegister = new Map<string, Promise<unknown>>();
// Closures whose `session-closed` fact is logged, so a double-tapped close logs it once.
const closedFacts = new Set<string>();

export interface UseRegisterSessionOptions {
  /** `register_sessions`, created with `registerSessionCollection()`; `null` while it opens. */
  sessions: RegisterSessionCollection | null;
  /** `cash_movements`; `null` while it opens. */
  movements: CashMovementCollection | null;
  /** `closures`; `null` while it opens. */
  closures: ClosureCollection | null;
  /** `pos_orders`: a session's sales are those whose `sessionId` is its id. */
  orders: RxCollection<PosOrder> | null;
  /** The register document's host, for the closure number and perpetual totals (`writeClosure`). */
  register: RegisterHost;
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

type SessionDoc = RxDocument<RegisterSession>;
type Reservation = RegisterBucket['closure_reservation'];
type Snapshot = {
  rows: SessionDoc[]; closureRows: RxDocument<Closure>[]; reservation: Reservation;
  entries: RxDocument<CashMovement>[]; sales: RxDocument<PosOrder>[];
};

const reservationOf = (register: RegisterDocument | null, storeKey: string, registerId: string) =>
  register?.stores[storeKey]?.registers?.[registerId]?.closure_reservation;

/** A closed session whose close didn't finish: its closure row was never written. */
const unwritten = (row: RegisterSession, closureRows: readonly { id: string }[]) =>
  row.status === 'closed' && row.closure_id === row.id && !closureRows.some((closure) => closure.id === row.id);

/**
 * The session for this register: first the one an unapplied closure reservation names (its close
 * was interrupted after the number was reserved, perhaps after its row was written), so it can
 * finish; then the open or counting one; then a closed one whose closure row was never written.
 */
function currentSession(rows: SessionDoc[], closureRows: RxDocument<Closure>[], reservation: Reservation) {
  return (reservation && !reservation.applied ? rows.find((row) => row.id === reservation.row.session_id) : undefined)
    ?? rows.find((row) => row.status !== 'closed')
    ?? rows.find((row) => unwritten(row, closureRows))
    ?? null;
}

/**
 * Reads straight from the storage with the query RxDB would run, past its query cache. In RxDB
 * 16.21.1 a document written a microtask or so after a query first subscribes never reaches that
 * cached query, and its `exec()` keeps returning the stale result (bug 4 in the local RxDB repro).
 */
async function readFresh<T>(collection: RxCollection<T>, selector: MangoQuerySelector<T>): Promise<T[]> {
  const { documents } = await collection.storageInstance.query(collection.find({ selector }).getPreparedQuery());
  return documents as T[];
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
  const source = useMemo(() => {
    if (!enabled || !sessions || !movements || !closures || !orders || !registerId) return null;
    return combineLatest([
      sessions.find({ selector: { register_id: registerId } }).$,
      closures.find({ selector: { register_id: registerId } }).$,
      observeRegister$(register).pipe(map((document) => reservationOf(document, storeKey, registerId))),
    ]).pipe(switchMap(([rows, closureRows, reservation]) => {
      const current = currentSession(rows, closureRows, reservation);
      if (!current) return of({ rows, closureRows, reservation, entries: [], sales: [] } as Snapshot);
      return combineLatest([
        movements.find({ selector: { session_id: current.id } }).$,
        orders.find({ selector: { sessionId: current.id } }).$,
      ]).pipe(map(([entries, sales]) => ({ rows, closureRows, reservation, entries, sales })));
    }));
  }, [enabled, sessions, movements, closures, orders, register, storeKey, registerId]);
  // A latest-value ref: an `actions` object from an earlier render still sees the current flag.
  const tender = useRef(tenderInProgress);
  tender.current = tenderInProgress;
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
  const live = () => {
    if (!enabled || !sessions || !movements || !closures || !orders || !registerId) throw new RegisterSessionRequiredError();
    return { sessions, movements, closures, orders, registerId };
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
    movements: entries,
    expected,
    salesCount: sales.length,
    overdue,
    lastClosure: [...(data?.closureRows ?? [])].sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0] ?? null,
    lastClosed: (data?.rows ?? []).filter((row) => row.status === 'closed')
      .sort((a, b) => (b.closed_at_gmt ?? '').localeCompare(a.closed_at_gmt ?? ''))[0] ?? null,
    varianceThreshold: options.varianceThreshold,
    enabled,
    blind: options.blind ?? false,
    /** Pass straight to useSale's `session` option: `complete()` then stamps through `stampSession`. */
    saleSession: session && sessions && session.status !== 'closed' ? { id: session.id, sessions } : undefined,
    /** The open session's id, `null` when sessions are off, else `RegisterSessionRequiredError`. Call it when tender starts and before a card terminal captures. */
    requireOpen,
    actions: {
      /**
       * Refuses with `RegisterSessionAlreadyOpenError` while the register has a live session or
       * another open is running (in any hook instance), and with `RegisterCloseIncompleteError`
       * while an earlier close hasn't finished: a new session would lock the till behind it.
       */
      openSession: async (input: { expectedFloatMinor: number | null; countedFloatMinor: number }) => {
        // A double tap: the second call sees the first's promise, set before its first await.
        const key = registerId ?? '';
        if (openingByRegister.has(key)) throw new RegisterSessionAlreadyOpenError();
        const run = (async () => {
          const { sessions, closures, registerId } = live();
          // The storage, not the rendered snapshot or a cached query, which can lag a new write.
          const rows = await readFresh(sessions, { register_id: registerId });
          if (rows.some((row) => row.status !== 'closed')) throw new RegisterSessionAlreadyOpenError();
          const reservation = reservationOf(await readRegister(register), storeKey, registerId);
          const closureRows = await readFresh(closures, { register_id: registerId });
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
        }
      },
      startCounting: async () => {
        refuseDuringTender();
        const row = await store.startCounting(live().sessions, current().id);
        recordRegisterFact({ kind: 'counting-started', actor, sessionId: row.id, registerId: row.register_id });
        return row;
      },
      backToSelling: async () => {
        const row = await store.backToSelling(live().sessions, current().id);
        recordRegisterFact({ kind: 'counting-abandoned', actor, sessionId: row.id, registerId: row.register_id });
        return row;
      },
      /**
       * `counted` maps each tender to its counted minor units. An interrupted close resumes with
       * the count persisted on the session, not the one passed to the retry (WCPOS uses the retry's).
       */
      closeSession: async (input: { counted: Record<string, number> }) => {
        refuseDuringTender();
        const { sessions, movements, closures, orders } = live();
        const open = current();
        const closed = open.status === 'closed'
          ? open.getLatest()
          : await store.closeSession(sessions, open.id, { counted: input.counted, closedBy: actor.id, timezone });
        const { cash = 0, ...otherTenders } = closed.counted ?? input.counted;
        // Read past the query cache: the Z's figures are derived from these rows.
        const closure = await store.writeClosure({
          closures, register, storeKey, session: closed,
          counted: cash, otherTenders, timezone, softwareVersion: options.softwareVersion,
          movements: await readFresh(movements, { session_id: closed.id }),
          orders: await readFresh(orders, { sessionId: closed.id }),
          resolveCashierName: labels?.resolveCashierName,
          labels: {
            register_name: labels?.registerName ?? '', closed_by_name: nameOf(closed.closed_by),
            opened_by_name: nameOf(closed.opened_by), approved_by_name: nameOf(closed.approved_by),
          },
        });
        // The fact's operationId is the closure id: a repeated or concurrent close logs it once.
        if (!closedFacts.has(closure.id)) {
          closedFacts.add(closure.id);
          recordRegisterFact({
            kind: 'session-closed', actor, sessionId: closed.id, registerId: closed.register_id,
            closureId: closure.id, number: closure.number, counted: closure.counted, variance: closure.variance,
          });
        }
        return closure;
      },
      recordMovement: async (input: { type: 'paid_in' | 'paid_out' | 'no_sale'; amountMinor: number; reason: string }) => {
        const sessionId = await requireOpen();
        const { sessions, movements, closures, registerId } = live();
        const row = await store.recordMovement(sessions, movements, closures, { ...input, sessionId: sessionId!, actor: actor.id });
        recordRegisterFact({
          kind: 'movement-recorded', actor, sessionId: row.session_id, registerId,
          movementId: row.id, movementType: row.type, amount: row.amountMinor,
        });
        return row;
      },
      voidMovement: async (id: string) => {
        await requireOpen();
        const { sessions, movements, registerId } = live();
        const row = await store.voidMovement(sessions, movements, id, actor.id);
        recordRegisterFact({
          kind: 'movement-voided', actor, sessionId: row.session_id, registerId,
          movementId: row.id, movementType: row.type, amount: row.amountMinor, voids: id,
        });
        return row;
      },
    },
  };
}
