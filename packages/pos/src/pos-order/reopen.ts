import type { RxCollection } from 'rxdb';
import { createOrderBuilder } from '../order/order-builder';
import { writeOrderDraft } from '../order/order-drafts';
import { readSession, type RegisterSessionCollection } from '../register/session-store';
import { readFresh } from '../rxdb';
import type { TaxContext } from '../tax/types';
import { customerRefusal } from './command';
import type { PosOrder } from './types';

export const REOPENABLE_CODES: readonly string[] = ['coupon_invalid', 'total_mismatch'];
export type ReopenRefusal = 'not_found' | 'not_rejected' | 'code_not_reopenable' | 'already_reopened' | 'session_closed';
export class ReopenRefusedOrderError extends Error {
  constructor(readonly orderId: string, readonly reason: ReopenRefusal) {
    super(`Cannot reopen order ${orderId}: ${reason}`);
    this.name = 'ReopenRefusedOrderError';
  }
}

export async function reopenRefusedOrder(orderId: string, deps: {
  orders: RxCollection<PosOrder>;
  drafts: RxCollection;
  sessions: RegisterSessionCollection;
  taxContext: TaxContext;
  /** The product's tax class from the catalogue (ProductTraits.getTaxClass); undefined falls back to 'standard'. */
  taxClassOf?: (productId: string, variantId?: string) => string | undefined;
  now?: () => Date;
}): Promise<string> {
  const [order] = await readFresh(deps.orders, { selector: { id: orderId } });
  if (!order) throw new ReopenRefusedOrderError(orderId, 'not_found');
  if (order.syncStatus !== 'rejected') throw new ReopenRefusedOrderError(orderId, 'not_rejected');
  if (!REOPENABLE_CODES.includes(order.error?.code ?? '')) throw new ReopenRefusedOrderError(orderId, 'code_not_reopenable');
  if (order.reopenedAt) throw new ReopenRefusedOrderError(orderId, 'already_reopened');
  if (order.sessionId) {
    const session = await readSession(deps.sessions, order.sessionId);
    if (!session || session.status === 'closed') throw new ReopenRefusedOrderError(orderId, 'session_closed');
  }
  const builder = createOrderBuilder({ currency: order.currency, taxContext: deps.taxContext, id: order.id });
  const converted = order.lines.some((line) => line.taxInclusive !== undefined && line.taxInclusive !== order.pricesIncludeTax);
  const display = order.display && (!converted || order.coupons) ? order.display : undefined;
  for (const [i, line] of order.lines.entries()) {
    const lineId = builder.addLine({
      productId: line.productId, variantId: line.variantId, name: line.name, sku: line.sku,
      unitPrice: { amount: line.unitPriceMinor, currency: order.currency, taxInclusive: line.taxInclusive },
      ...(line.regularUnitPriceMinor !== undefined ? { regularUnitPriceMinor: line.regularUnitPriceMinor } : {}),
      quantity: line.quantity,
      taxRates: line.taxLines.map(({ code, ratePpm }) => ({ code, ratePpm })),
      ...(line.custom ? { custom: true, taxClass: line.custom.taxClass, taxStatus: line.custom.taxStatus }
        : { taxClass: deps.taxClassOf?.(line.productId, line.variantId) ?? 'standard', taxStatus: line.taxStatus }),
    });
    if (display) {
      for (const row of display.lines[i].discounts) builder.applyLineDiscount(lineId, {
        type: 'fixed', value: row.amountMinor, ...(row.label !== undefined ? { label: row.label } : {}),
      });
    } else if (line.discountMinor > 0) {
      builder.applyLineDiscount(lineId, { type: 'fixed', value: line.discountMinor, label: 'Discount' });
    }
  }
  if (display && display.orderDiscountMinor > 0) {
    builder.applyOrderDiscount({ type: 'fixed', value: display.orderDiscountMinor, label: 'Discount' });
  }
  for (const fee of order.fees ?? []) builder.addFee({
    name: fee.name, amountMinor: fee.amountMinor,
    ...(fee.taxClass !== undefined ? { taxClass: fee.taxClass } : {}),
    ...(fee.taxStatus !== undefined ? { taxStatus: fee.taxStatus } : {}),
  });
  for (const shipping of order.shipping ?? []) builder.addShipping({
    name: shipping.name, amountMinor: shipping.amountMinor,
    ...(shipping.taxClass !== undefined ? { taxClass: shipping.taxClass } : {}),
    ...(shipping.taxStatus !== undefined ? { taxStatus: shipping.taxStatus } : {}),
    ...(shipping.methodId !== undefined ? { methodId: shipping.methodId } : {}),
  });
  for (const payment of order.payments) builder.addPayment({
    method: payment.method, amountMinor: payment.amountMinor,
    ...(payment.reference !== undefined ? { reference: payment.reference } : {}),
  });
  if (order.customer?.id && order.customer.name && customerRefusal(order.customer) === null) {
    builder.setCustomer({ id: order.customer.id, name: order.customer.name,
      ...(order.customer.email !== undefined ? { email: order.customer.email } : {}) });
  }
  const prefix = `Refused by the store: ${order.error!.message}`;
  builder.setNote(prefix + (order.note ? '\n' + order.note : ''));
  const draftId = await writeOrderDraft(deps.drafts, builder.getSnapshot());
  const document = await deps.orders.findOne(orderId).exec();
  await document!.incrementalModify((data) => {
    if (data.syncStatus === 'rejected' && !data.reopenedAt) {
      data.reopenedAt = data.updatedAt = (deps.now?.() ?? new Date()).toISOString();
    }
    return data;
  });
  return draftId;
}
