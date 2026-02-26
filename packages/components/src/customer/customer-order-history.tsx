import type { ReactNode } from 'react';
import { ScrollView, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface CustomerOrderHistoryProps extends Omit<ViewProps, 'children'> {
  orders: any[];
  renderItem: (order: any, index: number) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
}

export function CustomerOrderHistory({
  orders,
  renderItem,
  emptyState,
  className,
  ...viewProps
}: CustomerOrderHistoryProps) {
  return (
    <View className={cn('flex-1', className)} {...viewProps}>
      <Text className="px-3 py-2 text-xs font-semibold text-muted">Order History</Text>
      {orders.length > 0 ? (
        <ScrollView contentContainerClassName="gap-2 px-3 pb-3">
          {orders.map((order, index) => (
            <View key={order.id ?? index}>{renderItem(order, index)}</View>
          ))}
        </ScrollView>
      ) : (
        emptyState ?? null
      )}
    </View>
  );
}
