import type { CommandEnvelope, OrderCreatePayload } from '@tallyui/core';
import type { PosOrder } from './types';

/**
 * Builds the ADR-038 order.create envelope for a PosOrder.
 * ADR-065's figures make version 3; otherwise a discounted order is version 2 (ADR-062), else version 1, byte-identical.
 */
export function toOrderCreateEnvelope(order: PosOrder, deviceId: string, attempt = 1): CommandEnvelope<OrderCreatePayload> {
  // The order's discount is the sum of its lines', so the payload's two always agree.
  const discountMinor = order.lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const version = order.display && order.taxByRate ? 3 : discountMinor > 0 ? 2 : 1;
  const email = order.customer?.email;
  const id = order.customer?.id;
  const customerId = typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : undefined;
  const sessionId = order.sessionId ?? order.lateSessionId;
  return {
    id: order.commandId, type: 'order.create', version, createdAt: order.createdAt, deviceId, attempt,
    payload: {
      clientOrderId: order.id, createdAt: order.createdAt, currency: order.currency, pricesIncludeTax: order.pricesIncludeTax,
      lines: order.lines.map((line) => ({
        clientLineId: line.id, variantId: line.variantId ?? line.productId, title: line.name,
        quantity: line.quantity, unitPriceMinor: line.unitPriceMinor,
        ...(line.taxInclusive !== undefined ? { taxInclusive: line.taxInclusive } : {}),
        ...(line.discountMinor > 0 ? { discountMinor: line.discountMinor } : {}),
      })),
      payments: order.payments.map((payment) => ({
        clientPaymentId: payment.id, method: payment.method, amountMinor: payment.amountMinor,
        ...(payment.tenderedMinor !== undefined ? { tenderedMinor: payment.tenderedMinor } : {}),
        ...(payment.changeMinor !== undefined ? { changeMinor: payment.changeMinor } : {}),
        ...(payment.reference !== undefined ? { reference: payment.reference } : {}),
      })),
      subtotalMinor: order.subtotalMinor,
      ...(discountMinor > 0 ? { discountMinor } : {}),
      taxMinor: order.taxMinor, totalMinor: order.totalMinor,
      ...(version === 3 ? {
        display: { ...order.display!, lines: order.display!.lines.map(({ lineId, amountMinor, discounts }) => ({
          clientLineId: lineId, amountMinor, discounts,
        })) },
        taxByRate: order.taxByRate!.map(({ ratePpm, code, netMinor, amountMinor, grossMinor }) => ({
          ratePpm, ...(code !== undefined ? { code } : {}), netMinor, taxMinor: amountMinor, grossMinor,
        })),
      } : {}),
      customer: version === 3
        ? (email || customerId ? { ...(email ? { email } : {}), ...(customerId ? { customerId } : {}) } : null)
        : (email ? { email } : null),
      ...(order.registerId !== undefined ? { registerId: order.registerId } : {}),
      ...(order.cashierRef !== undefined ? { cashierRef: order.cashierRef } : {}),
      ...(version === 3 && sessionId !== undefined ? { sessionId } : {}),
    },
  };
}
