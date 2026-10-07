/**
 * What the register should hold at close, per tender method: the session's cash float plus
 * captured payments and cash movements — never what the cashier counts. Port provenance
 * (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`.
 *
 * Refunds come from the till's applied `pos_refunds`, counted in the record's own `sessionId`
 * (ADR-080 amendment 1), by the server's rule. WCPOS's `attributeRefunds` fallbacks (allocations,
 * `refunded_amount`) are not ported: the store attributes each refund to a tender in `byMethod`.
 */
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
  const totals: Record<string, number> = { cash: session.countedFloatMinor };
  for (const row of ledgerRowsBySession) {
    if (row.session_id !== session.id || row.status !== 'captured') continue;
    const method = row.kind === 'cash' ? 'cash' : row.method_id;
    totals[method] = (totals[method] ?? 0) + row.amountMinor;
  }
  const voids = new Set(
    movements
      .filter((row) => row.session_id === session.id && row.type === 'void')
      .map((row) => row.voids),
  );
  for (const row of movements) {
    if (row.session_id !== session.id || row.voided_by || voids.has(row.id)) continue;
    if (row.type === 'paid_in') totals.cash += row.amountMinor;
    if (row.type === 'paid_out') totals.cash -= row.amountMinor;
  }
  for (const refund of refunds ?? []) {
    if (refund.status !== 'applied' || refund.sessionId !== session.id) continue;
    for (const [method, amount] of refundAmounts(refund)) totals[method] = (totals[method] ?? 0) - amount;
  }
  return totals;
}
