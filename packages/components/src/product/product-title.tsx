import { Text, type TextProps } from 'react-native';

import { useProductTraits } from '@tallyui/core';

export interface ProductTitleProps extends Omit<TextProps, 'children'> {
  /** The raw RxDB product document (connector-specific shape) */
  doc: any;
}

/**
 * Displays a product's name.
 *
 * Works with any connector — it uses the active connector's product traits
 * to extract the name from the document, regardless of whether the underlying
 * field is called `name` (WooCommerce) or `title` (Medusa).
 *
 * ```tsx
 * <ProductTitle doc={productDocument} style={{ fontSize: 18 }} />
 * ```
 */
export function ProductTitle({ doc, ...textProps }: ProductTitleProps) {
  const { getName } = useProductTraits();
  return <Text {...textProps}>{getName(doc)}</Text>;
}
