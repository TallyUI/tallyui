/**
 * What the register should hold at close, per tender method: the session's cash float plus
 * captured payments and cash movements — never what the cashier counts. Port provenance
 * (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`.
 *
 * Refunds come from the till's applied `pos_refunds`, counted in the record's own `sessionId`
 * (ADR-080 amendment 1), by the server's rule. WCPOS's `attributeRefunds` fallbacks (allocations,
 * `refunded_amount`) are not ported: the store attributes each refund to a tender in `byMethod`.
 */
import { legMethodId } from '@tallyui/core';
import { parkedTakenLegs } from '../order/order-drafts';
import type { Payment } from '../order/types';
import { countedTillPayments } from '../pos-order/till-payments';
import type { PosOrderStoreSettlement } from '../pos-order/types';
import type { PosRefund } from '../refund/pos-refund';

export type RefundRow = Pick<PosRefund, 'id' | 'sessionId' | 'status' | 'result'>;

export function refundAmounts(refund: RefundRow): Array<[string, number]> {
  const result = refund.result;
  if (typeof result !== 'object' || result === null ||
    (Object.getPrototypeOf(result) !== Object.prototype && Object.getPrototypeOf(result) !== null)) return [];
  const byMethod = result.byMethod;
  if (typeof byMethod !== 'object' || byMethod === null ||
    (Object.getPrototypeOf(byMethod) !== Object.prototype && Object.getPrototypeOf(byMethod) !== null)) return [];
  return Object.entries(byMethod).filter(([method, amount]) => method.length > 0 && Number.isSafeInteger(amount) && amount >= 0);
}

/** `session_id`, `kind`, `method_id`, `status` kept as WCPOS names them; money is TallyUI's integer-minor-units convention. */
export type LedgerRow = {
  session_id?: string | null;
  kind: string;
  method_id: string;
  status: string;
  amountMinor: number;
};

/**
 * The ledger rows of these orders' payments. Each payment is captured, and a cash payment's amount is already net of change.
 * A locked store payment (storePaymentId set) is the store's earlier money, not this till's, and is left out (ADR-090 gate 11).
 * A payment stamped with the session that took it counts there, else in its order's (S3).
 */
export function paymentLedgerRows<P extends { id?: string; method: string; amountMinor: number; storePaymentId?: string; sessionId?: string }>(
  orders: readonly { sessionId?: string; payments: readonly P[]; storeSettlement?: TillOrder['storeSettlement'] }[],
): LedgerRow[] {
  return orders.flatMap((order) => countedTillPayments(order).map((payment) => ({
    session_id: payment.sessionId ?? order.sessionId, kind: payment.method === 'cash' ? 'cash' : 'other', method_id: payment.method,
    status: 'captured', amountMinor: payment.amountMinor,
  })));
}

/** S3: the ledger rows of the live sale's taken legs (`useSale`'s `registerView().takenLegs`), each in the session that took it. */
export function liveLedgerRows(legs: readonly Payment[]): LedgerRow[] {
  return paymentLedgerRows([{ payments: legs }]);
}

/** S3: the ledger rows of parked drafts' taken legs (`order_drafts` documents), mapped as `liveLedgerRows` maps the live sale's. */
export function parkedLedgerRows(drafts: readonly { data?: unknown }[]): LedgerRow[] {
  return liveLedgerRows(drafts.flatMap((draft) => parkedTakenLegs(draft.data)));
}

/** `type`, `voids` and `voided_by` are kept as WCPOS names them: neutral across backends. */
export type Movement = {
  id: string;
  session_id: string;
  type: string;
  amountMinor: number;
  voided_by?: string | null;
  voids?: string | null;
};

/**
 * Expected totals per tender method: the counted float, plus every captured ledger row for the
 * session (grouped under `cash` for cash rows, else `method_id`), plus its non-voided
 * paid-in/paid-out movements, minus its applied refunds.
 *
 * A movement is excluded when its own `voided_by` is set, or when a `type: 'void'` row's
 * `voids` names its id; the `void` row itself carries no amount of its own.
 */
export function deriveExpected({
  session,
  movements,
  ledgerRowsBySession,
  refunds,
}: {
  session: { id: string; countedFloatMinor: number };
  movements: readonly Movement[];
  ledgerRowsBySession: readonly LedgerRow[];
  refunds?: readonly RefundRow[];
}): Record<string, number> {
  // A Map, so a method id named like an Object.prototype member (`__proto__`) stays an ordinary key.
  const totals = new Map<string, number>([['cash', session.countedFloatMinor]]);
  const plus = (method: string, amount: number) => totals.set(method, (totals.get(method) ?? 0) + amount);
  for (const row of ledgerRowsBySession) {
    if (row.session_id !== session.id || row.status !== 'captured') continue;
    plus(row.kind === 'cash' ? 'cash' : row.method_id, row.amountMinor);
  }
  const voids = new Set(
    movements
      .filter((row) => row.session_id === session.id && row.type === 'void')
      .map((row) => row.voids),
  );
  for (const row of movements) {
    if (row.session_id !== session.id || row.voided_by || voids.has(row.id)) continue;
    if (row.type === 'paid_in') plus('cash', row.amountMinor);
    if (row.type === 'paid_out') plus('cash', -row.amountMinor);
  }
  for (const refund of refunds ?? []) {
    if (refund.status !== 'applied' || refund.sessionId !== session.id) continue;
    for (const [method, amount] of refundAmounts(refund)) plus(method, -amount);
  }
  return Object.fromEntries(totals);
}

