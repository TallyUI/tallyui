/**
 * The register session's local write path: open, count, close, cash movements and the frozen
 * closure. Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`.
 *
 * Everything here writes local-only collections (`schemas.ts`). WCPOS's outbox (`pending`,
 * `retryMovement`) moves to registers job c. A session's sales are the `pos_orders` documents
 * whose `sessionId` is the session's id, and their payments are its ledger rows. Refunds are
 * not attributed yet (no refund model, as in `deriveExpected`), and the closure has no per-rate
 * tax breakdown: `PosOrder` carries tax as per-line micros, and a Z report's per-rate rounding is
 * a decision of its own.
 */
import type { RxCollection } from 'rxdb';
import type { PosOrder } from '../pos-order/types';
import { deriveExpected, type LedgerRow } from './expected';
import { countVariance } from './register-count.helpers';
import { advancePerpetual, mintClosureNumber, mintUuid as uuid, readRegister, type RegisterHost } from './register-document';
import type { CashMovement, Closure, RegisterSession } from './schemas';

export type RegisterSessionCollection = RxCollection<RegisterSession>;
export type CashMovementCollection = RxCollection<CashMovement>;
export type ClosureCollection = RxCollection<Closure>;

export class RegisterSessionRequiredError extends Error {
  constructor() {
    super('register_session_not_open');
    this.name = 'RegisterSessionRequiredError';
  }
}

/** The session is closed, and a closed session is final: there's no server yet to refuse writes to it. */
export class RegisterSessionClosedError extends Error {
  constructor() {
    super('register_session_closed');
    this.name = 'RegisterSessionClosedError';
  }
}

/** Every move a session may make. Nothing leaves `closed`; everything else is refused. */
const TRANSITIONS: Record<RegisterSession['status'], readonly RegisterSession['status'][]> = {
  open: ['counting', 'closed'],
  counting: ['open', 'closed'],
  closed: [],
};

async function requireLiveSession(sessions: RegisterSessionCollection, id: string) {
  const session = await sessions.findOne(id).exec();
  if (!session) throw new RegisterSessionRequiredError();
  if (session.status === 'closed') throw new RegisterSessionClosedError();
  return session;
}

export const openSessionSelector = { status: 'open' } as const;

/** The open session's id before a money action, or `RegisterSessionRequiredError`; `null` when sessions are off. */
export async function requireOpenSession(
  sessions: RegisterSessionCollection | undefined,
  registerId: string | null,
  enabled: boolean,
) {
  if (!enabled) return null;
  const session = await sessions?.findOne({ selector: { register_id: registerId ?? '', ...openSessionSelector } }).exec();
  if (!session) throw new RegisterSessionRequiredError();
  // This gate precedes money actions: a pre-action snapshot must not return after sync.
  await session.incrementalPatch({ server_expected: null, server_sales_count: null });
  return session.id;
}

// The one sanctioned way to set `PosOrder.sessionId`: verifies `sessionId` is live and returns
// the order stamped with it -- `finalizeOrder` is pure and never checks it. Refuses to re-stamp
// an order that already carries a different session's id.
export async function stampSession(order: PosOrder, sessionId: string, sessions: RegisterSessionCollection): Promise<PosOrder> {
  if (order.sessionId !== undefined && order.sessionId !== sessionId) throw new Error('session_already_stamped');
  const session = await requireLiveSession(sessions, sessionId);
  return { ...order, sessionId: session.id };
}

/**
 * `yyyy-MM-dd` of a GMT instant in an IANA `timezone`, or in the device's own zone for
 * `'device'`. `Intl` rather than WCPOS's `date-fns`, so no dependency is added.
 */
function businessDayOf(atGmt: string, timezone: string) {
  const at = new Date(atGmt.endsWith('Z') ? atGmt : `${atGmt}Z`);
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone === 'device' ? undefined : timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const part = Object.fromEntries(format.formatToParts(at).map(({ type, value }) => [type, value]));
  return `${part.year}-${part.month}-${part.day}`;
}

export function openSession(
  sessions: RegisterSessionCollection,
  input: {
    registerId: string;
    expectedFloatMinor: number | null;
    countedFloatMinor: number;
    openedBy: string;
    /** The store's day, not the device's UTC day. */
    businessDay: { year: number; month: number; day: number };
    storeKey?: string | null;
  },
) {
  const { year, month, day } = input.businessDay;
  return sessions.insert({
    id: uuid(),
    register_id: input.registerId,
    store_key: input.storeKey ?? null,
    status: 'open',
    opened_at_gmt: new Date().toISOString(),
    opened_by: input.openedBy,
    business_day: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    expected_float_minor: input.expectedFloatMinor,
    counted_float_minor: input.countedFloatMinor,
    opening_variance_minor:
      input.expectedFloatMinor === null ? null : countVariance(input.countedFloatMinor, input.expectedFloatMinor),
  });
}

