/** The part of a cart line the in-cart count reads (`LineItem` has all three). */
export type CartQuantityLine = { productId: string; quantity: number; custom?: true };

/**
 * Quantity per product id, summed across the product's lines, so a product with variants counts every
 * variant's lines; a custom line belongs to no catalogue product and counts for none.
 *
 * Ported from WCPOS v2 `useProductCount`, packages/core/src/screens/main/pos/products/rows/product-row.tsx
 * (MIT, WCPOS): the cashier reads how many are in the cart, not how many lines.
 */
export function cartQuantities(lines: readonly CartQuantityLine[]): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (line.custom) continue;
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  }
  return quantities;
}
