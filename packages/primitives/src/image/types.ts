import type { ImageProps as RNImageProps, ImageSourcePropType } from 'react-native';

export type ContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

export interface ImageRootProps extends Omit<RNImageProps, 'resizeMode'> {
  source: ImageSourcePropType;
  alt?: string;
  placeholder?: ImageSourcePropType;
  contentFit?: ContentFit;
}
