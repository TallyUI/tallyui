import { Text, type TextProps } from 'react-native';

import { useProductTraits } from '@tallyui/core';

export interface ProductPriceProps extends Omit<TextProps, 'children'> {
  /** The raw RxDB product document (connector-specific shape) */
  doc: any;
  /** Currency symbol to prepend (defaults to '$') */
  currencySymbol?: string;
}

/**
 * Displays a product's price.
 *
 * Works with any connector — extracts price via traits regardless
 * of whether it's a string field (WooCommerce) or derived from
 * variant pricing (Medusa).
 *
 * ```tsx
 * <ProductPrice doc={productDocument} currencySymbol="$" />
 * ```
 */
export function ProductPrice({ doc, currencySymbol = '$', ...textProps }: ProductPriceProps) {
  const { getPrice, isOnSale, getSalePrice, getRegularPrice } = useProductTraits();
  const price = getPrice(doc);

  if (!price) {
    return <Text {...textProps}>-</Text>;
  }

  if (isOnSale(doc)) {
    const salePrice = getSalePrice(doc);
    const regularPrice = getRegularPrice(doc);
    return (
      <Text {...textProps}>
        {currencySymbol}{salePrice ?? price}
        {regularPrice ? ` (was ${currencySymbol}${regularPrice})` : ''}
      </Text>
    );
  }

  return <Text {...textProps}>{currencySymbol}{price}</Text>;
}
