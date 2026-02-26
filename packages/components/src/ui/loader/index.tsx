import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { TextClassContext } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

const loaderVariants = cva('animate-spin', {
  variants: {
    size: {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-8 w-8',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

type LoaderProps = Omit<ViewProps, 'children'> & VariantProps<typeof loaderVariants>;

function Loader({ className, size, ...props }: LoaderProps) {
  const textClass = React.useContext(TextClassContext);

  return (
    <View
      className={cn(loaderVariants({ size }), textClass, className)}
      role="progressbar"
      {...props}
    >
      <View className="h-full w-full rounded-full border-2 border-current border-t-transparent" />
    </View>
  );
}

export { Loader, loaderVariants };
export type { LoaderProps };
