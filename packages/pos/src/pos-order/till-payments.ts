/** The payments this till took: a locked store payment (storePaymentId set) is the store's earlier money (ADR-090 gate 11). */
export function tillPayments<P extends { storePaymentId?: string }>(payments: readonly P[]): P[] {
  return payments.filter((payment) => payment.storePaymentId === undefined);
}
