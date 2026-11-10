import type { Order, ParkedOrderSummary } from '../order';

/** One tab of the till's open sales: the current sale or a parked draft (v2 cart/tabs.tsx). */
export interface OpenSale {
  id: string;
  customerName?: string;
  itemCount: number;
  firstItem?: string;
  totalMinor: number;
  paidMinor: number;
  balanceDueMinor: number;
  /** The sale on the till now. */
  current: boolean;
}

/** v2 cart/tab-chip.tsx: captured money and a balance still due. */
export function isPartlyPaid(sale: Pick<OpenSale, 'paidMinor' | 'balanceDueMinor'>): boolean {
  return sale.paidMinor > 0 && sale.balanceDueMinor > 0;
}

/**
 * The current sale (when it has lines, fees or shipping; a blank cart is no tab) and the parked drafts, in creation
 * order: sorted by id with numeric collation, so a tab keeps its place across switches (a re-park changes
 * `parkedAt`, never the id). A draft with the current sale's id is that sale and is skipped.
 */
export function openSales(order: Order, parked: readonly ParkedOrderSummary[]): OpenSale[] {
  const live = order.lineItems.length > 0 || !!order.fees?.length || !!order.shipping?.length;
  const sales: OpenSale[] = parked.filter((draft) => draft.id !== order.id).map((draft) => ({
    id: draft.id, customerName: draft.customerName, itemCount: draft.itemCount, firstItem: draft.firstItem,
    totalMinor: draft.totalMinor, paidMinor: draft.paidMinor ?? 0, balanceDueMinor: draft.balanceDueMinor ?? 0, current: false,
  }));
  if (live) {
    sales.push({
      id: order.id, customerName: order.customer?.name || undefined, itemCount: order.lineItems.length,
      firstItem: order.lineItems[0]?.name, totalMinor: order.totalMinor, paidMinor: order.paidMinor,
      balanceDueMinor: order.balanceDueMinor, current: true,
    });
  }
  return sales.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
