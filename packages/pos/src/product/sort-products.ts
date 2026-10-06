import { resolvePrice, resolvePriceRange, type ProductTraits, type TraitContext } from '@tallyui/core';

/** A sort on one field: ascending or descending. */
export interface ProductSort { field: string; dir: 'asc' | 'desc' }
export type ProductSortValue = string | number | undefined;
/** The fields productSortValue knows, in the default column order. */
export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'barcode', 'price', 'stock', 'category'] as const;

export function productSortValue<Doc>(
  doc: Doc, field: string, traits: ProductTraits<Doc>, context?: TraitContext,
): ProductSortValue {
  let value: ProductSortValue;
  switch (field) {
    case 'name': value = traits.getName(doc); break;
    case 'sku': value = traits.getSku(doc); break;
    case 'barcode': value = traits.getBarcode(doc); break;
    case 'price': {
      const variants = traits.getVariants?.(doc, context);
      value = variants && variants.length >= 2
        ? resolvePriceRange(variants, context?.currency)?.min.amount
        : resolvePrice(traits.getPrices(doc, context), context?.currency)?.current.amount;
      break;
    }
    case 'stock': value = traits.getStock(doc).quantity; break;
    case 'category': value = traits.getCategoryNames(doc).join(', '); break;
    default: return undefined;
  }
  return value === '' ? undefined : value;
}

export function sortProducts<Doc>(
  docs: Doc[], sort: ProductSort | null | undefined,
  valueOf: (doc: Doc, field: string) => ProductSortValue,
): Doc[] {
  if (!sort) return docs;
  return docs.map((doc, index) => ({ doc, index, value: valueOf(doc, sort.field) }))
    .sort((a, b) => {
      const aMissing = a.value === undefined || a.value === '';
      const bMissing = b.value === undefined || b.value === '';
      if (aMissing || bMissing) {
        return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1;
      }
      const av = a.value!;
      const bv = b.value!;
      const comparison = typeof av === 'number'
        ? (typeof bv === 'number' ? av - bv : -1)
        : (typeof bv === 'number' ? 1 : av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }));
      return (sort.dir === 'desc' ? -comparison : comparison) || a.index - b.index;
    })
    .map(({ doc }) => doc);
}
