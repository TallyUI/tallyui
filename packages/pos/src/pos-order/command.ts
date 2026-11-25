import { ORDER_META_KEY_MAX, ORDER_META_MAX, ORDER_NOTE_MAX, ORDER_TAX_ID_TYPE_MAX, ORDER_TAX_ID_VALUE_MAX, ORDER_TAX_IDS_MAX } from '@tallyui/core';
import type { OrderCreateEnvelope, OrderCreateMeta, OrderCreatePayload, OrderCreateTaxId, OrderUpdateEnvelope, OrderUpdatePayload } from '@tallyui/core';
import { MICROS_PER_MINOR, roundMicrosToMinor, taxMicros } from '../tax/exact';
import { woocommerceChargeTaxMinor, woocommerceLine } from '../order/woocommerce-tax';
import type { LineTaxLine } from '../order/types';
import type { PosOrder, PosOrderLine } from './types';

/** The highest order.create version this till sends; pos_orders' sentVersion and downgradedFrom maxima must equal it. */
export const ORDER_CREATE_MAX_VERSION = 12 as const;
/** order.create 10 (ruling A, 2026-11-18) is 9 plus each payment's `methodId`, the payment method's own id on the platform. */
export const PAYMENT_METHOD_ID_ORDER_CREATE_VERSION = 10 as const;
/** order.create 11 (ADR-086 d2, amended 2026-11-19) is 10 plus the customer's addresses on a sale not taxed by address, as informational fields. */
export const UNTAXED_ADDRESS_ORDER_CREATE_VERSION = 11 as const;
/** order.create 12 (ADR-092) is 11 plus the customer's tax ids, a catalogue line's edited SKU and order meta, as informational fields. */
export const INFORMATIONAL_EXTRAS_ORDER_CREATE_VERSION = 12 as const;
/** order.create 8 (#722) tells the server which customer address the sale was taxed on (`taxAddress`) and carries the
 *  addresses; below it a server taxes on the store's base, so `saleTaxContexts` re-taxes by address only from here. */
export const TAX_ADDRESS_ORDER_CREATE_VERSION = 8 as const;

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

/** A store revision's bound (ADR-090): an opaque token, e.g. WooCommerce's 71-character `sha256:` + 64 hex. One number for core's order.reopen and order.update shapes, the rebuild and pos_orders. */
export const REVISION_MAX = 128;

/** order.update's lowest order.create version (ADR-090, desk Q1 2026-11-17): fees and shipping travel from 5, so an update never drops the store's. */
const ORDER_UPDATE_MIN_CREATE_VERSION = 5;

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

// What order.create 12's shape check accepts (order-payload-shape.ts); a bad entry is dropped, not sent, so one bad extra never holds the sale (desk, F1054-1).
export function sendableTaxIds(taxIds: readonly OrderCreateTaxId[] | undefined): OrderCreateTaxId[] {
  return (taxIds ?? []).flatMap(({ type, value, country }) => {
    const id = { type: cutText(type, ORDER_TAX_ID_TYPE_MAX), value: cutText(value, ORDER_TAX_ID_VALUE_MAX) };
    const code = country?.toUpperCase();
    return id.type && id.value ? [{ ...id, ...(code !== undefined && /^[A-Z]{2}$/.test(code) ? { country: code } : {}) }] : [];
  }).slice(0, ORDER_TAX_IDS_MAX);
}
export function sendableMeta(meta: readonly OrderCreateMeta[] | undefined): OrderCreateMeta[] {
  const kept = new Set<string>();
  return (meta ?? []).flatMap((entry) => {
    const key = cutText(entry.key, ORDER_META_KEY_MAX);
    if (!key || key.startsWith('_') || kept.has(key)) return [];
    kept.add(key);
    return [{ key, value: cutText(entry.value, ORDER_NOTE_MAX) }];
  }).slice(0, ORDER_META_MAX);
}
export const editedSku = (line: PosOrderLine) => !line.custom && line.catalogueSku !== undefined && line.sku !== '' && line.sku !== line.catalogueSku;

/**
 * Version 4 (#286): a line's discount made tax-exclusive. An exclusive line's is unchanged; an inclusive line's
 * gross discount D on its amount A becomes `net(A) − net(A − D)`, exact in millionths, rounded half away from zero.
 * A Woo-rounded line with a coupon or a compound rate takes both nets from `woocommerceLine` at its stored rates (#1342):
 * its stored taxLines are after the coupon. Otherwise tax comes from stored taxLines after D, recomputed before a
 * store-priced coupon, and from `taxMicros` before D.
 */
