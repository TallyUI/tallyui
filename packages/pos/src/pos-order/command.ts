import type { OrderCreateEnvelope } from '@tallyui/core';
import type { PosOrder } from './types';

export class UnsupportedOrderVersionError extends Error {
  readonly code = 'UNSUPPORTED_ORDER_VERSION';
  constructor(readonly needed: number, readonly supported: number) {
    super(`This sale needs order.create version ${needed}; the server supports up to ${supported}.`);
    this.name = 'UnsupportedOrderVersionError';
  }
}

/**
 * `@tallyui/core/server`'s `payloadShapeErrors` bound, in UTF-16 code units (`String.length`), on
 * every order.create string but `customer.email` (254), `customerId` (64) and `sessionId` (36).
 */
export const PAYLOAD_STRING_MAX = 255;

/** Display text as sent: NUL stripped, and over the bound cut to 254 units plus '…', never inside a surrogate pair. */
function sendText(text: string): string {
  const clean = text.replaceAll('\u0000', '');
  if (clean.length <= PAYLOAD_STRING_MAX) return clean;
  const high = clean.charCodeAt(PAYLOAD_STRING_MAX - 2);
  return `${clean.slice(0, high >= 0xd800 && high <= 0xdbff ? PAYLOAD_STRING_MAX - 2 : PAYLOAD_STRING_MAX - 1)}…`;
}

/**
 * Builds the ADR-038 order.create envelope for a PosOrder. The names it sends (line titles and v3 discount labels)
 * go through `sendText`; the stored order keeps them whole. The ids it sends are minted by `finalizeOrder` (UUIDv7),
 * which also refuses an over-long or NUL pass-through reference, so neither is clamped here.
 * ADR-065's figures make version 3; otherwise a discounted order is version 2 (ADR-062), else version 1, byte-identical.
 */
export function toOrderCreateEnvelope(order: PosOrder, deviceId: string, attempt = 1,
  options?: { maxVersion?: number }): OrderCreateEnvelope {
  // The order's discount is the sum of its lines', so the payload's two always agree.
  const discountMinor = order.lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const contentVersion = order.display && order.taxByRate ? 3 : discountMinor > 0 ? 2 : 1;
  const cap = options?.maxVersion === undefined ? order.sentVersion : Math.min(options.maxVersion, order.sentVersion ?? options.maxVersion);
  if (discountMinor > 0 && cap !== undefined && cap < 2) throw new UnsupportedOrderVersionError(2, cap);
  const version = Math.min(contentVersion, cap ?? contentVersion) as 1 | 2 | 3;
  const email = order.customer?.email;
  const id = order.customer?.id;
  const customerId = typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : undefined;
  const sessionId = order.sessionId ?? order.lateSessionId;
  return {
    id: order.commandId, type: 'order.create', version, createdAt: order.createdAt, deviceId, attempt,
    payload: {
      clientOrderId: order.id, createdAt: order.createdAt, currency: order.currency, pricesIncludeTax: order.pricesIncludeTax,
      lines: order.lines.map((line) => ({
        clientLineId: line.id, variantId: line.variantId ?? line.productId, title: sendText(line.name),
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
          clientLineId: lineId, amountMinor,
          discounts: discounts.map((discount) => discount.label === undefined ? discount : { ...discount, label: sendText(discount.label) }),
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
      ...(version === 3 && typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 36 ? { sessionId } : {}),
    },
  };
}
