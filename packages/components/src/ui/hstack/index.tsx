import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

const hstackVariants = cva('flex-row items-center', {
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
      true: 'flex-row-reverse',
    },
  },
  defaultVariants: {
    space: 'md',
  },
});

type HStackProps = ViewProps & VariantProps<typeof hstackVariants>;

const HStack = React.forwardRef<View, HStackProps>(function HStack(
  { className, space, reversed, ...props },
  ref
) {
  return (
    <View
      ref={ref}
      className={cn(hstackVariants({ space, reversed }), className)}
      {...props}
    />
  );
});

HStack.displayName = 'HStack';

export { HStack, hstackVariants };
export type { HStackProps };
