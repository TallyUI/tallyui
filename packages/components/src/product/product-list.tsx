import type { ReactNode } from 'react';
import { ScrollView, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface ProductListProps extends Omit<ViewProps, 'children'> {
  items: any[];
  renderItem: (item: any, index: number) => ReactNode;
  searchSlot?: ReactNode;
  filterSlot?: ReactNode;
  emptyState?: ReactNode;
  className?: string;
}

export function ProductList({
  items,
  renderItem,
  searchSlot,
  filterSlot,
  emptyState,
  className,
  ...viewProps
}: ProductListProps) {
  const hasItems = items.length > 0;

  return (
    <View className={cn('flex-1', className)} {...viewProps}>
      {searchSlot && <View className="px-3 py-2">{searchSlot}</View>}
      {filterSlot && <View className="px-3 pb-2">{filterSlot}</View>}

      {hasItems ? (
        <ScrollView className="flex-1">
          {items.map((item, index) => (
            <View key={item.id ?? index} className="border-b border-border">
              {renderItem(item, index)}
            </View>
          ))}
        </ScrollView>
      ) : (
        emptyState ?? null
      )}
    </View>
  );
}