function netDiscountMinor(line: PosOrderLine, order: Pick<PosOrder, 'pricesIncludeTax' | 'taxRounding' | 'coupons' | 'currency'>): number {
  if (!(line.taxInclusive ?? order.pricesIncludeTax) || line.discountMinor === 0) return line.discountMinor;
  const woocommerce = order.taxRounding?.granularity === 'woocommerce', stored: readonly LineTaxLine[] = line.taxLines;
  const afterDiscount = line.unitPriceMinor * line.quantity - line.discountMinor;
  if (woocommerce && (order.coupons?.length || stored.some((tax) => tax.compound))) {
    const rates = stored.map((tax, i) => ({ id: i, code: tax.code ?? '', label: '', rate: (tax.ratePpm / 10000).toFixed(4),
      priority: i, compound: tax.compound ?? false, shipping: true }));
    // Only netMicros is read: the net before any coupon, which roundAtSubtotal does not change.
    const net = (minor: number) => BigInt(woocommerceLine(minor, rates, true, order.currency, false).netMicros);
    return roundMicrosToMinor(net(line.unitPriceMinor * line.quantity) - net(afterDiscount));
  }
  const ratePpm = line.taxLines.reduce((sum, tax) => sum + tax.ratePpm, 0);
  // A store-priced coupon leaves stored taxLines after the coupon; the line discount needs tax before it.
  const taxAfter = !woocommerce && line.netMinor < afterDiscount ? taxMicros(afterDiscount, ratePpm, true)
    : line.taxLines.reduce((sum, tax) => sum + BigInt(tax.taxMicros), 0n);
  const taxBefore = taxMicros(line.unitPriceMinor * line.quantity, ratePpm, true);
  return roundMicrosToMinor(BigInt(line.discountMinor) * MICROS_PER_MINOR - taxBefore + taxAfter);
}

/**
 * The order.create version an order's stored content makes: 3 with ADR-065's figures, else 2 when its lines are
 * discounted (ADR-062), else 1; fees, shipping or custom lines need 5; coupons or a line's Any picks (#495) need 6. Also used by pos_orders v5's migration.
 */
export function contentVersion(order: Pick<PosOrder, 'display' | 'taxByRate' | 'lines' | 'fees' | 'shipping' | 'coupons'>): 1 | 2 | 3 | 5 | 6 {
  const redeemable = order.coupons?.filter((coupon) => !coupon.carried);
  if (redeemable?.length || order.lines.some((line) => line.anyAttributes?.length)) return 6;
  if (order.fees?.length || order.shipping?.length || order.lines.some((line) => line.custom)) return 5;
  return order.display && order.taxByRate ? 3 : order.lines.reduce((sum, line) => sum + line.discountMinor, 0) > 0 ? 2 : 1;
}

const LEGACY_REFUSAL_PREFIX = 'Refused by the store: ';

/**
 * The note as it goes on the wire. ADR-083 condition 1: `payload.note` never carries the refusal prefix that
 * @tallyui/pos 3.12.0's `reopenRefusedOrder` wrote into a reopened draft's note (`Refused by the store: <message>`,
 * then `\n` and the cashier's note, or the prefix alone), so a draft parked by 3.12.0 drops that first line here.
 * A note that is only that line is no note. The phrase anywhere else in a cashier's note is kept.
 */
function wireNote(note: string | undefined): string | undefined {
  if (!note?.startsWith(LEGACY_REFUSAL_PREFIX)) return note || undefined;
  const newline = note.indexOf('\n');
  return newline === -1 ? undefined : note.slice(newline + 1) || undefined;
}

/** #1341 (ADR-075/076): in Woo rounding a charge goes on the wire at its display row, found by id (the server checks the
 *  two are equal); with no such row it goes at its stored amount. Any other rounding sends the stored amount. */
function wireChargeMinor(order: PosOrder, charge: { id: string; amountMinor: number }, rows?: readonly { id: string; amountMinor: number }[]): number {
  if (order.taxRounding?.granularity !== 'woocommerce') return charge.amountMinor;
  return rows?.find(({ id }) => id === charge.id)?.amountMinor ?? charge.amountMinor;
}

