import React from 'react';
import { Image as RNImage } from 'react-native';
import type { ImageRootProps, ContentFit } from './types';

const contentFitToResizeMode: Record<ContentFit, string> = {
  cover: 'cover',
  contain: 'contain',
  fill: 'stretch',
  none: 'center',
  'scale-down': 'contain',
};

export const Root = React.forwardRef<RNImage, ImageRootProps>(
  ({ source, alt, placeholder, contentFit = 'cover', style, ...props }, ref) => {
    return (
      <RNImage
        ref={ref}
        source={source}
        accessibilityLabel={alt}
        alt={alt}
        resizeMode={contentFitToResizeMode[contentFit] as any}
        defaultSource={placeholder as any}
        style={style}
        {...props}
      />
    );
  }
);
Root.displayName = 'ImageRoot';
