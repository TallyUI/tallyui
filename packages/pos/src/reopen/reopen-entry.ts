import type { StoreOrder, StoreOrderLine } from '@tallyui/core';
import type { OrderBuilder } from '../order/order-builder';
import type { TaxContext } from '../tax/types';
import { orderBuilderFromStoreOrder, StoreOrderRebuildError, type StoreOrderRebuildReason } from '../order/from-store-order';

// WooCommerce's status words, the only platform that offers order.reopen (ADR-090 decision 7).
// The store reopens any status, but the till refuses these three before sending (carryover item 23).
export const REOPEN_REFUSED_STATUSES: readonly string[] = ['cancelled', 'failed', 'trash'];

export type ReopenEntryReason = StoreOrderRebuildReason | 'status' | 'catalogue' | 'overpaid';

export class ReopenEntryError extends Error {
  constructor(readonly reason: ReopenEntryReason, message: string) {
    super(message);
    this.name = 'ReopenEntryError';
  }
}

export function storeOrderForReopen(read: StoreOrder, options: {
  currency: string;
  taxContext: TaxContext;
  /** The catalogue's tax class and status for a read line's product, or null when that product is no longer in the till's catalogue. */
  catalogue: (line: StoreOrderLine) => { taxClass?: string; taxStatus?: 'taxable' | 'none' } | null;
}): OrderBuilder {
  if (REOPEN_REFUSED_STATUSES.includes(read.status.toLowerCase())) {
    throw new ReopenEntryError('status', `An order that is ${read.status.toLowerCase()} cannot be reopened`);
  }
  const lineTaxes = new Map<StoreOrderLine, { taxClass?: string; taxStatus?: 'taxable' | 'none' }>();
  for (const line of read.lines) {
    if (!line.productId) continue;
    const tax = options.catalogue(line);
    if (tax === null) throw new ReopenEntryError('catalogue', `"${line.name}" is no longer in the till's catalogue`);
    lineTaxes.set(line, tax);
  }
  let builder: OrderBuilder;
  try {
    builder = orderBuilderFromStoreOrder(read, {
      currency: options.currency, taxContext: options.taxContext, lineTax: (line) => lineTaxes.get(line),
    });
  } catch (error) {
    if (error instanceof StoreOrderRebuildError) throw new ReopenEntryError(error.reason, error.message);
    throw error;
  }
  if (read.payments.reduce((sum, payment) => sum + payment.amountMinor, 0) > read.totalMinor) {
    throw new ReopenEntryError('overpaid', 'This order is paid more than its total');
  }
  return builder;
}