/**
 * Builds the ADR-038 order.create envelope for a PosOrder. It sends the stored order unchanged, so every resend of
 * an order is byte-identical, except that a Woo-rounded order with charge display rows sends each charge at its row
 * (`wireChargeMinor`, #1341) and everything else as stored:
 * `finalizeOrder` freezes the sent form (names and labels cut, an unsendable customer email or id left out).
 * ADR-065's figures make version 3; otherwise a discounted order is version 2 (ADR-062), else version 1, byte-identical.
 * A version-3 order goes as version 4 (#286) only when `maxVersion` is at least 4 and its `sentVersion` doesn't cap it.
 * Coupon orders need version 6, carrying coupons, stored regular prices, line attributes and receipt coupons.
 * A carried coupon (`carried`) is never sent as a coupon; its line shares go in the line discounts and its display row in `display.orderDiscountMinor`, and it needs version 4.
 * A sale with a note goes as version 7 when capped at 7 or more and it has figures; otherwise the note is not sent.
 * A sale taxed on the customer's address (`taxAddress`, #722) needs version 8 and never downgrades: below 8 the server
 * taxes on the base, so a lower cap throws UnsupportedOrderVersionError(8). At 8 it carries the note, `taxAddress` and
 * the stored addresses; every other field follows the version its content makes, as at 7.
 * Version 9 sends every coupon's stored line shares when the cap allows it, keeping notes and any tax address.
 * Version 10 is 9 plus each payment's `methodId`: only at a cap of 10 or more, for an order with figures (4+) whose coupons all have lines and a leg with an id.
 * Version 11 is 10 plus the customer's addresses on a sale with no `taxAddress`: only at a cap of 11 or more, for an order with figures (4+) whose coupons all have lines; otherwise they are dropped.
 * Version 12 is 11 plus the customer's tax ids (without `label`), order meta and a catalogue line's edited `sku` (ADR-092): only at a cap of 12 or more, for an order with figures (4+) whose coupons all have lines; otherwise they are dropped.
 * Orders with Any picks (#495) need version 6 too, carrying a line's `anyAttributes`, and coupons only when they have some.
 * A reopened sale (`storeOrderId`) throws: it goes as `order.update` (`toOrderUpdateEnvelope`).
 */
export function toOrderCreateEnvelope(order: PosOrder, deviceId: string, attempt = 1,
  options?: { maxVersion?: number }): OrderCreateEnvelope {
  if (order.storeOrderId !== undefined) throw new Error(`Order ${order.id} reopened store order ${order.storeOrderId}: it is sent as order.update, never order.create (ADR-090)`);
  return createEnvelope(order, deviceId, attempt, options);
}

