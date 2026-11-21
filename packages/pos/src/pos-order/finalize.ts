import { minorUnitDigits, ORDER_LINE_SKU_MAX, ORDER_META_KEY_MAX, ORDER_NOTE_MAX, ORDER_TAX_ID_TYPE_MAX, ORDER_TAX_ID_VALUE_MAX, type CustomerAddress, type OrderAddress, type ServerCapabilities, type TaxRounding,
  type woocommerceTax } from '@tallyui/core';
import { chargeOrderModeMinor } from '../order/order-builder';
import { cleanTaxIds, TAX_IDS_INVALID } from '../order/tax-ids';
import type { ChargeLine, Order, SentOrder } from '../order/types';
import { legStatus } from '../tender/payment-legs';
import { DEFAULT_TAX_ROUNDING, taxLinesByRate } from '../tax/exact';
import { taxedLinesFor } from '../tax/taxed-lines';
import { outboxLogger } from '../outbox/logger';
import { cutText, PAYLOAD_STRING_MAX, REVISION_MAX, sendable } from './command';
import type { PosOrder, PosOrderLocalWarning, PosOrderPayment } from './types';
import { uuidv7 } from './uuidv7';

export interface FinalizeOptions {
  localWarnings?: PosOrderLocalWarning[];
  registerId?: string;
  // No `sessionId`: `stampSession` is the only way to set a sale's session, because it checks the
  // session is live. Tests and migrations that need a stamped order spread `{ ...order, sessionId }`.
  cashierRef?: string;
  now?: Date;
  /** Tests only: replaces uuidv7. Every id it returns must be at most 255 characters with no NUL (order.create's bound). */
  newId?: () => string;
  /** The store's `order.create` capability (ADR-062); `undefined` is treated as 1. */
  capabilities?: ServerCapabilities;
  /** The address the sale's tax context matched (#722, `saleTaxContexts`). A customer's billing or shipping address stores
   *  `taxAddress`; the base, or absent, stores none. The customer's non-empty addresses are stored on every order, sent at
   *  order.create 8 with `taxAddress` and at 11 without it (ADR-086 d2, amended 2026-11-19). */
  taxLocation?: woocommerceTax.ResolvedTaxLocation;
}

/** OrderAddress's keys: a CustomerAddress without its email (#722). */
const ORDER_ADDRESS_KEYS = ['firstName', 'lastName', 'company', 'address1', 'address2', 'city', 'state', 'postcode', 'country', 'phone'] as const;

