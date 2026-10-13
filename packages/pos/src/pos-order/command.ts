import type { OrderCreateEnvelope } from '@tallyui/core';
import { MICROS_PER_MINOR, roundMicrosToMinor, taxMicros } from '../tax/exact';
import type { PosOrder, PosOrderLine } from './types';

/** The highest order.create version this till sends; pos_orders' sentVersion and downgradedFrom maxima must equal it. */
export const ORDER_CREATE_MAX_VERSION = 6 as const;

export class UnsupportedOrderVersionError extends Error {
  readonly code = 'UNSUPPORTED_ORDER_VERSION';
  constructor(readonly needed: number, readonly supported: number) {
    super(`This sale needs order.create version ${needed}; the server supports up to ${supported}.`);
    this.name = 'UnsupportedOrderVersionError';
  }
}

/**
 * `@tallyui/core/server`'s `payloadBoundErrors` bound, in UTF-16 code units (`String.length`), on
 * every order.create string but `customer.email` (254), `customerId` (64) and `sessionId` (36).
 */
export const PAYLOAD_STRING_MAX = 255;

/** A non-empty string of at most `max` UTF-16 units with no NUL: what order.create's shape check accepts. */
export const sendable = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\u0000');

/**
 * Why a customer (picked from a search, or restored from a parked order) can't go on a sale, or null: its email
 * (over 254 units, or a NUL) or its id (over 64, or a NUL) would be refused by order.create's shape check.
 */
export function customerRefusal(customer: { id?: string; email?: string }): string | null {
  return customer.email !== undefined && customer.email !== '' && !sendable(customer.email, 254) ? CUSTOMER_REFUSALS[0]
    : customer.id !== undefined && customer.id !== '' && !sendable(customer.id, 64) ? CUSTOMER_REFUSALS[1] : null;
}
/** Every message `customerRefusal` returns (email, then id). */
export const CUSTOMER_REFUSALS = (['email', 'id'] as const)
  .map((field) => `This customer's ${field} can't be sent to the store, so they weren't added to the sale.`);

/** Text with NUL stripped, and over `max` UTF-16 units cut to `max - 1` plus '…', never inside a surrogate pair. */
export function cutText(text: string, max: number): string {
  const clean = text.replaceAll('\u0000', '');
  if (clean.length <= max) return clean;
  const high = clean.charCodeAt(max - 2);
  return `${clean.slice(0, high >= 0xd800 && high <= 0xdbff ? max - 2 : max - 1)}…`;
}

/**
 * Version 4 (#286): a line's discount made tax-exclusive. An exclusive line's is unchanged; an inclusive line's
 * gross discount D on its amount A becomes `net(A) − net(A − D)`, exact in millionths (net(A − D) from its stored
 * taxLines, the tax on A − D; net(A) from `taxMicros`, as the builder taxes), rounded half away from zero.
 */
function netDiscountMinor(line: PosOrderLine, pricesIncludeTax: boolean): number {
  if (!(line.taxInclusive ?? pricesIncludeTax) || line.discountMinor === 0) return line.discountMinor;
  const ratePpm = line.taxLines.reduce((sum, tax) => sum + tax.ratePpm, 0);
  const taxAfter = line.taxLines.reduce((sum, tax) => sum + BigInt(tax.taxMicros), 0n);
  const taxBefore = taxMicros(line.unitPriceMinor * line.quantity, ratePpm, true);
  return roundMicrosToMinor(BigInt(line.discountMinor) * MICROS_PER_MINOR - taxBefore + taxAfter);
}

/**
 * The order.create version an order's stored content makes: 3 with ADR-065's figures, else 2 when its lines are
 * discounted (ADR-062), else 1; fees, shipping or custom lines need 5; coupons need 6. Also used by pos_orders v5's migration.
 */
export function contentVersion(order: Pick<PosOrder, 'display' | 'taxByRate' | 'lines' | 'fees' | 'shipping' | 'coupons'>): 1 | 2 | 3 | 5 | 6 {
  if (order.coupons?.length) return 6;
  if (order.fees?.length || order.shipping?.length || order.lines.some((line) => line.custom)) return 5;
  return order.display && order.taxByRate ? 3 : order.lines.reduce((sum, line) => sum + line.discountMinor, 0) > 0 ? 2 : 1;
}

/**
 * Builds the ADR-038 order.create envelope for a PosOrder. It sends the stored order unchanged, so every resend of
 * an order is byte-identical, and an order stored by an older till goes out exactly as that till sent it:
 * `finalizeOrder` freezes the sent form (names and labels cut, an unsendable customer email or id left out).
 * ADR-065's figures make version 3; otherwise a discounted order is version 2 (ADR-062), else version 1, byte-identical.
 * A version-3 order goes as version 4 (#286) only when `maxVersion` is at least 4 and its `sentVersion` doesn't cap it.
 * Coupon orders need version 6, carrying coupons, stored regular prices, line attributes and receipt coupons.
 */