async function transition(
  sessions: RegisterSessionCollection,
  id: string,
  status: RegisterSession['status'],
  extra: Partial<RegisterSession> = {},
) {
  const row = await sessions.findOne(id).exec();
  if (!row) throw new RegisterSessionRequiredError();
  // A repeat close is a no-op that returns the closed session unchanged, not an error: it is what
  // a retry after a lost response needs, and it must not overwrite the count, time or actor.
  if (row.status === 'closed' && status === 'closed') return row;
  const at = new Date().toISOString();
  // The guard runs again on the latest document, so a racing write can't slip past it.
  return row.incrementalModify((doc) => {
    if (doc.status === 'closed' && status === 'closed') return doc;
    if (doc.status === 'closed') throw new RegisterSessionClosedError();
    if (!TRANSITIONS[doc.status].includes(status)) throw new Error(`invalid_session_transition:${doc.status}->${status}`);
    return {
      ...doc, ...extra,
      status,
      pending_status: status,
      status_at: at,
      ...(status === 'counting' ? { counting_started_at_gmt: at } : {}),
      ...(status === 'closed' ? { closed_at_gmt: at } : {}),
    };
  });
}

export const startCounting = (sessions: RegisterSessionCollection, id: string) => transition(sessions, id, 'counting');
export const backToSelling = (sessions: RegisterSessionCollection, id: string) => transition(sessions, id, 'open');

/** Closes the session with its counted tenders (minor units); `timezone` dates a session opened without a business day. */
export async function closeSession(
  sessions: RegisterSessionCollection,
  id: string,
  input: { counted: Record<string, number>; closedBy?: string; timezone?: string },
) {
  const session = await sessions.findOne(id).exec();
  if (!session) throw new RegisterSessionRequiredError();
  return transition(sessions, id, 'closed', {
    business_day: session.business_day || businessDayOf(session.opened_at_gmt, input.timezone ?? 'device'),
    counted: input.counted,
    closed_by: input.closedBy ?? null,
    closure_id: id,
  });
}

/** Records a movement on a session that is `open` or `counting`; a closed or missing one is refused. */
export async function recordMovement(
  sessions: RegisterSessionCollection,
  movements: CashMovementCollection,
  input: { sessionId: string; type: 'paid_in' | 'paid_out' | 'no_sale'; amountMinor: number; reason: string; actor: string },
) {
  await requireLiveSession(sessions, input.sessionId);
  const row = await movements.insert({
    id: uuid(),
    session_id: input.sessionId,
    type: input.type,
    amountMinor: input.amountMinor,
    reason: input.reason,
    created_by: input.actor,
    created_at_gmt: new Date().toISOString(),
  });
  // Not atomic with the check above: a close landing here still froze without this movement, so
  // it's removed rather than left off every Z; the cashier re-records it in the next session.
  const after = await sessions.findOne(input.sessionId).exec();
  if (after?.status === 'closed') {
    await row.remove();
    throw new RegisterSessionClosedError();
  }
  return row;
}

/** Reverses a movement with a `void` row while its session is live; repeated or concurrent calls share one reversal. */
export async function voidMovement(
  sessions: RegisterSessionCollection, movements: CashMovementCollection, movementId: string, actor: string,
) {
  const row = await movements.findOne(movementId).exec();
  if (!row || row.type === 'void') throw new Error('invalid_void_target');
  await requireLiveSession(sessions, row.session_id);
  // Repeated Undo taps share one durable reversal: the target's voided_by names it.
  const id = uuid();
  const claimed = await row.incrementalModify((doc) => {
    doc.voided_by ??= id;
    return doc;
  });
  const reversalId = claimed.voided_by!;
  const existing = await movements.findOne(reversalId).exec();
  return (
    existing ??
    (await movements.incrementalUpsert({
      id: reversalId,
      session_id: row.session_id,
      type: 'void',
      amountMinor: row.amountMinor,
      reason: row.reason,
      created_by: actor,
      created_at_gmt: new Date().toISOString(),
      voids: row.id,
    }))
  );
}

/**
 * Freezes a closed session's figures into its closure, once. The draft is reserved on the register
 * document with its number (`mintClosureNumber`), so a failed insert or a restarted till reuses the
 * same snapshot and number, and its period reaches the perpetual totals exactly once.
 * Only a closed session (`closed` with `closed_at_gmt`) has a closure, and a closed session is
 * final, so its existing closure is returned as it was frozen. Orders the server rejected still
 * count in the drawer, because the cash was taken.
 */
