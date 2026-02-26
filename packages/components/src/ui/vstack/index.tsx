import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

const vstackVariants = cva('flex-col', {
  variants: {
    space: {
      none: 'gap-0',
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-3',
      lg: 'gap-4',
      xl: 'gap-6',
    },
    reversed: {
      true: 'flex-col-reverse',
    },
  },
  defaultVariants: {
    space: 'md',
  },
});

type VStackProps = ViewProps & VariantProps<typeof vstackVariants>;

const VStack = React.forwardRef<View, VStackProps>(function VStack(
  { className, space, reversed, ...props },
  ref
) {
  return (
    <View
      ref={ref}
      className={cn(vstackVariants({ space, reversed }), className)}
      {...props}
    />
  );
});

VStack.displayName = 'VStack';

export { VStack, vstackVariants };
export type { VStackProps };
