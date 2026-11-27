import type { ServerCapabilities } from '@tallyui/core';
import type { RxCollection } from 'rxdb';
import { couponPricingBasis, createOrderBuilder, type StorePricedCoupon } from '../order/order-builder';
import { writeOrderDraft } from '../order/order-drafts';
import { isTakenAt } from '../order/taken-at';
import type { Order } from '../order/types';
import { readSession, type ClosureCollection, type RegisterSessionCollection } from '../register/session-store';
import { readFresh } from '../rxdb';
import type { TaxContext } from '../tax/types';
import { customerRefusal } from './command';
import { sameCharges, sameTaxes } from './finalize';
import type { PosOrder } from './types';

export const REOPENABLE_CODES: readonly string[] = ['coupon_invalid', 'total_mismatch'];
export type ReopenRefusal = 'not_found' | 'store_order' | 'not_rejected' | 'code_not_reopenable' | 'already_replaced' | 'session_closed'
  | 'coupon_carry_inexact' | 'carried_draft_exists';
export class ReopenRefusedOrderError extends Error {
  constructor(readonly orderId: string, readonly reason: ReopenRefusal, readonly toCollectMinor?: number) {
    super(`Cannot reopen order ${orderId}: ${reason}`);
    this.name = 'ReopenRefusedOrderError';
  }
}

/** The carried draft has the stored order's figures exactly: every line, fee and shipping line, its total and its tax. */
function sameFigures(draft: Order, order: PosOrder): boolean {
  return draft.couponPricesStale !== true && draft.lineItems.length === order.lines.length
    && draft.lineItems.every((line, i) => line.netMinor === order.lines[i].netMinor
      && (order.lines[i].netMicros === undefined || line.netMicros === order.lines[i].netMicros) && sameTaxes(line, order.lines[i]))
    && sameCharges(draft.fees, order.fees) && sameCharges(draft.shipping, order.shipping)
    && draft.totalMinor === order.totalMinor && draft.taxMinor === order.taxMinor;
}

/**
 * Reopens a refused sale as a draft; a coupon sale reopens with its coupons carried at the amounts the store charged.
 * When that carry is not exact it refuses `coupon_carry_inexact`, with `toCollectMinor` the amount still to collect without them.
 * `{ withoutCoupons: true }` is the explicit drop: the sale reopens without its coupons and the cashier collects the difference.
 * It refuses `carried_draft_exists` when the parked draft already carries a coupon, rather than return that draft.
 */
