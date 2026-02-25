import type { ReactNode } from 'react';
import { ScrollView, View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';

export interface ProductGridProps extends Omit<ViewProps, 'children'> {
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
  className,
  ...viewProps
}: ProductGridProps) {
  const hasItems = items.length > 0;

  return (
    <View className={cn('flex-1', className)} {...viewProps}>
      {searchSlot && <View className="px-3 py-2">{searchSlot}</View>}
      {filterSlot && <View className="px-3 pb-2">{filterSlot}</View>}

      {hasItems ? (
        <ScrollView contentContainerClassName="flex-row flex-wrap p-1">
          {items.map((item, index) => (
            <View key={item.id ?? index} style={{ width: `${100 / numColumns}%` }} className="p-1">
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
