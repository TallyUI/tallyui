import { View, type ImageStyle, type StyleProp } from 'react-native';
import { Image } from '@tallyui/primitives';

import { useProductTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text } from '../ui';

export interface ProductImageProps extends Omit<React.ComponentPropsWithoutRef<typeof Image.Root>, 'source'> {
  /** The raw RxDB product document */
  doc: any;
  /** Image dimensions */
  size?: number;
  /** Style overrides (for dynamic sizing) */
  style?: StyleProp<ImageStyle>;
  /**
   * Render a same-size tile with the product's initial when there is no
   * image, so rows and grids stay aligned. Defaults to false (render nothing).
   */
  showPlaceholder?: boolean;
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
export function ProductImage({ doc, size = 60, style, showPlaceholder = false, className, ...imageProps }: ProductImageProps) {
  const { getImageUrl, getName } = useProductTraits();
  const imageUrl = getImageUrl(doc);

  if (!imageUrl) {
    if (!showPlaceholder) return null;
    const name = getName(doc);
    return (
      <View
        role="img"
        aria-label={name}
        className={cn('items-center justify-center rounded bg-muted', className)}
        style={{ width: size, height: size }}
      >
        <Text className="font-semibold text-muted-foreground" style={{ fontSize: size * 0.4 }}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      </View>
    );
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
