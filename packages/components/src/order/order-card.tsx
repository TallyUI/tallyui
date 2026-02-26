import { Pressable, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

import { OrderStatusBadge, type OrderStatus } from './order-status-badge';

export interface OrderCardProps extends Omit<ViewProps, 'children'> {
  orderNumber: string;
  date: string;
  total: string;
  status: OrderStatus;
  customerName?: string;
  onPress?: () => void;
  className?: string;
}

export function OrderCard({
  orderNumber,
  date,
  total,
  status,
  customerName,
  onPress,
  className,
  ...viewProps
}: OrderCardProps) {
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      className={cn('gap-2 rounded-lg border border-border bg-surface p-3', className)}
      {...viewProps}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-foreground">{orderNumber}</Text>
        <OrderStatusBadge status={status} />
      </View>
      <View className="flex-row items-center justify-between">
        <View className="gap-0.5">
          <Text className="text-xs text-muted">{date}</Text>
          {customerName && <Text className="text-xs text-muted">{customerName}</Text>}
        </View>
        <Text className="text-sm font-semibold text-foreground">{total}</Text>
      </View>
    </Wrapper>
  );
}
