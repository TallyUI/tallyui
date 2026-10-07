import { resolvePrice, type ProductTraits } from '@tallyui/core';
import type { OrderBuilder } from '../order';
import { regularUnitPriceMinor } from '../order/order-builder';
import type { CatalogueEntry } from './catalogue';

export class CartError extends Error {}

export function addEntryToCart<Doc>(builder: OrderBuilder, entry: CatalogueEntry<Doc>,
  traits: ProductTraits<Doc>, currency: string): string {
  const { product, variant } = entry;
  const existing = builder.getSnapshot().lineItems.find((line) => line.variantId === variant.id);
  if (existing) {
    builder.updateQuantity(existing.id, existing.quantity + 1);
    return existing.id;
  }
  const name = traits.getName(product) + (traits.getVariantCount(product) > 1 ? ` · ${variant.title}` : '');
  const resolved = resolvePrice(variant.prices, currency);
  if (!resolved) throw new CartError(`No ${currency} price for ${name}`);
  const unitPrice = resolved.current, regularPrice = regularUnitPriceMinor(resolved);
  return builder.addLine({
    productId: traits.getId(product), variantId: variant.id, name,
    sku: variant.sku ?? '', imageUrl: traits.getImageUrl?.(product), unitPrice,
    ...(regularPrice !== undefined ? { regularUnitPriceMinor: regularPrice } : {}),
    taxClass: traits.getTaxClass?.(product, variant.id),
    ...(traits.getTaxStatus?.(product, variant.id) === 'none' ? { taxStatus: 'none' as const } : {}),
  });
}
