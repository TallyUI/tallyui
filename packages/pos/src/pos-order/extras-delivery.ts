import { editedSku, sendableMeta, sendableTaxIds } from './command';
import type { PosOrder } from './types';

export interface ExtrasNotSent { taxIds: boolean; meta: boolean; skuLineIds: string[] }

/** ADR-092 condition 1: which of a sale's tax ids, meta and edited SKUs went below order.create 12, so the store never got them. */
export function extrasNotSent(order: Pick<PosOrder, 'customer' | 'meta' | 'lines' | 'sentVersion'>): ExtrasNotSent {
  if (order.sentVersion === undefined || order.sentVersion >= 12) return { taxIds: false, meta: false, skuLineIds: [] };
  return {
    taxIds: sendableTaxIds(order.customer?.taxIds).length > 0,
    meta: sendableMeta(order.meta).length > 0,
    skuLineIds: order.lines.filter(editedSku).map((line) => line.id),
  };
}