export interface DrawerTerm { amountMinor: number; count: number }
export interface DrawerTerms {
  floatMinor: number;
  cashSales: DrawerTerm;
  cashRefunds: DrawerTerm;
  paidIn: DrawerTerm;
  paidOut: DrawerTerm;
  noSales: number;
  /** Non-cash methods: captured rows minus applied refunds, keyed by method_id. */
  otherTenders: Record<string, DrawerTerm>;
  /** Cash sales − cash refunds + Σ other tenders' amounts (v2 `register-panel.tsx:216-219`). */
  sessionSalesMinor: number;
  /** Exactly deriveExpected's result for the same input. */
  expected: Record<string, number>;
}

/**
 * `deriveExpected`'s figures term by term, each with the number of rows behind it, for the
 * register panel's drawer ledger (WCPOS v2 `deriveDrawerTerms`, `packages/query/src/register-session/expected.ts:210-342`).
 * It applies `deriveExpected`'s filters, and `expected` is `deriveExpected`'s own result, so
 * `expected.cash` is float + cash sales − cash refunds + paid in − paid out, and each other
 * method's figure is its `otherTenders` amount. A refund counts once per method it touches.
 */
export function deriveDrawerTerms(input: Parameters<typeof deriveExpected>[0]): DrawerTerms {
  const { session, movements, ledgerRowsBySession, refunds } = input;
  const term = (): DrawerTerm => ({ amountMinor: 0, count: 0 });
  const add = (target: DrawerTerm, amountMinor: number) => {
    target.amountMinor += amountMinor;
    target.count += 1;
  };
  const [cashSales, cashRefunds, paidIn, paidOut] = [term(), term(), term(), term()];
  // A Map, so a `__proto__` method id never writes onto Object.prototype.
  const others = new Map<string, DrawerTerm>();
  const other = (method: string) => others.get(method) ?? others.set(method, term()).get(method)!;
  let noSales = 0;
  for (const row of ledgerRowsBySession) {
    if (row.session_id !== session.id || row.status !== 'captured') continue;
    const method = row.kind === 'cash' ? 'cash' : row.method_id;
    add(method === 'cash' ? cashSales : other(method), row.amountMinor);
  }
  const voids = new Set(movements.filter((row) => row.session_id === session.id && row.type === 'void').map((row) => row.voids));
  for (const row of movements) {
    if (row.session_id !== session.id || row.voided_by || voids.has(row.id)) continue;
    if (row.type === 'paid_in') add(paidIn, row.amountMinor);
    if (row.type === 'paid_out') add(paidOut, row.amountMinor);
    if (row.type === 'no_sale') noSales += 1;
  }
  for (const refund of refunds ?? []) {
    if (refund.status !== 'applied' || refund.sessionId !== session.id) continue;
    for (const [method, amount] of refundAmounts(refund)) {
      if (method === 'cash') add(cashRefunds, amount);
      else add(other(method), -amount);
    }
  }
  const otherTenders = Object.fromEntries(others);
  const otherMinor = Object.values(otherTenders).reduce((sum, row) => sum + row.amountMinor, 0);
  return {
    floatMinor: session.countedFloatMinor, cashSales, cashRefunds, paidIn, paidOut, noSales, otherTenders,
    sessionSalesMinor: cashSales.amountMinor - cashRefunds.amountMinor + otherMinor,
    expected: deriveExpected(input),
  };
}

type TillLeg = { id?: string; method: string; methodId?: string; amountMinor: number; storePaymentId?: string; sessionId?: string };
type TillOrder = { sessionId?: string; payments: readonly TillLeg[]; storeSettlement?: Pick<PosOrderStoreSettlement, 'kind' | 'state' | 'legs'> };

/**
 * Takings per payment method for one session, for the closure sheet: this till's captured payments (`countedTillPayments`) in
 * `sessionId`: a payment's own session, else its order's (S3), keyed by `legMethodId`'s kind plus id (`external:stripe`), with the number of
 * payments behind each. Local only, never synced: register rows and payloads keep `method_id: payment.method` (#256, ADR-070
 * decision 1). A leg with no methodId keys exactly as deriveDrawerTerms does (`cash` or its method); the figures sum to
 * deriveDrawerTerms' cash sales plus other tenders for the same orders. `extra` adds taken legs no order holds yet (S3: a
 * parked draft's `parkedTakenLegs`, the live sale's `registerView().takenLegs`), each counted only in its own `sessionId`; they are legs,
 * not `LedgerRow`s, because a row keeps no `methodId` to key by. Refunds and movements are not here: they are keyed
 * by the wire method. The map has no prototype, so a platform id such as `__proto__` or `toString` is a key like any other.
 */
export function takingsByMethod(
  orders: readonly TillOrder[], sessionId: string, extra: readonly TillLeg[] = [],
): Record<string, DrawerTerm> {
  const takings: Record<string, DrawerTerm> = Object.create(null);
  for (const order of [...orders, { payments: extra }] as readonly TillOrder[]) {
    for (const payment of countedTillPayments(order)) {
      if ((payment.sessionId ?? order.sessionId) !== sessionId) continue;
      const term = (takings[legMethodId(payment)] ??= { amountMinor: 0, count: 0 });
      term.amountMinor += payment.amountMinor;
      term.count += 1;
    }
  }
  return takings;
}
