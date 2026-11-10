import type { StoreOrder, StoreOrderLine, SyncContext, TallyConnector } from '@tallyui/core';
import { getVendureOrder, listVendureOrderDetails, type VendureOrder } from './orders';

const nonEmpty = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);
// Payments that took no money.
const UNPAID_PAYMENT_STATES = ['Declined', 'Error', 'Cancelled'];

/** Maps a Vendure Admin API order (getVendureOrder's fields) to a `StoreOrder` (ADR-081). */
export function toVendureStoreOrder(order: VendureOrder, pricesIncludeTax: boolean): StoreOrder {
  if (typeof order.orderPlacedAt !== 'string' || Number.isNaN(new Date(order.orderPlacedAt).getTime())) {
    throw new Error('Vendure sent an unexpected order response');
  }
  const clientOrderId = nonEmpty(order.customFields?.tallyClientOrderId);
  const name = order.customer ? `${order.customer.firstName} ${order.customer.lastName}`.trim() : '';
  const email = nonEmpty(order.customer?.emailAddress);
  return {
    id: order.id,
    reference: order.code,
    ...(clientOrderId ? { clientOrderId } : {}),
    status: order.state,
    placedAt: new Date(order.orderPlacedAt).toISOString(),
    currency: order.currencyCode,
    // The channel's setting: Vendure's order carries none.
    pricesIncludeTax,
    customer: order.customer === null ? null : {
      id: order.customer.id, ...(name ? { name } : {}), ...(email ? { email } : {}),
    },
    lines: order.lines.map((line): StoreOrderLine => {
      const clientLineId = nonEmpty(line.customFields?.tallyClientLineId);
      const sku = nonEmpty(line.customFields?.tallyCustomSku) ?? nonEmpty(line.productVariant.sku);
      return {
        id: line.id,
        ...(clientLineId ? { clientLineId } : {}),
        // The order query selects no product id; variantId names the sellable.
        variantId: line.productVariant.id,
        name: nonEmpty(line.customFields?.tallyCustomName) ?? line.productVariant.name,
        ...(sku ? { sku } : {}),
        quantity: line.quantity,
        subtotalMinor: line.linePrice,
        subtotalTaxMinor: line.linePriceWithTax - line.linePrice,
        totalMinor: line.proratedLinePrice,
        taxMinor: line.proratedLinePriceWithTax - line.proratedLinePrice,
      };
    }),
    fees: order.surcharges.map((s) => ({ name: s.description, totalMinor: s.price, taxMinor: s.priceWithTax - s.price })),
    shipping: order.shippingLines.map((l) => ({
      name: l.shippingMethod.name, totalMinor: l.discountedPrice, taxMinor: l.discountedPriceWithTax - l.discountedPrice,
    })),
    // Vendure's couponCodes carry no amount and its discounts name no coupon, so no coupon line can be built; the discount is in the line totals and discountMinor.
    coupons: [],
    taxLines: order.taxSummary.map((t) => ({ label: t.description, ratePpm: Math.round(t.taxRate * 10000), amountMinor: t.taxTotal })),
    // Vendure records a discount as a negative amount.
    discountMinor: order.discounts.reduce((sum, d) => sum - d.amount, 0),
    discountTaxMinor: order.discounts.reduce((sum, d) => sum - (d.amountWithTax - d.amount), 0),
    taxMinor: order.totalWithTax - order.total,
    totalMinor: order.totalWithTax,
    // No title or kind: a Vendure payment names only its method code.
    payments: (order.payments ?? []).filter((p) => !UNPAID_PAYMENT_STATES.includes(p.state)).map((p) => ({ method: p.method, amountMinor: p.amount })),
    refunds: (order.payments ?? []).flatMap((p) => p.refunds).filter((r) => r.state !== 'Failed').map((r) => {
      const reason = nonEmpty(r.reason);
      return { id: r.id, amountMinor: r.total, ...(reason ? { reason } : {}) };
    }),
  };
}

const wholeNumber = (value: number | undefined, fallback: number) => (value === undefined || !Number.isFinite(value) ? fallback : Math.trunc(value));

/** Vendure order history (ADR-081), read-only through the Admin API; needs the ReadOrder permission. */
export function createVendureOrders(options: { pricesIncludeTax?: boolean; tallyFields?: boolean } = {}): Required<Pick<TallyConnector, 'listOrders' | 'getOrders'>> {
  const tally = options.tallyFields === false ? { tallyFields: false } : {};
  const pricesIncludeTax = options.pricesIncludeTax === true;
  return {
    async listOrders(context: SyncContext, query = {}) {
      const page = Math.max(1, wholeNumber(query.page, 1));
      const perPage = Math.max(1, Math.min(100, wholeNumber(query.perPage, 25)));
      const skip = (page - 1) * perPage;
      const search = query.search?.trim();
      const { items, totalItems } = await listVendureOrderDetails(context, { skip, take: perPage, ...(search ? { search } : {}), ...tally });
      return { orders: items.map((o) => toVendureStoreOrder(o, pricesIncludeTax)), hasMore: skip + items.length < totalItems };
    },

    async getOrders(context: SyncContext, ids: readonly string[]) {
      const wanted = [...new Set(ids.filter((id) => id.length > 0))];
      const orders: StoreOrder[] = [];
      for (const id of wanted) {
        const order = await getVendureOrder(context, id, options.tallyFields === false ? { tallyFields: false } : undefined);
        if (order === null) continue;
        // Never placed: a cart, not order history.
        if (order.orderPlacedAt === null) continue;
        orders.push(toVendureStoreOrder(order, pricesIncludeTax));
      }
      return orders;
    },
  };
}
