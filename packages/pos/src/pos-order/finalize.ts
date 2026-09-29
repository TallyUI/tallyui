import { minorUnitDigits, type ServerCapabilities } from '@tallyui/core';
import type { Order } from '../order/types';
import { taxLinesByRate } from '../tax/exact';
import { cutText, PAYLOAD_STRING_MAX, sendable } from './command';
import type { PosOrder, PosOrderPayment } from './types';
import { uuidv7 } from './uuidv7';

export interface FinalizeOptions {
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
  const lines = order.lineItems.map((line) => ({
    id: newId(), productId: line.productId,
    ...(line.variantId !== undefined ? { variantId: line.variantId } : {}),
    name: cutText(line.name, PAYLOAD_STRING_MAX), sku: line.sku, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor,
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
  let display: PosOrder['display'];
  let taxByRate: PosOrder['taxByRate'];
  if ((options.capabilities?.orderCreate ?? 1) >= 3) {
    if (order.display.lines.length !== order.lineItems.length
      || order.display.lines.some((line, i) => line.lineId !== order.lineItems[i].id)) {
      throw new Error('finalize: display lines do not match the order lines');
    }
    display = { currency: order.currency, exponent: minorUnitDigits(order.currency), ...order.display,
      lines: order.display.lines.map((line, i) => ({
        lineId: lines[i].id, amountMinor: line.amountMinor,
        discounts: line.discounts.map(({ discountId, label, amountMinor }) => ({
          discountId, ...(label !== undefined ? { label: cutText(label, PAYLOAD_STRING_MAX) } : {}), amountMinor,
        })),
      })),
    };
    taxByRate = taxLinesByRate(order.lineItems, order.taxMinor).map(({ ratePpm, code, netMinor, amountMinor }) => ({
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
  const now = (options.now ?? new Date()).toISOString();
  return {
    id, createdAt: now, updatedAt: now, commandId: newId(), syncStatus: 'pending',
    currency: order.currency, pricesIncludeTax: order.pricesIncludeTax, lines, payments,
    subtotalMinor: order.subtotalMinor, discountMinor: order.discountMinor,
    taxMinor: order.taxMinor, totalMinor: order.totalMinor,
    ...(display && taxByRate ? { display, taxByRate } : {}),
    // An email or id order.create's shape check would refuse is left out; the name stays. Task #32 adds a localWarnings entry here.
    customer: order.customer ? { ...(sendable(order.customer.id, 64) ? { id: order.customer.id } : {}), name: order.customer.name,
      ...(sendable(order.customer.email, 254) ? { email: order.customer.email } : {}) } : null,
    ...(order.note ? { note: order.note } : {}),
    ...(options.registerId !== undefined ? { registerId: options.registerId } : {}),
    ...(options.cashierRef !== undefined ? { cashierRef: options.cashierRef } : {}),
  };
}
