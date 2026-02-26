import * as React from 'react';
import { Text, View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary',
        secondary: 'border-transparent bg-secondary',
        destructive: 'border-transparent bg-destructive',
        outline: 'border-border',
        success: 'border-transparent bg-success',
        warning: 'border-transparent bg-warning',
        info: 'border-transparent bg-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const badgeTextVariants = cva('text-xs font-semibold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      success: 'text-success-foreground',
      warning: 'text-warning-foreground',
      info: 'text-info-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type BadgeProps = ViewProps & VariantProps<typeof badgeVariants> & {
  label?: string;
};

function Badge({ className, variant, label, children, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      {label ? (
        <Text className={badgeTextVariants({ variant })}>{label}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export { Badge, badgeVariants, badgeTextVariants };
export type { BadgeProps };
