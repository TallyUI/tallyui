import type { StoreOrder, StoreOrderLine } from '@tallyui/core';
import { createOrderBuilder, type OrderBuilder } from './order-builder';
import type { TaxContext } from '../tax/types';
import { sendable, PAYLOAD_STRING_MAX, customerRefusal } from '../pos-order/command';

/** Why the till cannot rebuild a store order as a reopened cart (ADR-090 D7c5). */
export type StoreOrderRebuildReason =
  | 'currency' | 'tax_mode' | 'revision' | 'store_id' | 'refund' | 'payment_record' | 'coupon' | 'discount'
  | 'product' | 'quantity' | 'unit_price' | 'charge' | 'customer' | 'payment' | 'totals';

/** The cashier-facing text for each reason. */
export const STORE_ORDER_REBUILD_REFUSALS: Record<StoreOrderRebuildReason, string> = {
  currency: 'This order is in another currency',
  tax_mode: "This order's prices are taxed another way than the till's",
  revision: 'The store gave no revision for this order',
  store_id: 'The store gave no usable id for part of this order',
  refund: 'This order has a refund recorded',
  payment_record: "The till cannot read this order's payment records",
  coupon: 'This order has a coupon the till cannot rebuild',
  discount: 'This order has a discount the till cannot rebuild',
  product: 'A line of this order has no product',
  quantity: 'A line of this order has a quantity the till cannot rebuild',
  unit_price: 'A line of this order has a price that is not a whole amount per item',
  charge: 'A fee or shipping line of this order cannot be rebuilt',
  customer: "This order's customer cannot go on a sale",
  payment: 'A payment on this order cannot be carried',
  totals: "The till's total or tax for this order differs from the store's",
};

export class StoreOrderRebuildError extends Error {
  constructor(readonly reason: StoreOrderRebuildReason) {
    super(STORE_ORDER_REBUILD_REFUSALS[reason]);
    this.name = 'StoreOrderRebuildError';
  }
}

export function orderBuilderFromStoreOrder(read: StoreOrder, options: {
  currency: string;
  taxContext: TaxContext;
  /** The tax class and status the catalogue gives a read line; the read itself carries neither. */
  lineTax?: (line: StoreOrderLine) => { taxClass?: string; taxStatus?: 'taxable' | 'none' } | undefined;
}): OrderBuilder {
  if (read.currency.toUpperCase() !== options.currency.toUpperCase()) throw new StoreOrderRebuildError('currency');
  if (read.pricesIncludeTax !== options.taxContext.pricesIncludeTax) throw new StoreOrderRebuildError('tax_mode');
  if (!sendable(read.revision, PAYLOAD_STRING_MAX)) throw new StoreOrderRebuildError('revision');
  if (!sendable(read.id, 64) || (read.clientOrderId !== undefined && !sendable(read.clientOrderId, 64))
    || read.lines.some((line) => !sendable(line.id, 64))
    || [...read.fees, ...read.shipping].some((charge) => !sendable(charge.id, 64))
    || read.payments.some((payment) => !sendable(payment.id, 64))) throw new StoreOrderRebuildError('store_id');
  if (new Set([...read.lines, ...read.fees, ...read.shipping].map((item) => item.id)).size !== read.lines.length + read.fees.length + read.shipping.length
    || new Set(read.payments.map((payment) => payment.id)).size !== read.payments.length) throw new StoreOrderRebuildError('store_id');
  if (read.refunds.length > 0) throw new StoreOrderRebuildError('refund');
  if (read.paymentRecordUnreadable === true) throw new StoreOrderRebuildError('payment_record');
  if (read.coupons.length > 0) throw new StoreOrderRebuildError('coupon');
  if (read.discountMinor !== 0 || read.discountTaxMinor !== 0
    || read.lines.some((line) => line.totalMinor !== line.subtotalMinor || line.taxMinor !== line.subtotalTaxMinor))
    throw new StoreOrderRebuildError('discount');
  if (read.lines.some((line) => !line.productId)) throw new StoreOrderRebuildError('product');
  if (read.lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0)) throw new StoreOrderRebuildError('quantity');
  if (read.lines.some((line) => (line.subtotalMinor + (read.pricesIncludeTax ? line.subtotalTaxMinor : 0)) % line.quantity !== 0))
    throw new StoreOrderRebuildError('unit_price');
  if ([...read.fees, ...read.shipping].some((charge) => {
    const amount = charge.totalMinor + (read.pricesIncludeTax ? charge.taxMinor : 0);
    return charge.taxStatus === undefined || !charge.name.trim() || amount < 0 || !Number.isInteger(amount);
  })) throw new StoreOrderRebuildError('charge');
  if (read.customer?.id && customerRefusal(read.customer) !== null) throw new StoreOrderRebuildError('customer');
  if (read.payments.some((payment) => !Number.isInteger(payment.amountMinor) || payment.amountMinor <= 0
    || !sendable(payment.method, PAYLOAD_STRING_MAX))) throw new StoreOrderRebuildError('payment');

  const builder = createOrderBuilder({
    currency: options.currency, taxContext: options.taxContext,
    storeOrder: { id: read.id, revision: read.revision, ...(read.clientOrderId !== undefined ? { uuid: read.clientOrderId } : {}) },
  });
  for (const line of read.lines) {
    const tax = options.lineTax?.(line);
    builder.addLine({
      storeLineId: line.id, productId: line.productId!, name: line.name, quantity: line.quantity,
      ...(line.variantId !== undefined ? { variantId: line.variantId } : {}),
      ...(line.sku !== undefined ? { sku: line.sku } : {}),
      unitPrice: {
        amount: (line.subtotalMinor + (read.pricesIncludeTax ? line.subtotalTaxMinor : 0)) / line.quantity,
        currency: options.currency,
      },
      ...(tax?.taxClass !== undefined ? { taxClass: tax.taxClass } : {}),
      ...(tax?.taxStatus !== undefined ? { taxStatus: tax.taxStatus } : {}),
    });
  }
  if (read.customer?.id) builder.setCustomer({
    id: read.customer.id, name: read.customer.name ?? '', ...(read.customer.email ? { email: read.customer.email } : {}),
  });
  for (const charge of read.fees) builder.addFee({
    name: charge.name, amountMinor: charge.totalMinor + (read.pricesIncludeTax ? charge.taxMinor : 0),
    taxStatus: charge.taxStatus, storeLineId: charge.id,
    ...(charge.taxClass !== undefined ? { taxClass: charge.taxClass } : {}),
  });
  for (const charge of read.shipping) builder.addShipping({
    name: charge.name, amountMinor: charge.totalMinor + (read.pricesIncludeTax ? charge.taxMinor : 0),
    taxStatus: charge.taxStatus, storeLineId: charge.id,
    ...(charge.taxClass !== undefined ? { taxClass: charge.taxClass } : {}),
    ...(charge.methodId !== undefined ? { methodId: charge.methodId } : {}),
  });
  const snapshot = builder.getSnapshot();
  if (snapshot.totalMinor !== read.totalMinor || snapshot.taxMinor !== read.taxMinor) throw new StoreOrderRebuildError('totals');
  for (const payment of read.payments) builder.addPayment({
    method: 'external', amountMinor: payment.amountMinor, reference: payment.method,
    storePaymentId: payment.id, locked: true,
  });
  return builder;
}
