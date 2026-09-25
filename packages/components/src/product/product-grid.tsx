import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '@tallyui/theme';
import { useProductTraits } from '@tallyui/core';
import { VStack, type VStackProps } from '../ui';

export interface ProductGridProps extends Omit<VStackProps, 'children'> {
  /** Array of product documents to render */
  items: any[];
  /** Render function for each product */
  renderItem: (item: any, index: number) => ReactNode;
  /** Number of columns in the grid (defaults to 2) */
  numColumns?: number;
  /** Search input slot rendered above the grid */
  searchSlot?: ReactNode;
  /** Filter slot rendered between search and grid */
  filterSlot?: ReactNode;
  /** Content shown when items is empty */
  emptyState?: ReactNode;
  /**
   * Products the channel doesn't sell (`traits.product.isSellable` false,
   * for example a Medusa product outside the sales channel) are hidden
   * unless `showUnsellable`.
   */
  showUnsellable?: boolean;
  className?: string;
}

/**
 * A scrollable product grid with optional search and filter slots.
 *
 * Uses ScrollView + flexWrap for cross-platform grid layout rather than
 * FlatList numColumns, which keeps things predictable in both native and web.
 *
 * ```tsx
 * <ProductGrid
 *   items={products}
 *   renderItem={(doc) => <ProductCard doc={doc} />}
 *   searchSlot={<SearchInput value={q} onChangeText={setQ} />}
 *   numColumns={3}
 * />
 * ```
 */
export function ProductGrid({
  items,
  renderItem,
  numColumns = 2,
  searchSlot,
  filterSlot,
  emptyState,
  showUnsellable = false,
  className,
  ...viewProps
}: ProductGridProps) {
  // No <ConnectorProvider> above (e.g. a fixture with no connector): traits
  // are unavailable, so nothing is filtered.
  let traits: ReturnType<typeof useProductTraits> | undefined;
  try {
    traits = useProductTraits();
  } catch {
    traits = undefined;
  }

  const visibleItems = showUnsellable || !traits ? items : items.filter((item) => traits!.isSellable(item));
  const hasItems = visibleItems.length > 0;

  return (
    <VStack space="none" className={cn('flex-1', className)} {...viewProps}>
      {searchSlot && <View className="px-3 py-2">{searchSlot}</View>}
      {filterSlot && <View className="px-3 pb-2">{filterSlot}</View>}

      {hasItems ? (
        <ScrollView contentContainerClassName="flex-row flex-wrap p-1">
          {visibleItems.map((item, index) => (
            <View key={item.id ?? index} style={{ width: `${100 / numColumns}%` }} className="p-1">
              {renderItem(item, index)}
            </View>
          ))}
        </ScrollView>
      ) : (
        emptyState ?? null
      )}
    </VStack>
  );
}
