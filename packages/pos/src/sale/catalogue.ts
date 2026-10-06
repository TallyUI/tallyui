import { findVariantByCode, formatMoney, resolvePrice } from '@tallyui/core';
import type { ProductTraits, TraitContext, VariantSummary } from '@tallyui/core';

export type CatalogueEntry<Doc> = { product: Doc; variant: VariantSummary };

/** Variants in product/variant order, passing context through; without getVariants,
 * simple products use their own traits and products with variants contribute no entries. */
export function catalogueEntries<Doc>(products: Doc[], traits: ProductTraits<Doc>, context?: TraitContext): CatalogueEntry<Doc>[] {
  return products.flatMap((product) => {
    const variants = traits.getVariants ? traits.getVariants(product, context)
      : traits.hasVariants(product) ? [] : [{
        id: traits.getId(product), sku: traits.getSku(product), barcode: traits.getBarcode(product),
        prices: traits.getPrices(product, context), stock: traits.getStock(product),
      }];
    return variants.map((variant) => ({ product, variant }));
  });
}

/** Barcode-then-SKU lookup across all products. */
export function findEntryByCode<Doc>(entries: CatalogueEntry<Doc>[], code: string): CatalogueEntry<Doc> | undefined {
  const variant = findVariantByCode(entries.map((entry) => entry.variant), code);
  return variant ? entries.find((entry) => entry.variant === variant) : undefined;
}

/** Display the resolved price in the requested currency. */
export function variantPriceLabel(variant: VariantSummary, currency: string, locale?: string): string | undefined {
  const price = resolvePrice(variant.prices, currency);
  return price ? formatMoney(price.current, locale) : undefined;
}
