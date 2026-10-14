import { resolvePrice, type ProductTraits } from '@tallyui/core';
import type { OrderBuilder } from '../order';
import { regularUnitPriceMinor, samePicks } from '../order/order-builder';
import type { CatalogueEntry } from './catalogue';

export class CartError extends Error {}

export function addEntryToCart<Doc>(builder: OrderBuilder, entry: CatalogueEntry<Doc>,
  traits: ProductTraits<Doc>, currency: string): string {
  const { product, variant } = entry;
  const picks = entry.picks ?? {};
  const groups = Object.keys(picks).length ? traits.getVariantOptions?.(product) ?? [] : [];
  // Only a local group (no id) the variant leaves as "Any" can be picked, and only with one of its values (#495).
  const position = (name: string) => groups.findIndex((group) => group.id === undefined && group.name === name);
  for (const [name, value] of Object.entries(picks)) {
    const group = groups[position(name)];
    if (!group || Object.keys(variant.options ?? {}).includes(name)) throw new Error(`addEntryToCart: ${name} is not an Any option of this variant`);
    if (typeof value !== 'string' || !value || !group.values.includes(value)) throw new Error(`addEntryToCart: ${value} is not a value of ${name}`);
  }
  const anyAttributes = Object.keys(picks).sort((a, b) => position(a) - position(b));
  const attributes = { ...variant.options, ...Object.fromEntries(anyAttributes.map((name) => [name, picks[name]])) };
  const existing = builder.getSnapshot().lineItems.find((line) => line.variantId === variant.id && samePicks(line, { anyAttributes, attributes }));
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
    ...(Object.keys(attributes).length ? { attributes } : {}),
    ...(anyAttributes.length ? { anyAttributes } : {}),
    sku: variant.sku ?? '', imageUrl: traits.getImageUrl?.(product), unitPrice,
    ...(regularPrice !== undefined ? { regularUnitPriceMinor: regularPrice } : {}),
    taxClass: traits.getTaxClass?.(product, variant.id),
    ...(traits.getTaxStatus?.(product, variant.id) === 'none' ? { taxStatus: 'none' as const } : {}),
  });
}
