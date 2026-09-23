import type { CommandEnvelope, OrderCreatePayload } from '@tallyui/core';
import type { PosOrder } from './types';

/** Builds the ADR-038 order.create envelope for a PosOrder. */
export function toOrderCreateEnvelope(order: PosOrder, deviceId: string, attempt = 1): CommandEnvelope<OrderCreatePayload> {
  return {
    id: order.commandId, type: 'order.create', version: 1, createdAt: order.createdAt, deviceId, attempt,
    payload: {
      clientOrderId: order.id, createdAt: order.createdAt, currency: order.currency, pricesIncludeTax: order.pricesIncludeTax,
      lines: order.lines.map((line) => ({
        clientLineId: line.id, variantId: line.variantId ?? line.productId, title: line.name,
        quantity: line.quantity, unitPriceMinor: line.unitPriceMinor,
      })),
      payments: order.payments.map((payment) => ({
        clientPaymentId: payment.id, method: payment.method, amountMinor: payment.amountMinor,
        ...(payment.tenderedMinor !== undefined ? { tenderedMinor: payment.tenderedMinor } : {}),
        ...(payment.changeMinor !== undefined ? { changeMinor: payment.changeMinor } : {}),
        ...(payment.reference !== undefined ? { reference: payment.reference } : {}),
      })),
      subtotalMinor: order.subtotalMinor, taxMinor: order.taxMinor, totalMinor: order.totalMinor,
      customer: order.customer?.email ? { email: order.customer.email } : null,
      ...(order.registerId !== undefined ? { registerId: order.registerId } : {}),
      ...(order.cashierRef !== undefined ? { cashierRef: order.cashierRef } : {}),
    },
  };
}
