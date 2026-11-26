import type { PosOrderStoreSettlement } from './types';

/** The payments this till took: a locked store payment (storePaymentId set) is the store's earlier money (ADR-090 gate 11). */
export function tillPayments<P extends { storePaymentId?: string }>(payments: readonly P[]): P[] {
  return payments.filter((payment) => payment.storePaymentId === undefined);
}

export function settledAwayOnStore(order: { storeSettlement?: Pick<PosOrderStoreSettlement, 'kind' | 'state'> }): boolean {
  const settlement = order.storeSettlement;
  return (settlement?.kind === 'cancel' || settlement?.kind === 'reverse') && settlement.state === 'done';
}

/** #1380: follow the plugin's captured-only Z, leaving out cancelled sales and confirmed voids. */
export function countedTillPayments<P extends { id?: string; storePaymentId?: string }>(order: {
  payments: readonly P[]; storeSettlement?: Pick<PosOrderStoreSettlement, 'kind' | 'state' | 'legs'>;
}): P[] {
  const settlement = order.storeSettlement;
  if (settledAwayOnStore(order)) return [];
  const payments = tillPayments(order.payments);
  return settlement?.kind === 'reverse' ? payments.filter((payment) => !settlement.legs?.some((leg) => leg.done && leg.paymentId === payment.id)) : payments;
}
