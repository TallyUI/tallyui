/**
 * The legs whose beforeVoid is in flight, shared by every TenderLedger and CancelPaymentView (#1271): a second mounted
 * view, or a ledger remounted while the hook awaits, cannot run the hook again for the same leg. Keyed by order and leg.
 */
const inFlight = new Set<string>();
const keyOf = (orderId: string, legId: string) => `${orderId}\u0000${legId}`;

/** Holds the leg for one beforeVoid; false when another view already holds it. */
export function claimVoid(orderId: string, legId: string): boolean {
  const key = keyOf(orderId, legId);
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

/** Lets the leg go once its beforeVoid has settled. */
export function releaseVoid(orderId: string, legId: string): void {
  inFlight.delete(keyOf(orderId, legId));
}
