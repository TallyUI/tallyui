import type { TaxRounding } from '@tallyui/core';

/** The lines and charges `taxLinesByRate` splits, each in the tax mode its tax was rounded in (ADR-065: the
 *  receipt's figures, which every per-rate split must equal). Under `woocommerce` rounding a line with `netMicros`
 *  is in the store's mode, since WooCommerce rounds every line that way. Otherwise a line keeps its own mode, and
 *  a line without one, or a fee or shipping charge, is in the store's. */
export function taxedLinesFor<L extends { netMicros?: string; taxInclusive?: boolean }, C>(
  lines: readonly L[], charges: readonly C[], pricesIncludeTax: boolean, rounding?: TaxRounding,
): Array<(L | C) & { taxInclusive: boolean }> {
  return [...lines.map((line) => ({ ...line, taxInclusive: rounding?.granularity === 'woocommerce' && line.netMicros !== undefined
    ? pricesIncludeTax : line.taxInclusive ?? pricesIncludeTax })),
  ...charges.map((charge) => ({ ...charge, taxInclusive: pricesIncludeTax }))];
}
