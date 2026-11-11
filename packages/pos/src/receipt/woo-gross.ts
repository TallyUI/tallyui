import { minorUnitDigits, woocommerceTax } from '@tallyui/core';
import type { PosOrder } from '../pos-order/types';

/**
 * A stored WooCommerce line's rounded gross (its builder `totalMinor`, which PosOrder lines do not keep), as
 * woocommerce-tax.ts lineAmounts computes it from the 6dp net and per-rate taxes, read back from the stored micros as
 * woocommerceTotals reads them (ADR-076).
 */
export function wooGrossMinor(
  line: PosOrder['lines'][number], order: Pick<PosOrder, 'currency' | 'pricesIncludeTax'>, roundAtSubtotal: boolean,
): number {
  const dp = minorUnitDigits(order.currency), factor = 10 ** dp;
  const tax = line.taxLines.reduce((sum, row) => sum + (roundAtSubtotal ? Number(row.taxMicros) / (factor * 1e6)
    : woocommerceTax.roundTaxTotal(Number(row.taxMicros) / (factor * 1e6), dp, order.pricesIncludeTax)), 0);
  return Math.round(woocommerceTax.roundHalfUp(Number(line.netMicros) / (factor * 1e6) + tax, dp) * factor);
}