export async function reopenRefusedOrder(orderId: string, deps: {
  orders: RxCollection<PosOrder>;
  drafts: RxCollection;
  sessions: RegisterSessionCollection;
  taxContext: TaxContext;
  /** The product's tax class from the catalogue (ProductTraits.getTaxClass); undefined falls back to 'standard'. */
  taxClassOf?: (productId: string, variantId?: string) => string | undefined;
  now?: () => Date;
  /** The store's capabilities: a coupon carry needs `orderCreate` 4 or more; absent counts as 1, as in finalize. */
  capabilities?: ServerCapabilities;
  /** The frozen closures: a carried sale whose closed session's closure lists it reopens after close (ADR-077, Front desk 2026-11-21). */
  closures?: ClosureCollection;
}, options?: { withoutCoupons?: true }): Promise<string> {
  const [order] = await readFresh(deps.orders, { selector: { id: orderId } });
  if (!order) throw new ReopenRefusedOrderError(orderId, 'not_found');
  // A reopened store order returns as order.update; a redo would send order.create without its store ids (ADR-090 gate 6).
  if (order.storeOrderId !== undefined) throw new ReopenRefusedOrderError(orderId, 'store_order');
  if (order.syncStatus !== 'rejected') throw new ReopenRefusedOrderError(orderId, 'not_rejected');
  if (!REOPENABLE_CODES.includes(order.error?.code ?? '')) throw new ReopenRefusedOrderError(orderId, 'code_not_reopenable');
  const successors = await readFresh(deps.orders, { selector: { saleId: orderId } });
  if (successors.some((successor) => successor.id !== orderId)) throw new ReopenRefusedOrderError(orderId, 'already_replaced');
  // A successor already counted in a frozen closure: a manager settles it in Needs attention (ADR-077).
  if (order.countedInClosureOf !== undefined) throw new ReopenRefusedOrderError(orderId, 'session_closed');
  let afterClose: Order['afterClose'];
  if (order.sessionId) {
    const session = await readSession(deps.sessions, order.sessionId);
    // Its closure counted this sale's money: only the exact carry may re-send it, outside every session.
    const counted = session?.status === 'closed' && !!order.coupons?.length && !options?.withoutCoupons && deps.closures
      && !!(await deps.closures.storageInstance.findDocumentsById([session.id], false))[0]?.order_ids.includes(order.id);
    if (counted) {
      afterClose = { sessionId: order.sessionId, createdAt: order.createdAt, ...(order.registerId !== undefined ? { registerId: order.registerId } : {}),
        payments: order.payments.map(({ id, method, amountMinor }) => ({ id, method, amountMinor })), taxMinor: order.taxMinor,
        fees: (order.fees ?? []).map(({ totalMinor, taxLines }) => ({ totalMinor, taxLines })),
        shipping: (order.shipping ?? []).map(({ totalMinor, taxLines }) => ({ totalMinor, taxLines })) };
    } else if (!session || session.status !== 'open') throw new ReopenRefusedOrderError(orderId, 'session_closed');
  }
  const existing = await deps.drafts.findOne(orderId).exec();
  const parked = existing && (afterClose || options?.withoutCoupons) ? JSON.parse(String(existing.data)) as Order : undefined;
  // Parked while the session was open, its money is in the closed closure: reopen refuses it after close (resume is not gated).
  if (afterClose && parked && !parked.afterClose) throw new ReopenRefusedOrderError(orderId, 'session_closed');
  if (parked && options?.withoutCoupons && parked.coupons?.some((coupon) => coupon.carried)) {
    throw new ReopenRefusedOrderError(orderId, 'carried_draft_exists');
  }
  if (!existing) {
    const builder = createOrderBuilder({ currency: order.currency, taxContext: deps.taxContext, id: order.id, ...(afterClose ? { afterClose } : {}) });
    const converted = order.lines.some((line) => line.taxInclusive !== undefined && line.taxInclusive !== order.pricesIncludeTax);
    const display = order.display && !converted ? order.display : undefined;
    const carry = !!order.coupons?.length && !options?.withoutCoupons;
    const lineIds: string[] = [];
    for (const [i, line] of order.lines.entries()) {
      const lineId = builder.addLine({
        productId: line.productId, variantId: line.variantId, name: line.name, sku: (line.custom ? undefined : line.catalogueSku) ?? line.sku,
        unitPrice: { amount: line.unitPriceMinor, currency: order.currency, taxInclusive: line.taxInclusive },
        ...(line.regularUnitPriceMinor !== undefined ? { regularUnitPriceMinor: line.regularUnitPriceMinor } : {}),
        ...(line.attributes !== undefined ? { attributes: line.attributes } : {}),
        ...(line.anyAttributes !== undefined ? { anyAttributes: line.anyAttributes } : {}),
        quantity: line.quantity,
        ...(!order.taxExempt ? { taxRates: line.taxLines.map(({ code, ratePpm }) => ({ code, ratePpm })) } : {}),
        ...(line.custom ? { custom: true, taxClass: line.custom.taxClass, taxStatus: line.custom.taxStatus }
          : { taxClass: deps.taxClassOf?.(line.productId, line.variantId) ?? 'standard', taxStatus: line.taxStatus }),
        // Stored lines stay distinct for a coupon sale, so the carry maps by index and the drop is the rebuild it previews.
        ...(order.coupons?.length ? { separate: true as const } : {}),
      });
      lineIds.push(lineId);
      // A catalogue line comes back with its catalogue SKU, then its edit, as restoreOrderDraft does (ADR-092 6b).
      if (line.catalogueSku !== undefined && !line.custom) builder.updateLine(lineId, { sku: line.sku });
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
      name: fee.name, ...(fee.entered ? { amountMinor: fee.entered.amountMinor, amountIncludesTax: fee.entered.amountIncludesTax } : { amountMinor: fee.amountMinor }),
      ...(fee.taxClass !== undefined ? { taxClass: fee.taxClass } : {}),
      ...(fee.taxStatus !== undefined ? { taxStatus: fee.taxStatus } : {}),
    });
    for (const shipping of order.shipping ?? []) builder.addShipping({
      name: shipping.name, ...(shipping.entered ? { amountMinor: shipping.entered.amountMinor, amountIncludesTax: shipping.entered.amountIncludesTax } : { amountMinor: shipping.amountMinor }),
      ...(shipping.taxClass !== undefined ? { taxClass: shipping.taxClass } : {}),
      ...(shipping.taxStatus !== undefined ? { taxStatus: shipping.taxStatus } : {}),
      ...(shipping.methodId !== undefined ? { methodId: shipping.methodId } : {}),
    });
    const legIds = new Map<string, string>();
    for (const payment of order.payments) legIds.set(payment.id, builder.addPayment({
      // After close each leg keeps the refused order's id, so finalize knows it for the leg that closure counted.
      ...(afterClose ? { id: payment.id } : {}), method: payment.method, amountMinor: payment.amountMinor, reopened: true,
      ...(payment.reference !== undefined ? { reference: payment.reference } : {}),
      ...(payment.methodId !== undefined ? { methodId: payment.methodId } : {}),
      ...(isTakenAt(payment.takenAt) ? { takenAt: payment.takenAt } : {}),
      ...(payment.sessionId !== undefined ? { sessionId: payment.sessionId } : {}),
    }));
    // ADR-094: each entry follows its leg's new id; an entry whose stored leg is not found is dropped.
    for (const entry of order.cashRoundings ?? []) {
      const paymentId = legIds.get(entry.paymentId);
      if (paymentId) builder.addCashRounding({ paymentId, minor: entry.minor });
    }
    if (order.customer?.id && order.customer.name && customerRefusal(order.customer) === null) {
      builder.setCustomer({ id: order.customer.id, name: order.customer.name,
        ...(order.customer.email !== undefined ? { email: order.customer.email } : {}),
        ...(order.customer.billing !== undefined ? { billing: order.customer.billing } : {}),
        ...(order.customer.shipping !== undefined ? { shipping: order.customer.shipping } : {}),
        ...(order.customer.taxIds?.length ? { taxIds: order.customer.taxIds.map((taxId) => ({ ...taxId })) } : {}) });
    }
    // ADR-083 condition 1: the note holds only the cashier's own note, since order.create 7 sends it. The refusal stays
    // on this refused row (`error`), the till's record of it; the draft's id is this row's id.
    if (order.note) builder.setNote(order.note);
    if (order.taxExempt && !deps.taxContext.pricesIncludeTax) builder.setTaxExempt(true);
    const dropped = builder.getSnapshot();
    if (carry) {
      const coupons = order.coupons!;
      const toCollectMinor = Math.max(0, dropped.totalMinor - order.payments.reduce((sum, payment) => sum + payment.amountMinor, 0));
      // After close no drop is offered: an inexact carry stays refused for a manager (Front desk, 2026-11-21).
      const inexact = () => afterClose ? new ReopenRefusedOrderError(orderId, 'session_closed')
        : new ReopenRefusedOrderError(orderId, 'coupon_carry_inexact', toCollectMinor);
      const index = new Map(order.lines.map((line, i) => [line.id, i]));
      if ((deps.capabilities?.orderCreate ?? 1) < 4 || coupons.some((coupon) => !coupon.lines
        || coupon.lines.some(({ lineId }) => !index.has(lineId)))) throw inexact();
      // Shares split ex-tax and tax separately, so on an inclusive line their sum can be a unit off the price; a line one
      // coupon priced holds the exact total, else the shares in the line's own mode serve. The equality guard proves it.
      const exact = (i: number) => {
        const line = order.lines[i], total = line.unitPriceMinor * line.quantity - line.discountMinor - line.netMinor;
        return coupons.filter((coupon) => coupon.lines!.some(({ lineId }) => lineId === line.id)).length === 1
          && order.taxRounding?.granularity !== 'woocommerce' && total >= 0 ? total : undefined;
      };
      const priced = new Map<string, StorePricedCoupon>(coupons.map((coupon) => [coupon.code, { couponId: coupon.couponId,
        lines: coupon.lines!.map((share) => {
          const i = index.get(share.lineId)!, inclusive = order.lines[i].taxInclusive ?? order.pricesIncludeTax;
          return { lineId: lineIds[i],
            amountMinor: share.amountMinor ?? exact(i) ?? share.discountMinor + (inclusive ? share.discountTaxMinor : 0) };
        }) }]));
      builder.setCoupons(coupons.map((coupon) => coupon.code), { kind: 'store-priced', carried: true, priced, basis: couponPricingBasis(dropped) });
      const carried = builder.getSnapshot();
      if (!sameFigures(carried, order)) throw inexact();
      await writeOrderDraft(deps.drafts, carried);
    } else {
      await writeOrderDraft(deps.drafts, dropped);
    }
  }
  const document = await deps.orders.findOne(orderId).exec();
  await document!.incrementalModify((data) => {
    if (data.syncStatus === 'rejected' && !data.reopenedAt) {
      data.reopenedAt = data.updatedAt = (deps.now?.() ?? new Date()).toISOString();
    }
    return data;
  });
  return orderId;
}
