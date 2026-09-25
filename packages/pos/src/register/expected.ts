/**
 * What the register should hold at close, per tender method: the session's cash float plus
 * captured payments and cash movements — never what the cashier counts. Port provenance
 * (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`.
 *
 * **Refund attribution is deferred.** WCPOS's `attributeRefunds` debits a session's drawer for
 * refunds processed against its captured payments (by stamped session, then by a legacy
 * `refunded_amount` fallback). TallyUI has no refund model yet (ADR-032 amendment 1), so
 * `deriveExpected` covers only the float, the session's captured payment rows, and its
 * paid-in/paid-out cash movements under WCPOS's void rules.
 */

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
 * paid-in/paid-out movements.
 *
 * A movement is excluded when its own `voided_by` is set, or when a `type: 'void'` row's
 * `voids` names its id; the `void` row itself carries no amount of its own.
 */
export function deriveExpected({
  session,
  movements,
  ledgerRowsBySession,
}: {
  session: { id: string; countedFloatMinor: number };
  movements: readonly Movement[];
  ledgerRowsBySession: readonly LedgerRow[];
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
  return totals;
}
