import type { RxCollection } from 'rxdb';
import type { PosOrder } from './types';

/**
 * Marks the order `orderId` handled for its current `commandId`, so `needsAttention` leaves it out until a requeue
 * mints a new one (ADR-092 6f, tally-woo 03). Resolves to true when the order is stamped (or already was, for this
 * commandId); false, with nothing changed, when the id is unknown or the order is pending (still the outbox's to settle).
 */
export async function markAttentionHandled(orders: RxCollection<PosOrder>, orderId: string, now?: () => Date): Promise<boolean> {
  const doc = await orders.findOne(orderId).exec();
  if (!doc) return false;
  let stamped = false;
  // pos_orders is till-local, never pulled from a store, so this write breaks no replication rule (ADR-092 6f).
  // Decide on the stored state, as discard() does: a requeue that won the race leaves its pending order unstamped.
  await doc.incrementalModify((data) => {
    // The modifier runs again on a write conflict, so it decides on each run.
    stamped = data.syncStatus !== 'pending';
    if (!stamped || data.attentionHandledFor === data.commandId) return data;
    data.attentionHandledFor = data.commandId;
    data.updatedAt = (now?.() ?? new Date()).toISOString();
    return data;
  });
  return stamped;
}
