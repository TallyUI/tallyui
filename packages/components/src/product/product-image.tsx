import type { ImageStyle, StyleProp } from 'react-native';
import { Image } from '@tallyui/primitives';

import { useProductTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';

export interface ProductImageProps extends Omit<React.ComponentPropsWithoutRef<typeof Image.Root>, 'source'> {
  /** The raw RxDB product document */
  doc: any;
  /** Image dimensions */
  size?: number;
  /** Style overrides (for dynamic sizing) */
  style?: StyleProp<ImageStyle>;
  className?: string;
}

/**
 * Displays a product's primary image.
 *
 * Falls back to null if no image is available.
 *
 * ```tsx
 * <ProductImage doc={productDocument} size={80} className="rounded-lg" />
 * ```
 */
export function ProductImage({ doc, size = 60, style, className, ...imageProps }: ProductImageProps) {
  const { getImageUrl, getName } = useProductTraits();
  const imageUrl = getImageUrl(doc);

  if (!imageUrl) {
    return null; // TODO: placeholder image
  }

  return (
    <Image.Root
      source={{ uri: imageUrl }}
      alt={getName(doc)}
      className={cn('rounded', className)}
      style={[{ width: size, height: size }, style]}
      {...imageProps}
    />
  );
}
