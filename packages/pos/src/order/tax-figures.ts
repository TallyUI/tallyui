import type { TaxRounding } from '@tallyui/core';
import { createOrderBuilder } from './order-builder';
import { taxLinesByRate } from '../tax/exact';

/** A sent line; `discountMinor` is its `lines[].discountMinor` (line discounts + its order share), in its own mode. */
export type BasketLine = { unitPriceMinor: number; quantity: number; discountMinor?: number; taxInclusive: boolean; taxLines: Array<{ code?: string; ratePpm: number }> };

/**
 * The till's settlement figures for a sent basket under a store's strategy (#287), computed exactly as a sale computes
 * them, so a backend can score its own orders against the till (vendurepos/app#38). Each discountMinor is applied as a
 * fixed line discount in the line's own mode.
 */
export function taxFiguresForBasket(currency: string, pricesIncludeTax: boolean, lines: readonly BasketLine[], rounding?: TaxRounding) {
  const code = currency.toUpperCase();
  const builder = createOrderBuilder({ currency: code, taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax, ...(rounding ? { rounding } : {}) } });
  lines.forEach((line, index) => {
    const lineId = builder.addLine({ productId: `line-${index}`, name: `Line ${index}`, quantity: line.quantity,
      unitPrice: { amount: line.unitPriceMinor, currency: code, taxInclusive: line.taxInclusive }, taxRates: line.taxLines });
    if (line.discountMinor) builder.applyLineDiscount(lineId, { type: 'fixed', value: line.discountMinor });
  });
  const { subtotalMinor, taxMinor, totalMinor, lineItems, taxRounding } = builder.getSnapshot();
  return { subtotalMinor, taxMinor, totalMinor, taxByRate: taxLinesByRate(lineItems, taxMinor, undefined, taxRounding) };
}