function createEnvelope(order: PosOrder, deviceId: string, attempt: number, options?: { maxVersion?: number }, floor?: 5): OrderCreateEnvelope {
  const redeemable = (order.coupons ?? []).filter((coupon) => !coupon.carried), carried = (order.coupons ?? []).filter((coupon) => coupon.carried);
  const grossMinor = order.lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const content = contentVersion(order);
  const cap = options?.maxVersion === undefined ? order.sentVersion : Math.min(options.maxVersion, order.sentVersion ?? options.maxVersion);
  if (floor !== undefined && cap !== undefined && cap < floor) throw new UnsupportedOrderVersionError(floor, cap);
  if (content === 5 && cap !== undefined && cap < 5) throw new UnsupportedOrderVersionError(5, cap);
  if (content === 6 && cap !== undefined && cap < 6) throw new UnsupportedOrderVersionError(6, cap);
  if (grossMinor > 0 && cap !== undefined && cap < 2) throw new UnsupportedOrderVersionError(2, cap);
  const taxAddress = order.taxAddress;
  if (taxAddress && cap !== undefined && cap < TAX_ADDRESS_ORDER_CREATE_VERSION) {
    throw new UnsupportedOrderVersionError(TAX_ADDRESS_ORDER_CREATE_VERSION, cap);
  }
  // Version 4 only when the cap allows it (the server advertises 4, and no sentVersion holds the order lower).
  const base = Math.max(floor ?? 1, content === 3 && cap !== undefined && cap >= 4 ? 4
    : Math.min(content, cap ?? content)) as 1 | 2 | 3 | 4 | 5 | 6;
  if (carried.length && base < 4) throw new UnsupportedOrderVersionError(4, cap ?? base);
  // Version 7 (ADR-083) is 6 plus the note: only for a sale with one, with figures (3+), when the cap allows 7.
  // Every other field follows `base`, so a note changes nothing else in the payload.
  const note = wireNote(order.note);
  if (taxAddress && base < 3) throw new Error(`Order ${order.id} is taxed on the customer's ${taxAddress} address but has no figures`);
  const couponLines = !!redeemable.length && redeemable.every((coupon) => coupon.lines !== undefined);
  // Version 10 is 9 plus each payment's methodId: only when the cap allows 10, the payload has figures (net discounts, 4+),
  // every coupon carries its lines (10 sends them as 9 does), and a leg has an id. Otherwise the version is today's and no id is sent.
  const methodIds = cap !== undefined && cap >= PAYMENT_METHOD_ID_ORDER_CREATE_VERSION && base >= 4
    && (!redeemable.length || couponLines) && order.payments.some((payment) => payment.methodId !== undefined);
  // Version 11 is 10 plus the customer's addresses on a sale not taxed by address (ADR-086 d2, amended 2026-11-19):
  // only when the cap allows 11 and the payload meets 10's own requirements; otherwise the addresses are dropped and the bytes are today's.
  const untaxedAddresses = !taxAddress && !!(order.customer?.billing || order.customer?.shipping)
    && cap !== undefined && cap >= UNTAXED_ADDRESS_ORDER_CREATE_VERSION && base >= 4 && (!redeemable.length || couponLines);
  // Version 12 is 11 plus tax ids, meta and a catalogue line's edited SKU (ADR-092), on the same terms; otherwise none of them is sent.
  const sentTaxIds = sendableTaxIds(order.customer?.taxIds), sentMeta = sendableMeta(order.meta);
  const extras = !!(sentTaxIds.length || sentMeta.length || order.lines.some(editedSku))
    && cap !== undefined && cap >= INFORMATIONAL_EXTRAS_ORDER_CREATE_VERSION && base >= 4 && (!redeemable.length || couponLines);
  const version = (extras ? 12 : untaxedAddresses ? 11 : methodIds ? 10 : couponLines && base === 6 && cap !== undefined && cap >= 9 ? 9 : taxAddress ? TAX_ADDRESS_ORDER_CREATE_VERSION
    : note && base >= 3 && cap !== undefined && cap >= 7 ? 7 : base) as OrderCreateEnvelope['version'];
  const withTaxAddress = version === 8 || (version >= 9 && taxAddress !== undefined);
  const withAddresses = withTaxAddress || version >= UNTAXED_ADDRESS_ORDER_CREATE_VERSION;
  const taxIds = version >= INFORMATIONAL_EXTRAS_ORDER_CREATE_VERSION && sentTaxIds.length ? { taxIds: sentTaxIds } : undefined;
  const lineDiscounts = order.lines.map((line) => base >= 4 ? netDiscountMinor(line, order) : line.discountMinor);
  for (const coupon of carried) {
    if (!coupon.lines) throw new Error(`Order ${order.id}: a carried coupon has no line shares`);
    for (const [i, line] of order.lines.entries()) lineDiscounts[i] += coupon.lines.find(({ lineId }) => lineId === line.id)?.discountMinor ?? 0;
  }
  // The order's discount is the sum of its lines', on one basis, so the payload's two always agree.
  const discountMinor = lineDiscounts.reduce((sum, discount) => sum + discount, 0);
  const email = order.customer?.email;
  const id = order.customer?.id;
  // These are the pre-#222 customerId and sessionId checks, kept byte-exact so stored orders resend older tills' bytes; don't replace with sendable.
  const customerId = typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : undefined;
  const sessionId = order.sessionId ?? order.lateSessionId;
  const { billing, shipping } = order.customer ?? {};
  const addresses = withAddresses ? { ...(billing ? { billing: { ...billing } } : {}), ...(shipping ? { shipping: { ...shipping } } : {}) } : {};
  const { fees: _fees, shipping: _shipping, coupons: _coupons, ...storedDisplay } = { ...order.display! };
  const displayCoupons = carried.length ? _coupons?.filter(({ code }) => redeemable.some((coupon) => coupon.code === code)) : _coupons;
  return {
    id: order.commandId, type: 'order.create', version, createdAt: order.createdAt, deviceId, attempt,
    payload: {
      clientOrderId: order.id, createdAt: order.createdAt, currency: order.currency, pricesIncludeTax: order.pricesIncludeTax,
      lines: order.lines.map((line, i) => ({
        clientLineId: line.id, ...(line.custom ? { custom: { ...line.custom } } : { variantId: line.variantId ?? line.productId }), title: line.name,
        ...(version >= INFORMATIONAL_EXTRAS_ORDER_CREATE_VERSION && editedSku(line) ? { sku: line.sku } : {}),
        quantity: line.quantity, unitPriceMinor: line.unitPriceMinor,
        ...(line.taxInclusive !== undefined ? { taxInclusive: line.taxInclusive } : {}),
        ...(lineDiscounts[i] > 0 ? { discountMinor: lineDiscounts[i] } : {}),
        ...(base === 6 && line.regularUnitPriceMinor !== undefined ? { regularUnitPriceMinor: line.regularUnitPriceMinor } : {}),
        ...(base === 6 && line.attributes && Object.keys(line.attributes).length ? { attributes: { ...line.attributes } } : {}),
        ...(base === 6 && line.anyAttributes?.length ? { anyAttributes: [...line.anyAttributes] } : {}),
      })),
      ...(base >= 5 && order.fees?.length ? { fees: order.fees.map((fee) => ({
        clientFeeId: fee.id, name: fee.name, amountMinor: wireChargeMinor(order, fee, order.display?.fees), taxStatus: fee.taxStatus,
        ...(fee.taxClass !== undefined ? { taxClass: fee.taxClass } : {}),
        // #1131: WooCommerce totals a fee line's tax per rate, as its own order totals do.
        taxMinor: order.taxRounding?.granularity === 'woocommerce'
          ? woocommerceChargeTaxMinor(fee, order.taxRounding.roundAtSubtotal, order.pricesIncludeTax)
          : roundMicrosToMinor(BigInt(fee.taxMicros)),
      })) } : {}),
      ...(base >= 5 && order.shipping?.length ? { shipping: order.shipping.map((charge) => ({
        clientShippingId: charge.id, name: charge.name, ...(charge.methodId !== undefined ? { methodId: charge.methodId } : {}),
        amountMinor: wireChargeMinor(order, charge, order.display?.shipping), taxStatus: charge.taxStatus,
        ...(charge.taxClass !== undefined ? { taxClass: charge.taxClass } : {}),
        // #1120: WooCommerce totals a shipping line's tax per rate, as its own order totals do.
        taxMinor: order.taxRounding?.granularity === 'woocommerce'
          ? woocommerceChargeTaxMinor(charge, order.taxRounding.roundAtSubtotal, order.pricesIncludeTax)
          : roundMicrosToMinor(BigInt(charge.taxMicros)),
      })) } : {}),
      ...(base === 6 && redeemable.length ? { coupons: redeemable.map(({ code, couponId, discountMinor, discountTaxMinor, lines }) => ({
        code, couponId, discountMinor, discountTaxMinor,
        ...(version >= 9 ? { lines: lines!.map(({ lineId, discountMinor, discountTaxMinor }) =>
          ({ clientLineId: lineId, discountMinor, discountTaxMinor })) } : {}),
      })) } : {}),
      payments: order.payments.map((payment) => ({
        clientPaymentId: payment.id, method: payment.method, amountMinor: payment.amountMinor,
        ...(payment.tenderedMinor !== undefined ? { tenderedMinor: payment.tenderedMinor } : {}),
        ...(payment.changeMinor !== undefined ? { changeMinor: payment.changeMinor } : {}),
        ...(payment.reference !== undefined ? { reference: payment.reference } : {}),
        ...(version >= PAYMENT_METHOD_ID_ORDER_CREATE_VERSION && payment.methodId !== undefined ? { methodId: payment.methodId } : {}),
      })),
      subtotalMinor: order.subtotalMinor,
      ...(discountMinor > 0 ? { discountMinor } : {}),
      taxMinor: order.taxMinor, totalMinor: order.totalMinor,
      // ADR-094: a rounded sale's entries ride at its content version; finalize refuses them unless the store declares cashRounding.
      ...(order.cashRoundings?.length
        ? { cashRoundings: order.cashRoundings.map(({ paymentId, minor }) => ({ paymentId, minor })) } : {}),
      ...(base >= 3 ? {
        display: { ...storedDisplay, lines: order.display!.lines.map(({ lineId, amountMinor, discounts }) => ({
          clientLineId: lineId, amountMinor, discounts,
        })),
        ...(carried.length ? { orderDiscountMinor: order.display!.orderDiscountMinor + (_coupons ?? [])
          .reduce((sum, row) => sum + (carried.some((coupon) => coupon.code === row.code) ? row.amountMinor : 0), 0) } : {}),
        ...(base >= 5 && order.display!.fees ? { fees: order.display!.fees.map(({ id, amountMinor }) => ({ clientFeeId: id, amountMinor })) } : {}),
        ...(base >= 5 && order.display!.shipping ? { shipping: order.display!.shipping.map(({ id, amountMinor }) => ({ clientShippingId: id, amountMinor })) } : {}),
        ...(base === 6 && redeemable.length && displayCoupons && (!carried.length || displayCoupons.length) ? { coupons: displayCoupons.map(({ code, amountMinor }) => ({ code, amountMinor })) } : {}),
        },
        taxByRate: order.taxByRate!.map(({ ratePpm, code, netMinor, amountMinor, grossMinor }) => ({
          ratePpm, ...(code !== undefined ? { code } : {}), netMinor, taxMinor: amountMinor, grossMinor,
        })),
      } : {}),
      customer: base >= 3
        ? (email || customerId || withAddresses || taxIds ? { ...(email ? { email } : {}), ...(customerId ? { customerId } : {}), ...addresses, ...taxIds } : null)
        : (email ? { email } : null),
      ...(order.registerId !== undefined ? { registerId: order.registerId } : {}),
      ...(order.cashierRef !== undefined ? { cashierRef: order.cashierRef } : {}),
      ...(base >= 3 && typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 36 ? { sessionId } : {}),
      ...(version >= 7 && note ? { note } : {}),
      ...(withTaxAddress ? { taxAddress } : {}),
      ...(version >= INFORMATIONAL_EXTRAS_ORDER_CREATE_VERSION && sentMeta.length ? { meta: sentMeta } : {}),
    },
  };
}

