import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface OrderSummaryLineProps extends Omit<ViewProps, 'children'> {
  label: string;
  amount: string;
  bold?: boolean;
  className?: string;
}

export function OrderSummaryLine({ label, amount, bold = false, className, ...viewProps }: OrderSummaryLineProps) {
  return (
    <View className={cn('flex-row items-center justify-between', className)} {...viewProps}>
      <Text className={cn('text-sm', bold ? 'font-bold text-foreground' : 'text-muted-foreground')}>
        {label}
      </Text>
      <Text className={cn('text-sm', bold ? 'font-bold text-foreground' : 'text-foreground')}>
        {amount}
      </Text>
    </View>
  );
}
