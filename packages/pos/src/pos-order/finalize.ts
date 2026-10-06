import { minorUnitDigits, type ServerCapabilities, type TaxRounding } from '@tallyui/core';
import type { Order, SentOrder } from '../order/types';
import { DEFAULT_TAX_ROUNDING, taxLinesByRate } from '../tax/exact';
import { outboxLogger } from '../outbox/logger';
import { cutText, PAYLOAD_STRING_MAX, sendable } from './command';
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
}

/** A line name in a refusal message: 60 UTF-16 units of it plus '…' at most, so a cashier-facing message stays short. */
export const MESSAGE_NAME_MAX = 61;

/** The receipt shows the order as it was stored and sent (Front desk, 2026-09-29). */
export function withSentForm(order: Order, posOrder: PosOrder): SentOrder {
  const customer: SentOrder['customer'] = order.customer && { ...order.customer };
  if (customer && posOrder.customer?.email === undefined) delete customer.email;
  if (customer && posOrder.customer?.id === undefined) delete customer.id;
  return { ...order, customer,
    lineItems: order.lineItems.map((line, i) => ({ ...line, name: posOrder.lines[i].name })),
    ...(order.fees ? { fees: order.fees.map((fee, i) => ({ ...fee, name: posOrder.fees![i].name })) } : {}),
    ...(order.shipping ? { shipping: order.shipping.map((charge, i) => ({ ...charge, name: posOrder.shipping![i].name })) } : {}),
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
  const lines = order.lines.map((line) => {
    const name = cutText(line.name, PAYLOAD_STRING_MAX);
    changed ||= name !== line.name;
    const custom = line.custom && { ...line.custom, name: cutText(line.custom.name, PAYLOAD_STRING_MAX) };
    changed ||= custom !== undefined && custom.name !== line.custom!.name;
    return { ...line, name, ...(custom ? { custom } : {}) };
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
  const localWarnings = [...(order.localWarnings ?? [])];
  for (const [field, max] of [['email', 254], ['id', 64]] as const) {
    if (customer && field in customer && !sendable(customer[field], max)) {
      delete customer[field]; changed = true;
      if (!localWarnings.some((warning) => warning.code === 'customer_omitted' && warning.field === field)) localWarnings.push({ code: 'customer_omitted', field });
    }
  }
  return changed ? { ...order, lines, payments, customer, ...(charges.fees ? { fees: charges.fees } : {}),
    ...(charges.shipping ? { shipping: charges.shipping } : {}), ...(display ? { display } : {}), ...(localWarnings.length ? { localWarnings } : {}) } : order;
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
  if ((order.fees?.length || order.shipping?.length || order.lineItems.some((line) => line.custom))
    && (options.capabilities?.orderCreate ?? 1) < 5) {
    throw new Error("finalize: fees, shipping and custom lines need the store to accept order.create version 5; update the store's TallyUI plugin");
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
  }
  if (order.paidMinor < order.totalMinor) throw new Error('finalize: underpaid');
  let change = order.paidMinor - order.totalMinor;
  const cash = order.payments.reduce((sum, p) => sum + (p.method === 'cash' ? p.amountMinor : 0), 0);
  if (change > cash) throw new Error('finalize: change exceeds cash');
  // Refused before any id is minted, so such a value never reaches the stored order or the outbox.
  // v3 also sends each line discount's id and each tax code (as taxByRate's codes); an id is never clamped.
  const v3 = (options.capabilities?.orderCreate ?? 1) >= 3;
  const references: Array<[string, string | undefined]> = [['registerId', options.registerId], ['cashierRef', options.cashierRef],
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
    id: newId(), productId: line.productId,
    ...(line.variantId !== undefined ? { variantId: line.variantId } : {}),
    ...(line.custom ? { custom: { name: line.name, ...(line.sku ? { sku: line.sku } : {}),
      ...(line.taxClass !== undefined ? { taxClass: line.taxClass } : {}), taxStatus: line.taxStatus ?? 'taxable' } } : {}),
    ...(line.taxStatus !== undefined ? { taxStatus: line.taxStatus } : {}),
    name: line.name, sku: line.sku, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor,
    discountMinor: line.discountMinor, netMinor: line.netMinor,
    taxLines: line.taxLines.map((tax) => ({ ...tax })),
    ...(line.priceTaxModeConverted ? { taxInclusive: line.taxInclusive } : {}),
  }));
  const fees = order.fees?.map((charge) => ({ ...charge, id: newId(), taxLines: charge.taxLines.map((tax) => ({ ...tax })) }));
  const shipping = order.shipping?.map((charge) => ({ ...charge, id: newId(), taxLines: charge.taxLines.map((tax) => ({ ...tax })) }));
  const payments: PosOrderPayment[] = order.payments.map((payment) => ({
    id: newId(), method: payment.method as PosOrderPayment['method'], amountMinor: payment.amountMinor,
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
    if (payment.method !== 'cash') continue;
    payment.tenderedMinor = payment.amountMinor;
    payment.changeMinor = Math.min(change, payment.tenderedMinor);
    payment.amountMinor -= payment.changeMinor;
    change -= payment.changeMinor;
  }
  if (payments.reduce((sum, p) => sum + p.amountMinor, 0) !== order.totalMinor) {
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
    const taxedLines = [...order.lineItems, ...[...(order.fees ?? []), ...(order.shipping ?? [])]
      .map((charge) => ({ ...charge, taxInclusive: order.pricesIncludeTax }))];
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
  const now = (options.now ?? new Date()).toISOString();
  return freezeSentForm({
    id, saleId: order.id, createdAt: now, updatedAt: now, commandId: newId(), syncStatus: 'pending',
    currency: order.currency, pricesIncludeTax: order.pricesIncludeTax, lines, payments,
    ...(fees?.length ? { fees } : {}), ...(shipping?.length ? { shipping } : {}),
    subtotalMinor: order.subtotalMinor, discountMinor: order.discountMinor,
    taxMinor: order.taxMinor, totalMinor: order.totalMinor, taxRounding,
    ...(display && taxByRate ? { display, taxByRate } : {}),
    customer: order.customer ? { id: order.customer.id, name: order.customer.name,
      ...(order.customer.email !== undefined ? { email: order.customer.email } : {}) } : null,
    ...(order.note ? { note: order.note } : {}),
    ...(options.registerId !== undefined ? { registerId: options.registerId } : {}),
    ...(options.cashierRef !== undefined ? { cashierRef: options.cashierRef } : {}),
    ...(localWarnings?.length ? { localWarnings } : {}),
  });
}