/** Gate 8 (ADR-090): each kept item's store id goes on the update item with the same client id, never by position. */
export function pairStoreIds(payload: OrderCreatePayload, order: PosOrder): Pick<OrderUpdatePayload, 'lines' | 'payments' | 'fees' | 'shipping'> {
  const lines = new Map<string, string | undefined>(order.lines.map((line) => [line.id, line.storeLineId]));
  const fees = new Map<string, string | undefined>((order.fees ?? []).map((fee) => [fee.id, fee.storeLineId]));
  const shipping = new Map<string, string | undefined>((order.shipping ?? []).map((charge) => [charge.id, charge.storeLineId]));
  const payments = new Map<string, string | undefined>(order.payments.map((payment) => [payment.id, payment.storePaymentId]));
  return {
    lines: payload.lines.map((line) => {
      const id = lines.get(line.clientLineId); return id !== undefined ? { ...line, storeLineId: id } : line;
    }),
    payments: payload.payments.map((payment) => {
      const id = payments.get(payment.clientPaymentId); return id !== undefined ? { ...payment, paymentId: id } : payment;
    }),
    ...(payload.fees ? { fees: payload.fees.map((fee) => {
      const id = fees.get(fee.clientFeeId); return id !== undefined ? { ...fee, storeLineId: id } : fee;
    }) } : {}),
    ...(payload.shipping ? { shipping: payload.shipping.map((charge) => {
      const id = shipping.get(charge.clientShippingId); return id !== undefined ? { ...charge, storeLineId: id } : charge;
    }) } : {}),
  };
}