export function toOrderCreateEnvelope(order: PosOrder, deviceId: string, attempt = 1,
  options?: { maxVersion?: number }): OrderCreateEnvelope {
  const grossMinor = order.lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const content = contentVersion(order);
  const cap = options?.maxVersion === undefined ? order.sentVersion : Math.min(options.maxVersion, order.sentVersion ?? options.maxVersion);
  if (content === 5 && cap !== undefined && cap < 5) throw new UnsupportedOrderVersionError(5, cap);
  if (content === 6 && cap !== undefined && cap < 6) throw new UnsupportedOrderVersionError(6, cap);
  if (grossMinor > 0 && cap !== undefined && cap < 2) throw new UnsupportedOrderVersionError(2, cap);
  // Version 4 only when the cap allows it (the server advertises 4, and no sentVersion holds the order lower).
  const version = (content === 3 && cap !== undefined && cap >= 4 ? 4
    : Math.min(content, cap ?? content)) as OrderCreateEnvelope['version'];
  const lineDiscounts = order.lines.map((line) => version >= 4 ? netDiscountMinor(line, order.pricesIncludeTax) : line.discountMinor);
  // The order's discount is the sum of its lines', on one basis, so the payload's two always agree.
  const discountMinor = lineDiscounts.reduce((sum, discount) => sum + discount, 0);
  const email = order.customer?.email;
  const id = order.customer?.id;
  // These are the pre-#222 customerId and sessionId checks, kept byte-exact so stored orders resend older tills' bytes; don't replace with sendable.
  const customerId = typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : undefined;
  const sessionId = order.sessionId ?? order.lateSessionId;
  const { fees: _fees, shipping: _shipping, coupons: _coupons, ...storedDisplay } = { ...order.display! };
  return {
    id: order.commandId, type: 'order.create', version, createdAt: order.createdAt, deviceId, attempt,
    payload: {
      clientOrderId: order.id, createdAt: order.createdAt, currency: order.currency, pricesIncludeTax: order.pricesIncludeTax,
      lines: order.lines.map((line, i) => ({
        clientLineId: line.id, ...(line.custom ? { custom: { ...line.custom } } : { variantId: line.variantId ?? line.productId }), title: line.name,
        quantity: line.quantity, unitPriceMinor: line.unitPriceMinor,
        ...(line.taxInclusive !== undefined ? { taxInclusive: line.taxInclusive } : {}),
        ...(lineDiscounts[i] > 0 ? { discountMinor: lineDiscounts[i] } : {}),
        ...(version === 6 && line.regularUnitPriceMinor !== undefined ? { regularUnitPriceMinor: line.regularUnitPriceMinor } : {}),
        ...(version === 6 && line.attributes && Object.keys(line.attributes).length ? { attributes: { ...line.attributes } } : {}),
      })),
      ...(version >= 5 && order.fees?.length ? { fees: order.fees.map((fee) => ({
        clientFeeId: fee.id, name: fee.name, amountMinor: fee.amountMinor, taxStatus: fee.taxStatus,
        ...(fee.taxClass !== undefined ? { taxClass: fee.taxClass } : {}), taxMinor: roundMicrosToMinor(BigInt(fee.taxMicros)),
      })) } : {}),
      ...(version >= 5 && order.shipping?.length ? { shipping: order.shipping.map((charge) => ({
        clientShippingId: charge.id, name: charge.name, ...(charge.methodId !== undefined ? { methodId: charge.methodId } : {}),
        amountMinor: charge.amountMinor, taxStatus: charge.taxStatus,
        ...(charge.taxClass !== undefined ? { taxClass: charge.taxClass } : {}), taxMinor: roundMicrosToMinor(BigInt(charge.taxMicros)),
      })) } : {}),
      ...(version === 6 ? { coupons: order.coupons!.map(({ code, couponId, discountMinor, discountTaxMinor }) => ({
        code, couponId, discountMinor, discountTaxMinor,
      })) } : {}),
      payments: order.payments.map((payment) => ({
        clientPaymentId: payment.id, method: payment.method, amountMinor: payment.amountMinor,
        ...(payment.tenderedMinor !== undefined ? { tenderedMinor: payment.tenderedMinor } : {}),
        ...(payment.changeMinor !== undefined ? { changeMinor: payment.changeMinor } : {}),
        ...(payment.reference !== undefined ? { reference: payment.reference } : {}),
      })),
      subtotalMinor: order.subtotalMinor,
      ...(discountMinor > 0 ? { discountMinor } : {}),
      taxMinor: order.taxMinor, totalMinor: order.totalMinor,
      ...(version >= 3 ? {
        display: { ...storedDisplay, lines: order.display!.lines.map(({ lineId, amountMinor, discounts }) => ({
          clientLineId: lineId, amountMinor, discounts,
        })),
        ...(version >= 5 && order.display!.fees ? { fees: order.display!.fees.map(({ id, amountMinor }) => ({ clientFeeId: id, amountMinor })) } : {}),
        ...(version >= 5 && order.display!.shipping ? { shipping: order.display!.shipping.map(({ id, amountMinor }) => ({ clientShippingId: id, amountMinor })) } : {}),
        ...(version === 6 && order.display!.coupons ? { coupons: order.display!.coupons.map(({ code, amountMinor }) => ({ code, amountMinor })) } : {}),
        },
        taxByRate: order.taxByRate!.map(({ ratePpm, code, netMinor, amountMinor, grossMinor }) => ({
          ratePpm, ...(code !== undefined ? { code } : {}), netMinor, taxMinor: amountMinor, grossMinor,
        })),
      } : {}),
      customer: version >= 3
        ? (email || customerId ? { ...(email ? { email } : {}), ...(customerId ? { customerId } : {}) } : null)
        : (email ? { email } : null),
      ...(order.registerId !== undefined ? { registerId: order.registerId } : {}),
      ...(order.cashierRef !== undefined ? { cashierRef: order.cashierRef } : {}),
      ...(version >= 3 && typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 36 ? { sessionId } : {}),
    },
  };
}
