/**
 * The register session's local write path: open, count, close, cash movements and the frozen
 * closure. Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`.
 *
 * Everything here writes local-only collections (`schemas.ts`). WCPOS's outbox (`pending`,
 * `retryMovement`) moves to registers job c. A session's sales are the `pos_orders` documents
 * whose `sessionId` is the session's id, and their payments are its ledger rows. Refunds are
 * not attributed yet (no refund model, as in `deriveExpected`). The frozen closure's money
 * breakdowns (`payment_methods`, `opening_float`, `movements`, `tax_rates`) are minor-unit
 * integers, the same convention as the closure row itself; `closure-document.ts` converts them
 * to the decimal strings its envelope carries.
 */
import type { RxCollection } from 'rxdb';
import { DEFAULT_TAX_ROUNDING, taxLinesByRate } from '../tax/exact';
import type { PosOrder } from '../pos-order/types';
import { readFresh } from '../rxdb';
import { deriveExpected, type LedgerRow } from './expected';
import { recordRegisterFact } from './facts';
import { MAX_REASON_LENGTH } from './movement-input';
import { countVariance } from './register-count.helpers';
import { advancePerpetual, markClosuresSwept, mintClosureNumber, mintUuid as uuid, readRegister, type RegisterHost } from './register-document';
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

/** ADR-068 6a: movement amounts must be safe integers, positive for paid_in/paid_out and zero for no_sale. */
export class RegisterMovementAmountError extends Error {
  constructor(type: 'paid_in' | 'paid_out' | 'no_sale', amountMinor: number) {
    super(`movement_amount_invalid:${type}:${amountMinor}`);
    this.name = 'RegisterMovementAmountError';
  }
}

export class RegisterMovementReasonError extends Error {
  constructor() {
    super('movement_reason_invalid');
    this.name = 'RegisterMovementReasonError';
  }
}

/**
 * The movement is recorded, on a session that closed while it was saved, and no closure is known
 * to count it, so it stays local on the till. The caller must not record it again; the server
 * refuses it once the closure exists (ADR-068 4). The message can be shown to a cashier as it is.
 */
export class RegisterMovementStrandedError extends Error {
  readonly id: string;
  readonly session_id: string;
  constructor(movement: { id: string; session_id: string }) {
    super('Recorded, but the session closed while saving. It may not be on this session\'s Z. Do not enter it again.');
    this.name = 'RegisterMovementStrandedError';
    this.id = movement.id;
    this.session_id = movement.session_id;
  }
}

/** Every move a session may make. Nothing leaves `closed`; everything else is refused. */
const TRANSITIONS: Record<RegisterSession['status'], readonly RegisterSession['status'][]> = {
  open: ['counting', 'closed'],
  counting: ['open', 'closed'],
  closed: [],
};

/**
 * The session as stored, by primary key, not a cached `findOne(id)`: a status write that skips that
 * query (a server sync) can't leave a live-session check stale (docs/rxdb/query-cache-reads.md). A
 * deleted document counts as missing.
 */
export async function readSession(sessions: RegisterSessionCollection, id: string) {
  const [stored] = await sessions.storageInstance.findDocumentsById([id], false);
  return stored;
}

/** The closure as stored, by primary key, not a cached `findOne(id)` (as `readSession`); `undefined` without `closures`. */
async function readClosure(closures: ClosureCollection | undefined, id: string) {
  const [stored] = (await closures?.storageInstance.findDocumentsById([id], false)) ?? [];
  return stored;
}