/** Builds at order.create version 5 or more (a store's cap below 5 throws UnsupportedOrderVersionError(5, cap)).
 * Refuses a row without baseRevision or figures, and pairs store ids by client id. */
export function toOrderUpdateEnvelope(order: PosOrder, deviceId: string, attempt = 1, options?: { maxVersion?: number }): OrderUpdateEnvelope {
  if (order.storeOrderId === undefined) throw new Error(`Order ${order.id} has no storeOrderId: it is sent as order.create`);
  if (order.baseRevision === undefined) throw new Error(`Order ${order.id} reopened store order ${order.storeOrderId} without its base revision: order.update needs it (ADR-090)`);
  if (!order.display || !order.taxByRate) throw new Error(`Order ${order.id} has no figures: order.update goes at order.create version 5 or more, which needs them (ADR-090)`);
  const create = createEnvelope(order, deviceId, attempt, options, ORDER_UPDATE_MIN_CREATE_VERSION);
  return { id: create.id, type: 'order.update', version: 1, createdAt: create.createdAt,
    deviceId: create.deviceId, attempt: create.attempt, payload: { ...create.payload, orderId: order.storeOrderId,
      baseRevision: order.baseRevision, createVersion: create.version,
      ...pairStoreIds(create.payload, order),
    } };
}
