import type { Order } from '../order/types';
import type { PosOrder, PosOrderPayment } from './types';
import { uuidv7 } from './uuidv7';

export interface FinalizeOptions {
  registerId?: string;
  cashierRef?: string;
  now?: Date;
  newId?: () => string;
}

/** Turns a fully paid builder Order into a pending PosOrder without mutating it. */
export function finalizeOrder(order: Order, options: FinalizeOptions = {}): PosOrder {
  if (!order.lineItems.length) throw new Error('finalize: no lines');
  if (order.discountMinor > 0) throw new Error('finalize: discounts not supported yet');
  for (const payment of order.payments) {
    if (payment.method !== 'cash' && payment.method !== 'external') {
      throw new Error(`finalize: unsupported payment method ${payment.method}`);
    }
  }
  if (order.paidMinor < order.totalMinor) throw new Error('finalize: underpaid');
  let change = order.paidMinor - order.totalMinor;
  const cash = order.payments.reduce((sum, p) => sum + (p.method === 'cash' ? p.amountMinor : 0), 0);
  if (change > cash) throw new Error('finalize: change exceeds cash');
  const newId = options.newId ?? uuidv7;
  const id = newId();
  const lines = order.lineItems.map((line) => ({
    id: newId(), productId: line.productId,
    ...(line.variantId !== undefined ? { variantId: line.variantId } : {}),
    name: line.name, sku: line.sku, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor,
    discountMinor: line.discountMinor, netMinor: line.netMinor,
    taxLines: line.taxLines.map((tax) => ({ ...tax })),
    ...(line.priceTaxModeConverted ? { taxInclusive: line.taxInclusive } : {}),
  }));
  const payments: PosOrderPayment[] = order.payments.map((payment) => ({
    id: newId(), method: payment.method as PosOrderPayment['method'], amountMinor: payment.amountMinor,
    ...(payment.reference !== undefined ? { reference: payment.reference } : {}),
  }));
  for (let i = payments.length - 1; i >= 0; i--) {
    const payment = payments[i];
    if (payment.method !== 'cash') continue;
    payment.tenderedMinor = payment.amountMinor;
    payment.changeMinor = Math.min(change, payment.tenderedMinor);
    payment.amountMinor -= payment.changeMinor;
    change -= payment.changeMinor;
  }
  if (payments.reduce((sum, p) => sum + p.amountMinor, 0) !== order.totalMinor) {
    throw new Error('finalize: payments do not reconcile');
  }
  const now = (options.now ?? new Date()).toISOString();
  return {
    id, createdAt: now, updatedAt: now, commandId: newId(), syncStatus: 'pending',
    currency: order.currency, pricesIncludeTax: order.pricesIncludeTax, lines, payments,
    subtotalMinor: order.subtotalMinor, discountMinor: order.discountMinor,
    taxMinor: order.taxMinor, totalMinor: order.totalMinor,
    customer: order.customer ? { id: order.customer.id, name: order.customer.name,
      ...(order.customer.email !== undefined ? { email: order.customer.email } : {}) } : null,
    ...(order.note ? { note: order.note } : {}),
    ...(options.registerId !== undefined ? { registerId: options.registerId } : {}),
    ...(options.cashierRef !== undefined ? { cashierRef: options.cashierRef } : {}),
  };
}
