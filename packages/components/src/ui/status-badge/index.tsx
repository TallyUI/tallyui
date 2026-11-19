import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { cva, type VariantProps } from 'class-variance-authority';
import { Text, TextClassContext } from '../text';

const statusDotVariants = cva('shrink-0 rounded-full', {
  variants: {
    size: { default: 'size-2', caption: 'size-1.5' },
    variant: {
      default: 'bg-primary',
      ok: 'bg-success',
      warning: 'bg-warning',
      bad: 'bg-destructive',
      info: 'bg-info',
      muted: 'bg-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

type StatusBadgeProps = ViewProps & VariantProps<typeof statusDotVariants> & {
  /** The word naming the state; it keeps the foreground colour. */
  label: string;
};

// The dot carries the status colour and the word keeps the foreground, so a status never reads by
// colour alone (WCPOS v2 `status-badge`); `caption` is a row's state line and a log level.
function StatusBadge({ label, variant, size, className, ...props }: StatusBadgeProps) {
  return (
    <View className={cn('flex-row items-center gap-1.5', className)} {...props}>
      <View aria-hidden className={statusDotVariants({ variant, size })} />
      <TextClassContext.Provider value={undefined}>
        <Text className={cn('shrink', size === 'caption' ? 'text-xs text-muted-foreground' : 'text-sm text-foreground')}>
          {label}
        </Text>
      </TextClassContext.Provider>
    </View>
  );
}

export { StatusBadge, statusDotVariants };
export type { StatusBadgeProps };
