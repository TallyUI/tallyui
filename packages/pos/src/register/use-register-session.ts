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
import type { RxCollection, RxDocument } from 'rxdb';
import type { PosOrder } from '../pos-order/types';
import { deriveExpected, type LedgerRow } from './expected';
import { recordRegisterFact, type Actor } from './facts';
import type { RegisterHost } from './register-document';
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
type Snapshot = { rows: SessionDoc[]; closureRows: RxDocument<Closure>[]; entries: RxDocument<CashMovement>[]; sales: RxDocument<PosOrder>[] };

/** The session for this register: open or counting, else a closed one whose closure write was interrupted. */
function currentSession(rows: SessionDoc[], closureRows: RxDocument<Closure>[]) {
  return rows.find((row) => row.status !== 'closed')
    ?? rows.find((row) => row.status === 'closed' && row.closure_id === row.id && !closureRows.some((closure) => closure.id === row.id))
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
  const { sessions, movements, closures, orders, registerId, enabled, actor, timezone, tenderInProgress, expectedCloseTime, labels } = options;
  const source = useMemo(() => {
    if (!enabled || !sessions || !movements || !closures || !orders || !registerId) return null;
    return combineLatest([
      sessions.find({ selector: { register_id: registerId } }).$,
      closures.find({ selector: { register_id: registerId } }).$,
    ]).pipe(switchMap(([rows, closureRows]) => {
      const current = currentSession(rows, closureRows);
      if (!current) return of({ rows, closureRows, entries: [], sales: [] } as Snapshot);
      return combineLatest([
        movements.find({ selector: { session_id: current.id } }).$,
        orders.find({ selector: { sessionId: current.id } }).$,
      ]).pipe(map(([entries, sales]) => ({ rows, closureRows, entries, sales })));
    }));
  }, [enabled, sessions, movements, closures, orders, registerId]);
  // Latest-value refs: an `actions` object from an earlier render still sees the current flag,
  // and a double tap on open shares one in-flight promise.
  const tender = useRef(tenderInProgress);
  tender.current = tenderInProgress;
  const opening = useRef<Promise<unknown> | null>(null);
  const [observed, setObserved] = useState<{ source: typeof source; snapshot: Snapshot } | null>(null);
  useEffect(() => {
    if (!source) return;
    const subscription = source.subscribe((snapshot) => setObserved({ source, snapshot }));
    return () => subscription.unsubscribe();
  }, [source]);
  // WCPOS re-evaluates `overdue` each minute.
  const [, setMinute] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setMinute((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Only an emission from the current source is trusted: a changed register or collection starts empty.
  const data = source && observed?.source === source ? observed.snapshot : null;
  const session = data ? currentSession(data.rows, data.closureRows) : null;
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
      /** Refuses with `RegisterSessionAlreadyOpenError` while the register has a live session or another open is running. */
      openSession: async (input: { expectedFloatMinor: number | null; countedFloatMinor: number }) => {
        // A double tap: the second call sees the first's promise, set before its first await.
        if (opening.current) throw new RegisterSessionAlreadyOpenError();
        const run = (async () => {
          const { sessions, registerId } = live();
          // The collection, not the rendered snapshot, which can lag a session just opened.
          const existing = await sessions.findOne({ selector: { register_id: registerId, status: { $in: ['open', 'counting'] } } }).exec();
          if (existing) throw new RegisterSessionAlreadyOpenError();
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
        opening.current = run;
        try {
          return await run;
        } finally {
          opening.current = null;
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
      /** `counted` maps each tender to its counted minor units; an interrupted close resumes. */
      closeSession: async (input: { counted: Record<string, number> }) => {
        refuseDuringTender();
        const { sessions, movements, closures, orders } = live();
        const open = current();
        const closed = open.status === 'closed'
          ? open.getLatest()
          : await store.closeSession(sessions, open.id, { counted: input.counted, closedBy: actor.id, timezone });
        const { cash = 0, ...otherTenders } = input.counted;
        const closure = await store.writeClosure({
          closures, register: options.register, storeKey: options.storeKey, session: closed,
          counted: cash, otherTenders, timezone, softwareVersion: options.softwareVersion,
          movements: await movements.find({ selector: { session_id: closed.id } }).exec(),
          orders: await orders.find({ selector: { sessionId: closed.id } }).exec(),
          resolveCashierName: labels?.resolveCashierName,
          labels: {
            register_name: labels?.registerName ?? '', closed_by_name: nameOf(closed.closed_by),
            opened_by_name: nameOf(closed.opened_by), approved_by_name: nameOf(closed.approved_by),
          },
        });
        recordRegisterFact({
          kind: 'session-closed', actor, sessionId: closed.id, registerId: closed.register_id,
          closureId: closure.id, number: closure.number, counted: closure.counted, variance: closure.variance,
        });
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
