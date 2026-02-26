import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

const iconVariants = cva('items-center justify-center', {
  variants: {
    size: {
      xs: 'h-3 w-3',
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
      xl: 'h-8 w-8',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

type IconProps = ViewProps & VariantProps<typeof iconVariants>;

const Icon = React.forwardRef<View, IconProps>(function Icon(
  { className, size, children, ...props },
  ref
) {
  const textClass = React.useContext(TextClassContext);

  return (
    <View
      ref={ref}
      className={cn(iconVariants({ size }), textClass, className)}
      {...props}
    >
      {children}
    </View>
  );
});

Icon.displayName = 'Icon';

export { Icon, iconVariants };
export type { IconProps };
