import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface DiscountBadgeProps extends Omit<ViewProps, 'children'> {
  label: string;
  className?: string;
}

export function DiscountBadge({ label, className, ...viewProps }: DiscountBadgeProps) {
  return (
    <View
      className={cn('flex-row items-center self-start gap-1 rounded-md bg-sale/15 px-1.5 py-0.5', className)}
      {...viewProps}
    >
      <Text className="text-xs font-semibold text-sale">{label}</Text>
    </View>
  );
}
