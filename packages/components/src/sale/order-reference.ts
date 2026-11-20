/** The order reference a visitor sees on the receipt and in Orders (front desk ruling, 2026-10-06): the finalized
 * PosOrder id's last 8 characters, then the backend's display id once the store has one. */
export function orderReference(order: { id: string; serverRefs?: { displayId?: string } }): string {
  const local = order.id.slice(-8);
  return order.serverRefs?.displayId ? `${local} · #${order.serverRefs.displayId}` : local;
}

/** The receipt and Orders say this under a note that went below order.create 7 (ADR-083 condition 2). */
export const NOTE_NOT_SENT = "The customer note couldn't be sent to the store.";
/** Orders says these when a sale's tax ids or custom fields went below order.create 12 (ADR-092 condition 1). */
export const TAX_IDS_NOT_SENT = "The customer's tax IDs couldn't be sent to the store.";
export const META_NOT_SENT = "The order's custom fields couldn't be sent to the store.";
