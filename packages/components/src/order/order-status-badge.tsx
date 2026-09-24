import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export type OrderStatus = 'pending' | 'processing' | 'completed' | 'refunded' | 'cancelled';

export interface OrderStatusBadgeProps extends Omit<ViewProps, 'children'> {
  status: OrderStatus;
  className?: string;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; badge: string; dot: string; text: string }> = {
  pending: { label: 'Pending', badge: 'bg-warning/15', dot: 'bg-warning', text: 'text-foreground' },
  processing: { label: 'Processing', badge: 'bg-info/15', dot: 'bg-info', text: 'text-foreground' },
  completed: { label: 'Completed', badge: 'bg-success/15', dot: 'bg-success', text: 'text-foreground' },
  refunded: { label: 'Refunded', badge: 'bg-destructive/15', dot: 'bg-destructive', text: 'text-foreground' },
  cancelled: { label: 'Cancelled', badge: 'bg-muted/15', dot: 'bg-muted', text: 'text-muted-foreground' },
};

export function OrderStatusBadge({ status, className, ...viewProps }: OrderStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <View
      className={cn('flex-row items-center self-start gap-1.5 rounded-xl px-2 py-1', config.badge, className)}
      {...viewProps}
    >
      <View className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      <Text className={cn('text-xs font-semibold', config.text)}>{config.label}</Text>
    </View>
  );
}
