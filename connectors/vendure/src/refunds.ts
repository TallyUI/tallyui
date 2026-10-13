import type { VendureOrder } from './orders';

export interface VendureRefundableLine {
  orderLineId: string;
  quantity: number; // The line's current quantity.
  refundedQuantity: number; // Sum of its refund lines over refunds not Failed.
  cancelledQuantity: number; // max(0, orderPlacedQuantity - quantity).
  refundableQuantity: number; // max(0, quantity - refundedQuantity).
  /** @deprecated For display only; a refund's amount is vendureLineRefundWithTax. */
  unitRefundWithTax: number; // The line's proratedUnitPriceWithTax, for display. Never multiply it by a quantity: use vendureLineRefundWithTax.
  lineTotalWithTax: number; // The line's proratedLinePriceWithTax.
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
        lineTotalWithTax: Number.isFinite(line.proratedLinePriceWithTax) ? line.proratedLinePriceWithTax : 0,
      };
    }),
    shippingWithTax: Math.max(0, (Number.isFinite(order.shippingWithTax) ? order.shippingWithTax : 0) - refundedShipping),
    moneyWithTax,
  };
}

/**
 * The amount, with tax, of refunding `quantity` more units of a line: its cumulative share of the line total
 * (vendurepos ADR 0007, decision 4.9), the plugin's own rule for `amount_mismatch`. Refunding every refundable unit
 * returns what is left of `lineTotalWithTax`, and partial refunds add up to it.
 */
export function vendureLineRefundWithTax(line: VendureRefundableLine, quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > line.refundableQuantity) {
    throw new RangeError(`Line ${line.orderLineId}: quantity ${quantity} must be a whole number from 1 to refundable quantity ${line.refundableQuantity}`);
  }
  const N = line.quantity;
  const T = line.lineTotalWithTax;
  const r = line.refundedQuantity;
  return Math.round(((r + quantity) * T) / N) - Math.round((r * T) / N);
}
