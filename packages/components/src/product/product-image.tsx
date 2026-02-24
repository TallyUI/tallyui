import { Image, type ImageProps, type ImageStyle, type StyleProp } from 'react-native';

import { useProductTraits } from '@tallyui/core';

export interface ProductImageProps extends Omit<ImageProps, 'source'> {
  /** The raw RxDB product document */
  doc: any;
  /** Image dimensions */
  size?: number;
  /** Style overrides */
  style?: StyleProp<ImageStyle>;
}

/**
 * Displays a product's primary image.
 *
 * Falls back to a placeholder if no image is available.
 *
 * ```tsx
 * <ProductImage doc={productDocument} size={80} />
 * ```
 */
export function ProductImage({ doc, size = 60, style, ...imageProps }: ProductImageProps) {
  const { getImageUrl } = useProductTraits();
  const imageUrl = getImageUrl(doc);

  if (!imageUrl) {
    return null; // TODO: placeholder image
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={[{ width: size, height: size, borderRadius: 4 }, style]}
      {...imageProps}
    />
  );
}
