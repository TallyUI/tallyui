import * as React from 'react';
import { Image, View, Text, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

const avatarVariants = cva('relative overflow-hidden rounded-full', {
  variants: {
    size: {
      sm: 'h-8 w-8',
      md: 'h-10 w-10',
      lg: 'h-12 w-12',
      xl: 'h-16 w-16',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

type AvatarProps = ViewProps & VariantProps<typeof avatarVariants> & {
  src?: string;
  alt?: string;
  fallback?: string;
};

function Avatar({ className, size, src, alt, fallback, ...props }: AvatarProps) {
  const [hasError, setHasError] = React.useState(false);

  return (
    <View className={cn(avatarVariants({ size }), className)} {...props}>
      {src && !hasError ? (
        <Image
          source={{ uri: src }}
          accessibilityLabel={alt}
          onError={() => setHasError(true)}
          className="h-full w-full"
        />
      ) : (
        <View className="flex h-full w-full items-center justify-center bg-muted">
          <Text className="text-sm font-medium text-muted-foreground">
            {fallback ?? alt?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}
    </View>
  );
}

export { Avatar, avatarVariants };
export type { AvatarProps };
