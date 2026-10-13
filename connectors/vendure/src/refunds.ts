import type { VendureOrder } from './orders';

export interface VendureRefundableLine {
  orderLineId: string;
  quantity: number; // The line's current quantity.
  refundedQuantity: number; // Sum of its refund lines over refunds not Failed.
  cancelledQuantity: number; // max(0, orderPlacedQuantity - quantity).
  refundableQuantity: number; // max(0, quantity - refundedQuantity).
  unitRefundWithTax: number; // The line's proratedUnitPriceWithTax.
}

export interface VendureRefundable {
  lines: VendureRefundableLine[]; // In the order's line order, one per line.
  shippingWithTax: number; // max(0, order.shippingWithTax - shipping refunded over refunds not Failed).
  moneyWithTax: number; // Sum over Settled payments of max(0, amount - refunds' total not Failed).
}

/**
 * What the form may offer, from the order alone. Pending refunds count as refunded.
 * The plugin is authoritative (`quantity_exceeds`, `amount_mismatch`).
 * Amounts are Vendure's minor units with tax.
 */
export function vendureRefundable(order: Pick<VendureOrder, 'lines' | 'shippingWithTax' | 'payments'>): VendureRefundable {
  const refundedQuantities = new Map<string, number>();
  let refundedShipping = 0;
  let moneyWithTax = 0;
  for (const payment of order.payments ?? []) {
    let refundedTotal = 0;
    for (const refund of payment.refunds ?? []) {
      if (refund.state === 'Failed') continue;
      refundedTotal += Number.isFinite(refund.total) ? refund.total : 0;
      refundedShipping += Number.isFinite(refund.shipping) ? refund.shipping : 0;
      for (const line of refund.lines ?? []) {
        refundedQuantities.set(line.orderLineId, (refundedQuantities.get(line.orderLineId) ?? 0)
          + (Number.isFinite(line.quantity) ? line.quantity : 0));
      }
    }
    if (payment.state === 'Settled') {
      moneyWithTax += Math.max(0, (Number.isFinite(payment.amount) ? payment.amount : 0) - refundedTotal);
    }
  }
  return {
    lines: (order.lines ?? []).map(line => {
      const quantity = Number.isFinite(line.quantity) ? line.quantity : 0;
      const refundedQuantity = refundedQuantities.get(line.id) ?? 0;
      return {
        orderLineId: line.id,
        quantity,
        refundedQuantity,
        cancelledQuantity: Number.isFinite(line.orderPlacedQuantity) ? Math.max(0, line.orderPlacedQuantity - quantity) : 0,
        refundableQuantity: Math.max(0, quantity - refundedQuantity),
        unitRefundWithTax: Number.isFinite(line.proratedUnitPriceWithTax) ? line.proratedUnitPriceWithTax : 0,
      };
    }),
    shippingWithTax: Math.max(0, (Number.isFinite(order.shippingWithTax) ? order.shippingWithTax : 0) - refundedShipping),
    moneyWithTax,
  };
}