async function requireLiveSession(sessions: RegisterSessionCollection, id: string) {
  const session = await readSession(sessions, id);
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
 * The orphan-stamp sweep (ADR-032, the #156 review). `stampSession`'s check and the app's insert
 * aren't atomic, so a close (a server close, which nothing local holds off) can land between them,
 * and the closure can freeze the session's orders before the insert lands: the order then carries
 * a closed session's `sessionId` but is on no Z. Each such order, whose session is closed and has
 * a closure that doesn't list it, becomes a late sale as `useSale` makes one: no `sessionId`,
 * `lateSessionId` set, and a `late-sale` fact. Never touched: the closure, an order it lists, an
 * order whose session has no closure yet, a late order and another register's orders. The decision
 * is made again on the stored order, so a repeat or concurrent sweep patches it once. Returns the
 * ids it patched.
 *
 * Bounded by `swept_closure_ids` on the register document (the #158 follow-ups): a closure already
 * in that set is never re-checked, so a repeat sweep with no new closure makes no `pos_orders`
 * query. The closure lists the "never touched" rules read still come from `readFresh`. Ids join
 * the set only after their orders are patched, so a crash in between just leaves that closure
 * unswept for the next run; the patch above is already idempotent.
 *
 * The bound alone leaves a hole: `writeClosure` can freeze a closure before an insert racing the
 * close lands, so a sweep run right after finds nothing there yet; marking that closure swept at
 * once would then hide the insert forever. So an id joins the set only once its closure is past
 * `SWEEP_GRACE_MS`; until then every sweep re-checks it (cheap: few closures are that recent).
 * `full` (the app-start sweep) ignores the set outright, so even a save that hangs past the grace
 * and lands after its closure is marked swept is still caught, on the next start.
 */
export const SWEEP_GRACE_MS = 10 * 60_000;

export async function sweepOrphanStamps({ sessions, closures, orders, registerId, register, storeKey, full = false }: {
  sessions: RegisterSessionCollection; closures: ClosureCollection; orders: RxCollection<PosOrder>; registerId: string;
  register: RegisterHost; storeKey: string;
  /** Ignores `swept_closure_ids` and checks every closure of this register: the app-start sweep. */
  full?: boolean;
}) {
  const closed = new Set((await readFresh(sessions, { selector: { register_id: registerId, status: 'closed' } })).map(({ id }) => id));
  const swept = new Set((await readRegister(register))?.stores[storeKey]?.registers?.[registerId]?.swept_closure_ids);
  const unswept = (await readFresh(closures, { selector: { register_id: registerId } }))
    .filter((closure) => closed.has(closure.session_id) && (full || !swept.has(closure.id)));
  const frozen = new Map(unswept.map((closure) => [closure.session_id, new Set(closure.order_ids)]));
  const patched: string[] = [];
  if (!frozen.size) return patched;
  for (const { id, sessionId, cashierRef } of await readFresh(orders, { selector: { sessionId: { $in: [...frozen.keys()] } } })) {
    if (!sessionId || frozen.get(sessionId)?.has(id) !== false) continue;
    let late = false;
    await (await orders.findOne(id).exec())?.incrementalModify((doc) => {
      late = doc.sessionId === sessionId && doc.lateSessionId === undefined;
      if (!late) return doc;
      delete doc.sessionId;
      return { ...doc, lateSessionId: sessionId };
    });
    if (!late) continue;
    patched.push(id);
    try {
      // As `useSale`'s late path: the cashier by ref only, with no display name.
      recordRegisterFact({ kind: 'late-sale', orderId: id, sessionId, registerId, actor: { id: cashierRef ?? '', name: '' } });
    } catch {
      // The logger calls the app's sinks unguarded; the order is already patched.
    }
  }
  // Only a closure past the grace joins the set, and only once every one of this batch's orders is
  // patched: a crash before this write just leaves it unswept, and the next sweep re-checks it,
  // patching nothing twice.
  const now = Date.now();
  const markSwept = unswept.filter((closure) => now - new Date(closure.closed_at).getTime() >= SWEEP_GRACE_MS).map(({ id }) => id);
  if (markSwept.length) await markClosuresSwept(register, storeKey, registerId, markSwept);
  return patched;
}

/**
 * `yyyy-MM-dd` of a GMT instant in an IANA `timezone`, or in the device's own zone for
 * `'device'`. `Intl` rather than WCPOS's `date-fns`, so no dependency is added.
 */
export function businessDayOf(atGmt: string, timezone: string) {
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

/**
 * Closes the session with its counted tenders (minor units); `timezone` dates a session opened
 * without a business day. `approvedBy`, the manager who approved the count, is written in the same
 * write as the close, and a repeat close keeps the first close's approver as it keeps its count.
 */
export async function closeSession(
  sessions: RegisterSessionCollection,
  id: string,
  input: { counted: Record<string, number>; closedBy?: string; approvedBy?: string; timezone?: string },
) {
  const session = await sessions.findOne(id).exec();
  if (!session) throw new RegisterSessionRequiredError();
  return transition(sessions, id, 'closed', {
    business_day: session.business_day || businessDayOf(session.opened_at_gmt, input.timezone ?? 'device'),
    counted: input.counted,
    closed_by: input.closedBy ?? null,
    ...(input.approvedBy ? { approved_by: input.approvedBy } : {}),
    closure_id: id,
  });
}

/**
 * Records a movement on a session that is `open` or `counting`; a closed or missing one is refused.
 * A close that races the insert ends in `RegisterSessionClosedError` (removed) or
 * `RegisterMovementStrandedError` (kept; don't record it again).
 */
export async function recordMovement(
  sessions: RegisterSessionCollection,
  movements: CashMovementCollection,
  closures: ClosureCollection,
  input: { sessionId: string; type: 'paid_in' | 'paid_out' | 'no_sale'; amountMinor: number; reason: string; actor: string },
) {
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    ((input.type === 'paid_in' || input.type === 'paid_out') && input.amountMinor <= 0) ||
    (input.type === 'no_sale' && input.amountMinor !== 0)
  ) throw new RegisterMovementAmountError(input.type, input.amountMinor);
  const reasonLength = input.reason.trim().length;
  if (reasonLength === 0 || reasonLength > MAX_REASON_LENGTH) throw new RegisterMovementReasonError();
  await requireLiveSession(sessions, input.sessionId);
  const row = await movements.insert({
    id: uuid(),
    session_id: input.sessionId,
    type: input.type,
    amountMinor: input.amountMinor,
    reason: input.reason.trim(),
    created_by: input.actor,
    created_at_gmt: new Date().toISOString(),
  });
  // Not atomic with the check above, so a close can land between the check and the insert. Once
  // the insert has succeeded, the movement is recorded, and the store never deletes a cash record
  // it cannot prove is uncounted (ADR-032):
  // - a closure row that lists it counts it, so it's returned;
  // - a closure row that doesn't list it proves it uncounted, because a closure is frozen, so it's
  //   removed and refused, and the cashier records it again in the next session;
  // - with no closure row yet nothing is proven: `writeClosure` freezes the movements its caller
  //   collected, not this collection, and reserves that draft on the register document before
  //   inserting the row, so a caller's array or the reservation may already hold it. It's kept and
  //   flagged stranded: it stays local on the till; the server refuses it once the closure exists.
  // If the re-read or the lookup fails, the outcome is unknown, so it's returned as recorded.
  let counted: readonly string[] | undefined;
  try {
    const after = await readSession(sessions, input.sessionId);
    if (after?.status !== 'closed') return row;
    counted = (await closures.findOne(input.sessionId).exec())?.movement_ids;
  } catch {
    return row;
  }
  if (!counted) throw new RegisterMovementStrandedError(row);
  if (counted.includes(row.id)) return row;
  try {
    await row.remove();
  } catch {
    throw new RegisterMovementStrandedError(row);
  }
  throw new RegisterSessionClosedError();
}

/**
 * Reverses a movement with a `void` row while its session is live; repeated or concurrent calls
 * share one reversal. A close that races the writes ends in `RegisterMovementStrandedError` (kept;
 * don't void it again). Without `closures`, nothing can prove the reversal counted, so a re-read
 * that finds the session closed always ends in `RegisterMovementStrandedError`.
 */
export async function voidMovement(
  sessions: RegisterSessionCollection, movements: CashMovementCollection, movementId: string, actor: string,
  closures?: ClosureCollection,
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
  const reversal =
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
    }));
  // Not atomic with the check above either (the #156 review): a close can land between the check
  // and the writes. As in `recordMovement`, once written the reversal is recorded, and it's never
  // deleted here, because deleting it would leave its target claimed by a missing reversal:
  // - a closure row that lists it counts it, so it's returned;
  // - a closure row that doesn't list it, or no closure row yet, leaves it uncounted or unproven,
  //   so it's kept locally and flagged stranded; the server refuses it once the closure exists.
  // If the re-read or the lookup fails, the outcome is unknown, so it's returned as recorded.
  let counted: readonly string[] | undefined;
  try {
    const after = await readSession(sessions, row.session_id);
    if (after?.status !== 'closed') return reversal;
    counted = (await readClosure(closures, row.session_id))?.movement_ids;
  } catch {
    return reversal;
  }
  if (counted?.includes(reversal.id)) return reversal;
  throw new RegisterMovementStrandedError(reversal);
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
  // Same per-rate split a receipt shows (`taxLinesByRate`), run per order so each order's rates
  // add up to its own taxMinor, then summed across the session's orders by rate. A line's own
  // taxInclusive overrides the order's, matching PosOrderLine's own fallback convention. Each order is split by the
  // tax rounding it recorded (#287), so its rows are its receipt's; absent is the default, today's split.
  const taxRates = new Map<string, { ratePpm: number; net_minor: number; tax_minor: number }>();
  const roundings = new Set<string>();
  for (const order of bound) {
    const { granularity, mode } = { mode: '', ...(order.taxRounding ?? DEFAULT_TAX_ROUNDING) };
    roundings.add(`${granularity} ${mode}`);
    const lines = order.lines.map((line) => ({ ...line, taxInclusive: line.taxInclusive ?? order.pricesIncludeTax }));
    for (const { ratePpm, netMinor, amountMinor } of taxLinesByRate(lines, order.taxMinor, undefined, order.taxRounding)) {
      const existing = taxRates.get(String(ratePpm));
      taxRates.set(String(ratePpm), {
        ratePpm,
        net_minor: (existing?.net_minor ?? 0) + netMinor,
        tax_minor: (existing?.tax_minor ?? 0) + amountMinor,
      });
    }
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
      tax_rates: Object.fromEntries(
        [...taxRates.values()].map(({ ratePpm, net_minor, tax_minor }) => [
          ratePpm, { name: `Tax ${ratePpm / 10000}%`, net_minor, tax_minor, gross_minor: net_minor + tax_minor },
        ]),
      ),
      // The session's sales used more than one tax rounding (#287): the Z report says so.
      ...(roundings.size > 1 ? { tax_rounding_mixed: true } : {}),
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
