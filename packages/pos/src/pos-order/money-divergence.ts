import { knownWarnings } from '@tallyui/core';
import type { PosOrder } from './types';

/** What the store computed differently on a sale, for a cashier's notice: the order figures (`figures_mismatch`) and
 * the lines (`line_figures_mismatch`, distinct `lineId`s in first-seen order). null when neither warning is known. */
export interface MoneyDivergence { orderFields: string[]; lineIds: string[] }

export function moneyDivergence(order: Pick<PosOrder, 'warnings'>): MoneyDivergence | null {
  const orderFields: string[] = [];
  const lineIds: string[] = [];
  for (const warning of knownWarnings(order.warnings)) {
    if (warning.code === 'figures_mismatch') {
      for (const { field } of warning.fields) if (!orderFields.includes(field)) orderFields.push(field);
    } else if (warning.code === 'line_figures_mismatch') {
      for (const { lineId } of warning.lines) if (!lineIds.includes(lineId)) lineIds.push(lineId);
    }
  }
  return orderFields.length === 0 && lineIds.length === 0 ? null : { orderFields, lineIds };
}
