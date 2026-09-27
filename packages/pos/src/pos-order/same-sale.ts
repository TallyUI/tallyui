import type { PosOrder } from './types';

type SaleContent = Pick<PosOrder, 'totalMinor' | 'currency' | 'lines' | 'payments'>;

/**
 * Whether two orders carry the same money-bearing content: `totalMinor` and `currency`; each line's
 * `id`, `quantity` and `netMinor`, in order; each payment's `method` and `amountMinor`, in order.
 * An order `id` is minted once per sale (`finalizeOrder`), so the same `id` with other content is a defect.
 */
export function sameSale(stored: SaleContent, retried: SaleContent): boolean {
  return stored.totalMinor === retried.totalMinor && stored.currency === retried.currency
    && stored.lines.length === retried.lines.length
    && stored.lines.every((line, i) => { const other = retried.lines[i];
      return line.id === other.id && line.quantity === other.quantity && line.netMinor === other.netMinor; })
    && stored.payments.length === retried.payments.length
    && stored.payments.every((payment, i) => payment.method === retried.payments[i].method
      && payment.amountMinor === retried.payments[i].amountMinor);
}

/** A stored order has this order's `id` but other money-bearing content (see `sameSale`): never treated as stored. */
export class OrderContentMismatchError extends Error {
  constructor(readonly orderId: string) {
    super(`Order ${orderId} is already stored with different content`);
    this.name = 'OrderContentMismatchError';
  }
}
