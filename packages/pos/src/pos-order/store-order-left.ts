import type { PosOrder } from './types';

/**
 * The store order a refused sale left behind (#1101): a value only for a rejected order with no `storeOrderId` whose
 * `error.data.orderId` is a non-empty string, as a transport that created the order before refusing the sale sets it.
 * `reference` is `data.displayId` when a non-empty string, else `orderId`. `recordedMinor` sums the first
 * `data.recorded` payments (a safe integer above 0; anything else counts as 0): what the store had recorded at the
 * refusal, not the order's state now.
 */
export function storeOrderLeft(order: Pick<PosOrder, 'syncStatus' | 'storeOrderId' | 'error' | 'payments'>):
  { orderId: string; reference: string; recordedMinor: number } | undefined {
  const data = order.error?.data;
  if (order.syncStatus !== 'rejected' || order.storeOrderId !== undefined || typeof data?.orderId !== 'string' || !data.orderId) return undefined;
  const { orderId, displayId, recorded } = data;
  const count = Number.isSafeInteger(recorded) && (recorded as number) > 0 ? recorded as number : 0;
  return {
    orderId,
    reference: typeof displayId === 'string' && displayId ? displayId : orderId,
    recordedMinor: order.payments.slice(0, count).reduce((sum, payment) => sum + payment.amountMinor, 0),
  };
}