export async function writeClosure({
  closures,
  register,
  storeKey,
  session,
  counted,
  otherTenders,
  movements,
  orders,
  tillExpected,
  labels,
  resolveCashierName,
  softwareVersion,
  timezone = 'device',
}: {
  closures: ClosureCollection;
  /** The register document's host (`register_sessions`). */
  register: RegisterHost;
  storeKey: string;
  session: RegisterSession;
  /** Counted cash, minor units. */
  counted: number;
  otherTenders: Record<string, number>;
  movements: readonly CashMovement[];
  /** Any `pos_orders`; only those whose `sessionId` is this session's are counted. */
  orders: readonly PosOrder[];
  tillExpected?: Record<string, number>;
  labels?: { register_name: string; closed_by_name: string; opened_by_name?: string; approved_by_name?: string };
  resolveCashierName?: (id: string) => string;
  /** The app's version, stamped on the closure. */
  softwareVersion: string;
  timezone?: string;
}) {
  // Before anything is minted: an open session never reserves a closure number.
  if (session.status !== 'closed' || !session.closed_at_gmt) throw new Error('register_session_not_closed');
  const existing = await closures.findOne(session.id).exec();
  if (existing) {
    await advancePerpetual(register, storeKey, session.register_id, {
      salesMinor: existing.period_sales_total_minor,
      refundsMinor: existing.period_refunds_total_minor,
      closureId: existing.id,
    });
    return existing;
  }
  const bound = orders.filter((order) => order.sessionId === session.id);
  // Each payment is captured, and a cash payment's amount is already net of change.
  const rows: LedgerRow[] = bound.flatMap((order) =>
    order.payments.map((payment) => ({
      session_id: order.sessionId,
      kind: payment.method === 'cash' ? 'cash' : 'other',
      method_id: payment.method,
      status: 'captured',
      amountMinor: payment.amountMinor,
    })),
  );
  const entries = movements.filter((row) => row.session_id === session.id);
  const till_expected =
    tillExpected ??
    deriveExpected({
      session: { id: session.id, countedFloatMinor: session.counted_float_minor },
      movements: entries,
      ledgerRowsBySession: rows,
    });
  const counts = { cash: counted, ...otherTenders };
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const payment_methods: Record<string, { sales_minor: number; refunds_minor: number }> = {};
  for (const row of rows) {
    const method = row.kind === 'cash' ? 'cash' : row.method_id;
    payment_methods[method] = { sales_minor: (payment_methods[method]?.sales_minor ?? 0) + row.amountMinor, refunds_minor: 0 };
  }
  const unsynced = bound.filter((order) => order.syncStatus === 'pending');
  const draft: Closure = {
    id: session.id,
    session_id: session.id,
    register_id: session.register_id,
    store_key: session.store_key ?? null,
    number: 0,
    opened_at: session.opened_at_gmt,
    business_day: session.business_day || businessDayOf(session.opened_at_gmt, timezone),
    closed_by: session.closed_by ?? null,
    closed_at: session.closed_at_gmt!,
    till_expected,
    expected: till_expected,
    counted: counts,
    variance: Object.fromEntries(
      Object.entries(counts).map(([method, value]) => [method, countVariance(value, till_expected[method] ?? 0)]),
    ),
    period_sales_total_minor: sum(rows.map((row) => row.amountMinor)),
    period_refunds_total_minor: 0,
    perpetual_sales_total_minor: 0,
    perpetual_refunds_total_minor: 0,
    unsynced_count: unsynced.length,
    unsynced_total_minor: sum(unsynced.flatMap((order) => order.payments.map((payment) => payment.amountMinor))),
    software_version: softwareVersion,
    printed_at: null,
    print_count: 0,
    breakdowns: {
      ...labels,
      opened_by: session.opened_by ?? null,
      approved_by: session.approved_by ?? null,
      payment_methods,
      opening_float: {
        expected_minor: session.expected_float_minor ?? null,
        counted_minor: session.counted_float_minor,
        variance_minor: session.opening_variance_minor ?? null,
      },
      movements: entries.map(({ id, type, amountMinor, reason, voids, voided_by, created_at_gmt, created_by }) => ({
        id, type, amountMinor, reason, voids: voids ?? null, created_at_gmt, created_by: created_by ?? null, voided_by: voided_by ?? null,
      })),
      transaction_count: bound.length,
      refund_count: 0,
      cashiers: [...new Set(bound.map((order) => order.cashierRef ?? '').filter(Boolean))].map((id) => ({
        id,
        name: resolveCashierName?.(id) || id,
      })),
    },
    order_ids: bound.map((order) => order.id),
    movement_ids: entries.map((row) => row.id),
  };
  // Reserve the snapshot in the same atomic document write as its number. A failed insert
  // or restarted till reuses this exact snapshot.
  await mintClosureNumber(register, storeKey, session.register_id, draft);
  const reserved = (await readRegister(register))!.stores[storeKey].registers![session.register_id].closure_reservation!.row;
  let row;
  try {
    row = await closures.insert({ ...reserved, order_ids: [...reserved.order_ids], movement_ids: [...reserved.movement_ids] });
  } catch (error) {
    const winner = await closures.findOne(reserved.id).exec();
    if (!winner) throw error;
    row = winner;
  }
  await advancePerpetual(register, storeKey, session.register_id, {
    salesMinor: row.period_sales_total_minor,
    refundsMinor: row.period_refunds_total_minor,
    closureId: row.id,
  });
  return row;
}
