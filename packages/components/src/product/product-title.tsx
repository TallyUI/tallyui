import { Text, type TextProps } from 'react-native';

import { useProductTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';

export interface ProductTitleProps extends Omit<TextProps, 'children'> {
  /** The raw RxDB product document (connector-specific shape) */
  doc: any;
  className?: string;
}

/**
 * Displays a product's name.
 *
 * Works with any connector — it uses the active connector's product traits
 * to extract the name from the document, regardless of whether the underlying
 * field is called `name` (WooCommerce) or `title` (Medusa).
 *
 * ```tsx
 * <ProductTitle doc={productDocument} className="text-lg font-bold" />
 * ```
 */
export function ProductTitle({ doc, className, ...textProps }: ProductTitleProps) {
  const { getName } = useProductTraits();
  return (
    <Text className={cn('text-base font-semibold text-foreground', className)} {...textProps}>
      {getName(doc)}
    </Text>
  );
}
