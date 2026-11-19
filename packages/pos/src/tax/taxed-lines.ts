import type { TaxRounding } from '@tallyui/core';

/** The lines and charges `taxLinesByRate` splits, each in the tax mode its tax was rounded in (ADR-065: the
 *  receipt's figures, which every per-rate split must equal). Under `woocommerce` rounding a line with `netMicros`
 *  is in the store's mode, since WooCommerce rounds every line that way. Otherwise a line keeps its own mode, and
 *  a line without one is in the store's; a charge outside `woocommerce` keeps its `amountIncludesTax`, else the store's. */
export function taxedLinesFor<L extends { netMicros?: string; taxInclusive?: boolean }, C>(
  lines: readonly L[], charges: readonly (C & { amountIncludesTax?: boolean })[], pricesIncludeTax: boolean, rounding?: TaxRounding,
): Array<(L | C) & { taxInclusive: boolean }> {
  return [...lines.map((line) => ({ ...line, taxInclusive: rounding?.granularity === 'woocommerce' && line.netMicros !== undefined
    ? pricesIncludeTax : line.taxInclusive ?? pricesIncludeTax })),
  ...charges.map((charge) => ({ ...charge, taxInclusive: rounding?.granularity === 'woocommerce'
    ? pricesIncludeTax : charge.amountIncludesTax ?? pricesIncludeTax }))];
}

/** The stored per-rate split a reader may use, or undefined to recompute it with `taxedLinesFor`. A
 *  WooCommerce-rounded sale with a converted line (`netMicros` and a stored `taxInclusive`) is always
 *  recomputed: before #834 its stored split used the line's own mode (ADR-065, amended 2026-11-17). */
export function recordedTaxByRate<T>(order: {
  taxByRate?: T; taxRounding?: TaxRounding;
  lines: readonly { netMicros?: string; taxInclusive?: boolean }[];
}): T | undefined {
  if (order.taxRounding?.granularity === 'woocommerce'
    && order.lines.some((line) => line.netMicros !== undefined && line.taxInclusive !== undefined)) return undefined;
  return order.taxByRate;
}
