import { Image, type ImageProps, type ImageStyle, type StyleProp } from 'react-native';

import { useProductTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';

export interface ProductImageProps extends Omit<ImageProps, 'source'> {
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
  const { getImageUrl } = useProductTraits();
  const imageUrl = getImageUrl(doc);

  if (!imageUrl) {
    return null; // TODO: placeholder image
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      className={cn('rounded', className)}
      style={[{ width: size, height: size }, style]}
      {...imageProps}
    />
  );
}
