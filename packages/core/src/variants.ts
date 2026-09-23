import type { VariantSummary } from './types';

/**
 * The variant whose barcode or SKU equals `code`, compared after trimming
 * both sides and ignoring case. A barcode match wins over a SKU match. When
 * several variants match the same way, the first one wins. Returns undefined
 * for an empty code or no match.
 */
export function findVariantByCode(variants: VariantSummary[], code: string): VariantSummary | undefined {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return undefined;
  return variants.find((variant) => variant.barcode?.trim().toLowerCase() === normalized)
    ?? variants.find((variant) => variant.sku?.trim().toLowerCase() === normalized);
}
