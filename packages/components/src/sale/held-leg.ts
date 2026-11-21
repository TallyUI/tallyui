import type { Order } from '@tallyui/pos';

/** Money taken before this sale was reopened, or that the store holds: the till never voids, removes or re-references it (desk 2026-11-21). */
export function heldTillLeg(order: Order, leg: Order['payments'][number]): boolean {
  return !!leg.locked || !!leg.reopened || !!order.afterClose?.payments.some((p) => p.id === leg.id);
}
