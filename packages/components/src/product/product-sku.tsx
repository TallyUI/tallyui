import { Text, type TextProps } from 'react-native';

import { useProductTraits } from '@tallyui/core';

export interface ProductSkuProps extends Omit<TextProps, 'children'> {
  /** The raw RxDB product document (connector-specific shape) */
  doc: any;
  /** Text to show when SKU is missing (defaults to '—') */
  fallback?: string;
}

/**
 * Displays a product's SKU.
 *
 * Reads the SKU from whatever field the active connector stores it in —
 * `doc.sku` for WooCommerce, `doc.variants[0].sku` for Medusa, etc.
 *
 * ```tsx
 * <ProductSku doc={productDocument} />
 * ```
 */
export function ProductSku({ doc, fallback = '—', ...textProps }: ProductSkuProps) {
  const { getSku } = useProductTraits();
  const sku = getSku(doc);

  return <Text {...textProps}>{sku ?? fallback}</Text>;
}