/** A customer's address as order.create 8 carries it: the ten keys, non-empty strings only; undefined when none is. */
function orderAddress(address: CustomerAddress | undefined): OrderAddress | undefined {
  const entries = ORDER_ADDRESS_KEYS.flatMap((key) => typeof address?.[key] === 'string' && address[key] ? [[key, address[key]]] : []);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

// Front desk 2026-11-21 (Q-B1): an after-close sale keeps the payments its closed session's closure counted.
export const AFTER_CLOSE_PAYMENTS_CHANGED = 'This sale was counted in a closed register. Its payments must stay as that closure counted them.';

/** A line name in a refusal message: 60 UTF-16 units of it plus '…' at most, so a cashier-facing message stays short. */
export const MESSAGE_NAME_MAX = 61;

/** A charge as stored and sent: in the order's mode, without the cashier's own mode (vendurepos gap 2.10).
 *  A converted generic charge keeps its display row, so the payload equals the display (core fiscal-figures.ts). */
function storedCharge<C extends ChargeLine>(charge: C, pricesIncludeTax: boolean, displayMinor: number | undefined): C {
  if (charge.amountIncludesTax === undefined && charge.percent === undefined) return charge;
  const { amountIncludesTax: _mode, percent: _percent, ...rest } = charge;
  const amountMinor = charge.totalMinor === undefined && displayMinor !== undefined ? displayMinor : chargeOrderModeMinor(charge, pricesIncludeTax);
  return { ...rest, amountMinor, ...(charge.totalMinor === undefined ? { netMinor: amountMinor } : {}) } as C;
}

/** The receipt shows the order as it was stored and sent (Front desk, 2026-09-29). */
export function withSentForm(order: Order, posOrder: PosOrder): SentOrder {
  const customer: SentOrder['customer'] = order.customer && { ...order.customer };
  if (customer && posOrder.customer?.email === undefined) delete customer.email;
  if (customer && posOrder.customer?.id === undefined) delete customer.id;
  return { ...order, customer, note: posOrder.note ?? order.note,
    lineItems: order.lineItems.map((line, i) => ({ ...line, name: posOrder.lines[i].name })),
    ...(order.fees ? { fees: order.fees.map((fee, i) => ({ ...storedCharge(fee, order.pricesIncludeTax, order.display.fees?.[i]?.amountMinor), name: posOrder.fees![i].name })) } : {}),
    ...(order.shipping ? { shipping: order.shipping.map((charge, i) => ({ ...storedCharge(charge, order.pricesIncludeTax, order.display.shipping?.[i]?.amountMinor),
      name: posOrder.shipping![i].name })) } : {}),
    display: posOrder.display ? { ...order.display,
      ...(order.display.fees ? { fees: order.display.fees.map((row, i) => ({ ...row, name: posOrder.display!.fees![i].name })) } : {}),
      ...(order.display.shipping ? { shipping: order.display.shipping.map((row, i) => ({ ...row, name: posOrder.display!.shipping![i].name })) } : {}),
      lines: order.display.lines.map((line, i) => ({ ...line,
        discounts: line.discounts.map((discount, j) => ({ ...discount, label: posOrder.display!.lines[i].discounts[j].label })),
      })),
    } : order.display,
  };
}

/** Bounds apply when the sent form is frozen; the outbox freezes older tills' stored orders before their first send. */
export function freezeSentForm(order: PosOrder): PosOrder {
  let changed = false;
  const note = order.note === undefined ? undefined : cutText(order.note, ORDER_NOTE_MAX);
  changed ||= note !== order.note;
  const lines = order.lines.map((line) => {
    const name = cutText(line.name, PAYLOAD_STRING_MAX);
    const sku = cutText(line.sku, ORDER_LINE_SKU_MAX);
    const catalogueSku = line.catalogueSku === undefined ? undefined : cutText(line.catalogueSku, ORDER_LINE_SKU_MAX);
    changed ||= name !== line.name || sku !== line.sku || catalogueSku !== line.catalogueSku;
    const custom = line.custom && { ...line.custom, name: cutText(line.custom.name, PAYLOAD_STRING_MAX) };
    changed ||= custom !== undefined && custom.name !== line.custom!.name;
    return { ...line, name, sku, ...(catalogueSku !== undefined ? { catalogueSku } : {}), ...(custom ? { custom } : {}) };
  });
  const charges = { fees: order.fees, shipping: order.shipping };
  for (const field of ['fees', 'shipping'] as const) if (charges[field]) charges[field] = charges[field]!.map((charge) => {
    const name = cutText(charge.name, PAYLOAD_STRING_MAX);
    changed ||= name !== charge.name;
    return { ...charge, name };
  });
  const display = order.display && { ...order.display, lines: order.display.lines.map((line) => ({ ...line,
    discounts: line.discounts.map((discount) => {
      if (discount.label === undefined) return discount;
      const label = cutText(discount.label, PAYLOAD_STRING_MAX);
      changed ||= label !== discount.label;
      return { ...discount, label };
    }),
  })) };
  for (const field of ['fees', 'shipping'] as const) if (display?.[field]) display[field] = display[field]!.map((row) => {
    const name = cutText(row.name, PAYLOAD_STRING_MAX);
    changed ||= name !== row.name;
    return { ...row, name };
  });
  const payments = order.payments.map((payment) => {
    if (payment.reference === undefined) return payment;
    const reference = cutText(payment.reference, PAYLOAD_STRING_MAX);
    changed ||= reference !== payment.reference;
    return { ...payment, reference };
  });
  const customer = order.customer && { ...order.customer };
  for (const kind of ['billing', 'shipping'] as const) if (customer?.[kind]) {
    const address: OrderAddress = Object.fromEntries(Object.entries(customer[kind]).map(([key, value]) => [key, cutText(value, PAYLOAD_STRING_MAX)]));
    changed ||= Object.entries(address).some(([key, value]) => value !== customer[kind]![key as keyof OrderAddress]);
    customer[kind] = address;
  }
  // Version 12 (ADR-092): tax ids and meta are cut to their bounds like the other text.
  if (customer?.taxIds) customer.taxIds = customer.taxIds.map((taxId) => {
    const cut = { ...taxId, type: cutText(taxId.type, ORDER_TAX_ID_TYPE_MAX), value: cutText(taxId.value, ORDER_TAX_ID_VALUE_MAX),
      ...(taxId.label !== undefined ? { label: cutText(taxId.label, PAYLOAD_STRING_MAX) } : {}) };
    changed ||= cut.type !== taxId.type || cut.value !== taxId.value || cut.label !== taxId.label;
    return cut;
  });
  const meta = order.meta?.map((entry) => {
    const cut = { key: cutText(entry.key, ORDER_META_KEY_MAX), value: cutText(entry.value, ORDER_NOTE_MAX) };
    changed ||= cut.key !== entry.key || cut.value !== entry.value;
    return cut;
  });
  const localWarnings = [...(order.localWarnings ?? [])];
  for (const [field, max] of [['email', 254], ['id', 64]] as const) {
    if (customer && field in customer && !sendable(customer[field], max)) {
      delete customer[field]; changed = true;
      if (!localWarnings.some((warning) => warning.code === 'customer_omitted' && warning.field === field)) localWarnings.push({ code: 'customer_omitted', field });
    }
  }
  return changed ? { ...order, lines, payments, customer, ...(note !== undefined ? { note } : {}), ...(charges.fees ? { fees: charges.fees } : {}),
    ...(charges.shipping ? { shipping: charges.shipping } : {}), ...(display ? { display } : {}), ...(meta ? { meta } : {}), ...(localWarnings.length ? { localWarnings } : {}) } : order;
}

/**
 * Why a reference the till passes through without minting would fail order.create's shape check
 * (over PAYLOAD_STRING_MAX, or a NUL), or null; `label` names it for the cashier. `useSale` also
 * checks its options and an entered payment reference with it.
 */
export function referenceError(label: string, value: string | undefined): string | null {
  const reason = referenceReason(value);
  return reason === 'long' ? `${label} is too long (max ${PAYLOAD_STRING_MAX} characters)`
    : reason === 'nul' ? `${label} contains a NUL character` : null;
}

/** referenceError's rule as a reason: 'long' (over PAYLOAD_STRING_MAX), 'nul', or null when finalize accepts the value. */
export function referenceReason(value: string | undefined): 'long' | 'nul' | null {
  if (value === undefined) return null;
  if (value.length > PAYLOAD_STRING_MAX) return 'long';
  return value.includes('\u0000') ? 'nul' : null;
}

/**
 * Turns a fully paid builder Order into a pending PosOrder without mutating it. The PosOrder holds the sent form,
 * frozen: line names and v3 discount labels are cut to PAYLOAD_STRING_MAX with NUL stripped (`cutText`), and a
 * customer email or id the shape check would refuse is left out, so `toOrderCreateEnvelope` sends it unchanged.
 */
export function finalizeOrder(order: Order, options: FinalizeOptions = {}): PosOrder {
  const { afterClose } = order;
  if (afterClose && (order.payments.length !== afterClose.payments.length || order.payments.some((payment, i) =>
    payment.method !== afterClose.payments[i].method || payment.amountMinor !== afterClose.payments[i].amountMinor))) {
    throw new Error(AFTER_CLOSE_PAYMENTS_CHANGED);
  }
  // An after-close sale keeps its original register; the till finalizing it now is not where it was taken.
  const registerId = afterClose ? afterClose.registerId : options.registerId;
  if ((order.fees?.length || order.shipping?.length || order.lineItems.some((line) => line.custom))
    && (options.capabilities?.orderCreate ?? 1) < 5) {
    throw new Error("finalize: fees, shipping and custom lines need the store to accept order.create version 5; update the store's TallyUI plugin");
  }
  if (order.storeOrder && (options.capabilities?.orderCreate ?? 1) < 5) throw new Error("finalize: a reopened store order needs the store to accept order.create version 5; update the store's TallyUI plugin");
  if (order.coupons?.some((coupon) => !coupon.carried) && (options.capabilities?.orderCreate ?? 1) < 6) {
    throw new Error("finalize: coupons need the store to accept order.create version 6; update the store's TallyUI plugin");
  }
  if (order.coupons?.some((coupon) => coupon.carried) && (options.capabilities?.orderCreate ?? 1) < 4) {
    throw new Error("finalize: a carried coupon needs the store to accept order.create version 4; update the store's TallyUI plugin");
  }
  if (order.couponPricesStale) {
    throw new Error("finalize: the coupons' prices are out of date; price the coupons again before finalizing");
  }
  if (order.lineItems.some((line) => line.anyAttributes?.length) && (options.capabilities?.orderCreate ?? 1) < 6) {
    throw new Error("finalize: picked options need the store to accept order.create version 6; update the store's TallyUI plugin");
  }
  if (!order.lineItems.length) throw new Error('finalize: no lines');
  // Defence in depth: the builder already clamps every discount to >= 0, so this should never fire.
  if (order.discountMinor < 0
    || order.lineItems.some((line) => line.discountMinor < 0)
    || order.discounts.some((d) => d.amountMinor < 0)) {
    throw new Error('finalize: negative discount');
  }
  // An old plugin would reject or mis-apply a version-2 payload; this guard rejects a discount only when the store can't take it yet (ADR-062).
  // Checked as "any non-zero" rather than "> 0": defence in depth, since the builder already clamps every
  // discount to >= 0, so a negative amountMinor should never reach here.
  const hasDiscount = order.discountMinor !== 0
    || order.lineItems.some((line) => line.discountMinor !== 0)
    || order.discounts.some((d) => d.amountMinor !== 0);
  if (hasDiscount && (options.capabilities?.orderCreate ?? 1) < 2) {
    throw new Error('finalize: discounts are not supported by the server yet (order.create v2)');
  }
  for (const payment of order.payments) {
    if (payment.method !== 'cash' && payment.method !== 'external') {
      throw new Error(`finalize: unsupported payment method ${payment.method}`);
    }
    if (legStatus(payment) !== 'captured') throw new Error(`finalize: the ${payment.method} payment is ${legStatus(payment)}, not captured`);
  }
  // A reopened sale's store ids (ADR-090 D7c5), checked before any id is minted: a dropped or bent id makes the store
  // take a kept line or a captured payment as new. Gate 1 is core's id rule, gate 3 its uniqueness rule.
  const reopened = order.storeOrder !== undefined;
  const storeLineIds = [...order.lineItems, ...(order.fees ?? []), ...(order.shipping ?? [])]
    .flatMap((item) => item.storeLineId !== undefined ? [item.storeLineId] : []);
  const storePaymentIds = order.payments.flatMap((payment) => payment.storePaymentId !== undefined ? [payment.storePaymentId] : []);
  if (!reopened && (storeLineIds.length || storePaymentIds.length || order.payments.some((payment) => payment.locked))) {
    throw new Error('finalize: a store id on a sale that reopened no store order');
  }
  if (order.storeOrder && (![order.storeOrder.id, ...storeLineIds, ...storePaymentIds].every((value) => sendable(value, 64))
    || !sendable(order.storeOrder.revision, REVISION_MAX))) {
    throw new Error('finalize: the reopened order carries a store id the store would refuse');
  }
  if (reopened && (new Set(storeLineIds).size !== storeLineIds.length || new Set(storePaymentIds).size !== storePaymentIds.length)) {
    throw new Error('finalize: the reopened order carries a store id twice');
  }
  if (order.payments.some((payment) => (payment.storePaymentId !== undefined) !== (payment.locked === true)
    || (payment.locked && payment.method !== 'external'))) {
    throw new Error('finalize: a payment the store already holds must be locked, external and carry its store id');
  }
  // Desk Q6: once the store's own legs cover the new total, the sale completes as refund-due and takes nothing here.
  const lockedMinor = order.payments.reduce((sum, p) => sum + (p.locked ? p.amountMinor : 0), 0);
  const heldByStore = reopened && lockedMinor >= order.totalMinor;
  if (heldByStore && order.payments.some((p) => !p.locked)) {
    throw new Error('finalize: the store already holds the new total; remove the payments taken here');
  }
  const refundDue = heldByStore ? lockedMinor - order.totalMinor : 0;
  if (order.paidMinor < order.totalMinor) throw new Error('finalize: underpaid');
  let change = heldByStore ? 0 : order.paidMinor - order.totalMinor;
  const cash = order.payments.reduce((sum, p) => sum + (p.method === 'cash' && !p.locked && p.tenderedMinor === undefined ? p.amountMinor : 0), 0);
  if (change > cash) throw new Error('finalize: change exceeds cash');
  // Refused before any id is minted, so such a value never reaches the stored order or the outbox.
  // v3 also sends each line discount's id and each tax code (as taxByRate's codes); an id is never clamped.
  const v3 = (options.capabilities?.orderCreate ?? 1) >= 3;
  const references: Array<[string, string | undefined]> = [['registerId', registerId], ['cashierRef', options.cashierRef],
    ...order.lineItems.flatMap((line, i): Array<[string, string | undefined]> => {
      const name = `"${cutText(line.name, MESSAGE_NAME_MAX)}"`;
      return [line.variantId !== undefined ? [`${name}: the variant id`, line.variantId] : [`${name}: the product id`, line.productId],
        ...(v3 ? order.display.lines[i]?.discounts ?? [] : []).map((d): [string, string] => [`${name}: the discount id`, d.discountId]),
        ...(v3 ? line.taxLines : []).map((tax): [string, string | undefined] => [`${name}: the tax code`, tax.code])];
    }),
    ...order.payments.map((payment): [string, string | undefined] => [`the ${payment.method} payment's reference`, payment.reference])];
  for (const [field, value] of references) {
    const message = referenceError(field, value);
    if (message) throw new Error(`finalize: ${message}`);
  }
  const newId = options.newId ?? uuidv7;
  const id = newId();
  const lines: PosOrder['lines'] = order.lineItems.map((line) => ({
    id: newId(), ...(line.storeLineId !== undefined ? { storeLineId: line.storeLineId } : {}), productId: line.productId,
    ...(line.variantId !== undefined ? { variantId: line.variantId } : {}),
    ...(line.custom ? { custom: { name: line.name, ...(line.sku ? { sku: line.sku } : {}),
      ...(line.taxClass !== undefined ? { taxClass: line.taxClass } : {}), taxStatus: line.taxStatus ?? 'taxable' } } : {}),
    ...(line.taxStatus !== undefined ? { taxStatus: line.taxStatus } : {}),
    name: line.name, sku: line.sku, ...(line.catalogueSku !== undefined && !line.custom ? { catalogueSku: line.catalogueSku } : {}),
    quantity: line.quantity, unitPriceMinor: line.unitPriceMinor,
    ...(line.attributes && Object.keys(line.attributes).length ? { attributes: { ...line.attributes } } : {}),
    ...(line.anyAttributes?.length ? { anyAttributes: [...line.anyAttributes] } : {}),
    ...(line.regularUnitPriceMinor !== undefined ? { regularUnitPriceMinor: line.regularUnitPriceMinor } : {}),
    discountMinor: line.discountMinor, netMinor: line.netMinor,
    ...(order.taxRounding?.granularity === 'woocommerce' ? { netMicros: line.netMicros } : {}),
    taxLines: line.taxLines.map((tax) => ({ ...tax })),
    ...(line.priceTaxModeConverted ? { taxInclusive: line.taxInclusive } : {}),
  }));
  const fees = order.fees?.map((charge, i) => ({ ...storedCharge(charge, order.pricesIncludeTax, order.display.fees?.[i]?.amountMinor), id: newId(), taxLines: charge.taxLines.map((tax) => ({ ...tax })) }));
  const shipping = order.shipping?.map((charge, i) => ({ ...storedCharge(charge, order.pricesIncludeTax, order.display.shipping?.[i]?.amountMinor), id: newId(), taxLines: charge.taxLines.map((tax) => ({ ...tax })) }));
  const payments: PosOrderPayment[] = order.payments.map((payment) => ({
    id: newId(), ...(payment.storePaymentId !== undefined ? { storePaymentId: payment.storePaymentId } : {}),
    method: payment.method as PosOrderPayment['method'],
    ...(payment.methodId !== undefined && sendable(payment.methodId, 64) ? { methodId: payment.methodId } : {}),
    amountMinor: payment.amountMinor,
    ...(payment.tenderedMinor !== undefined ? { tenderedMinor: payment.tenderedMinor } : {}),
    ...(payment.changeMinor !== undefined ? { changeMinor: payment.changeMinor } : {}),
    ...(payment.reference !== undefined ? { reference: payment.reference } : {}),
  }));
  // A warning naming a payment the order no longer has is dropped and logged, never thrown: this runs at sale completion.
  const localWarnings = options.localWarnings?.flatMap((warning): PosOrderLocalWarning[] => {
    if (warning.code !== 'payment_reference_dropped') return [{ ...warning }];
    const index = order.payments.findIndex((payment) => payment.id === warning.paymentId);
    if (index === -1) {
      try {
        outboxLogger.warn('finalize: dropped a localWarnings entry naming an unknown payment', { orderId: id, paymentId: warning.paymentId });
      } catch { /* a failing sink must never fail the sale */ }
      return [];
    }
    return [{ ...warning, paymentId: payments[index].id }];
  });
  for (let i = payments.length - 1; i >= 0; i--) {
    const payment = payments[i];
    if (payment.method !== 'cash' || order.payments[i].tenderedMinor !== undefined) continue;
    payment.tenderedMinor = payment.amountMinor;
    payment.changeMinor = Math.min(change, payment.tenderedMinor);
    payment.amountMinor -= payment.changeMinor;
    change -= payment.changeMinor;
  }
  // A reopened sale's refund due is the locked legs beyond the new total (desk Q4); a till sale's is 0.
  if (payments.reduce((sum, p) => sum + p.amountMinor, 0) - refundDue !== order.totalMinor) {
    throw new Error('finalize: payments do not reconcile');
  }
  let display: PosOrder['display'];
  let taxByRate: PosOrder['taxByRate'];
  if ((options.capabilities?.orderCreate ?? 1) >= 3) {
    if (order.display.lines.length !== order.lineItems.length
      || order.display.lines.some((line, i) => line.lineId !== order.lineItems[i].id)) {
      throw new Error('finalize: display lines do not match the order lines');
    }
    display = { currency: order.currency, exponent: minorUnitDigits(order.currency), ...order.display,
      ...(fees?.length ? { fees: order.display.fees!.map((row, i) => ({ ...row, id: fees[i].id })) } : {}),
      ...(shipping?.length ? { shipping: order.display.shipping!.map((row, i) => ({ ...row, id: shipping[i].id })) } : {}),
      lines: order.display.lines.map((line, i) => ({
        lineId: lines[i].id, amountMinor: line.amountMinor,
        discounts: line.discounts.map(({ discountId, label, amountMinor }) => ({
          discountId, ...(label !== undefined ? { label } : {}), amountMinor,
        })),
      })),
    };
    const taxedLines = taxedLinesFor(order.lineItems, [...(order.fees ?? []), ...(order.shipping ?? [])], order.pricesIncludeTax, order.taxRounding);
    taxByRate = taxLinesByRate(taxedLines, order.taxMinor, undefined, order.taxRounding).map(({ ratePpm, code, netMinor, amountMinor }) => ({
      ratePpm, ...(code !== undefined ? { code } : {}), netMinor, amountMinor, grossMinor: netMinor + amountMinor,
    }));
    if (display.totalMinor !== order.totalMinor || display.taxMinor !== order.taxMinor
      || display.taxInclusive !== order.pricesIncludeTax) {
      throw new Error('finalize: display does not match the order');
    }
    if (taxByRate.reduce((sum, rate) => sum + rate.amountMinor, 0) !== order.taxMinor) {
      throw new Error('finalize: tax by rate does not sum to the order tax');
    }
  }
  // Frozen with the figures (#287), the default included, and never recomputed from the store's later capability:
  // absent on the snapshot is the default the figures used; `custom` computes as the default but records itself.
  const rounding = order.taxRounding ?? DEFAULT_TAX_ROUNDING;
  const taxRounding: TaxRounding = rounding.granularity === 'custom' ? { granularity: 'custom' }
    : rounding.granularity === 'woocommerce' ? { granularity: 'woocommerce', roundAtSubtotal: rounding.roundAtSubtotal }
    : { granularity: rounding.granularity, mode: rounding.mode };
  const used = options.taxLocation?.addressUsed;
  const taxAddress = used === 'billing' || used === 'shipping' ? used : undefined;
  const addresses = { billing: orderAddress(order.customer?.billing), shipping: orderAddress(order.customer?.shipping) };
  if (taxAddress && !addresses[taxAddress]?.country) throw new Error(`finalize: the sale was taxed on the customer's ${taxAddress} address, which it does not have`);
  // #1064: the backstop for a list no setter checked; the stored list is always a clean copy.
  const taxIds = order.customer?.taxIds && cleanTaxIds(order.customer.taxIds);
  if (taxIds === null) throw new Error(TAX_IDS_INVALID);
  const now = (options.now ?? new Date()).toISOString();
  return freezeSentForm({
    id, saleId: order.id, createdAt: afterClose?.createdAt ?? now, updatedAt: now, commandId: newId(), syncStatus: 'pending',
    currency: order.currency, pricesIncludeTax: order.pricesIncludeTax, lines, payments,
    ...(fees?.length ? { fees } : {}), ...(shipping?.length ? { shipping } : {}),
    subtotalMinor: order.subtotalMinor, discountMinor: order.discountMinor,
    taxMinor: order.taxMinor, totalMinor: order.totalMinor, taxRounding,
    ...(order.storeOrder ? { storeOrderId: order.storeOrder.id, baseRevision: order.storeOrder.revision, refundDueMinor: refundDue } : {}),
    ...(order.coupons?.length ? { coupons: order.coupons.map((coupon) => ({
      code: coupon.code, couponId: coupon.couponId, discountMinor: coupon.discountMinor, discountTaxMinor: coupon.discountTaxMinor,
      ...(coupon.carried ? { carried: true as const } : {}),
      ...(coupon.lines !== undefined ? { lines: coupon.lines.map(({ lineId, discountMinor, discountTaxMinor, amountMinor }) => {
        const index = order.lineItems.findIndex((line) => line.id === lineId);
        if (index === -1) throw new Error("finalize: a coupon's line share names no line on the order");
        return { lineId: lines[index].id, discountMinor, discountTaxMinor, ...(amountMinor !== undefined ? { amountMinor } : {}) };
      }) } : {}),
    })) } : {}),
    ...(display && taxByRate ? { display, taxByRate } : {}),
    customer: order.customer ? { id: order.customer.id, name: order.customer.name,
      ...(order.customer.email !== undefined ? { email: order.customer.email } : {}),
      ...(addresses.billing ? { billing: addresses.billing } : {}),
      ...(addresses.shipping ? { shipping: addresses.shipping } : {}),
      ...(taxIds?.length ? { taxIds } : {}) } : null,
    ...(order.note ? { note: order.note } : {}),
    ...(order.meta?.length ? { meta: order.meta.map((m) => ({ ...m })) } : {}),
    ...(taxAddress ? { taxAddress } : {}),
    ...(registerId !== undefined ? { registerId } : {}),
    ...(afterClose ? { countedInClosureOf: afterClose.sessionId } : {}),
    ...(options.cashierRef !== undefined ? { cashierRef: options.cashierRef } : {}),
    ...(localWarnings?.length ? { localWarnings } : {}),
  });
}
