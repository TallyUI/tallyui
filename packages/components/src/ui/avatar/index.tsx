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

const avatarFallbackVariants = cva('flex h-full w-full items-center justify-center', {
  variants: { tone: { muted: 'bg-muted', primary: 'bg-primary' } },
});

const avatarFallbackTextVariants = cva('text-sm font-medium', {
  variants: { tone: { muted: 'text-muted-foreground', primary: 'text-primary-foreground' } },
});

type AvatarProps = ViewProps & VariantProps<typeof avatarVariants> & {
  src?: string;
  alt?: string;
  fallback?: string;
  /**
   * The fallback's colours. `'primary'` is v2's look (light initials on a solid primary circle),
   * used by the Customers table and the customer dropdown.
   */
  tone?: 'muted' | 'primary';
};

/** Up to two words of `name`, the first letter of each, upper case. */
function avatarInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('');
}

function Avatar({ className, size, src, alt, fallback, tone = 'muted', ...props }: AvatarProps) {
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
        <View className={avatarFallbackVariants({ tone })}>
          <Text className={avatarFallbackTextVariants({ tone })}>
            {fallback ?? alt?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}
    </View>
  );
}

export { Avatar, avatarVariants, avatarInitials };
export type { AvatarProps };
