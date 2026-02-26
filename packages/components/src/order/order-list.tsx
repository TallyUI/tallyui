import type { ReactNode } from 'react';
import { ScrollView, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface OrderListProps extends Omit<ViewProps, 'children'> {
  items: any[];
  renderItem: (item: any, index: number) => ReactNode;
  headerSlot?: ReactNode;
  emptyState?: ReactNode;
  className?: string;
}

export function OrderList({
  items,
  renderItem,
  headerSlot,
  emptyState,
  className,
  ...viewProps
}: OrderListProps) {
  const hasItems = items.length > 0;

  return (
    <View className={cn('flex-1', className)} {...viewProps}>
      {headerSlot && <View className="px-3 py-2">{headerSlot}</View>}

      {hasItems ? (
        <ScrollView contentContainerClassName="gap-2 p-3">
          {items.map((item, index) => (
            <View key={item.id ?? index}>{renderItem(item, index)}</View>
          ))}
        </ScrollView>
      ) : (
        emptyState ?? null
      )}
    </View>
  );
}
