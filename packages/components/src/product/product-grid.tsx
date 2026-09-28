import type { ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import { cn } from '@tallyui/theme';
import { useProductTraits } from '@tallyui/core';
import { VStack, type VStackProps } from '../ui';

// Limit initial mounts for a 2,000-product catalogue to eight rows.
const INITIAL_ROWS = 8;
// Keep each render batch small for a 2,000-product catalogue.
const BATCH_ROWS = 8;
// Keep nearby rows mounted without rendering the whole 2,000-product catalogue.
const WINDOW_SIZE = 5;

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
 * A virtualized product grid with optional search and filter slots.
 *
 * Uses FlatList numColumns to render rows near the viewport on native and web.
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
        <FlatList
          key={numColumns}
          data={visibleItems}
          numColumns={numColumns}
          keyExtractor={(item, index) => String(item.id ?? index)}
          contentContainerClassName="p-1"
          initialNumToRender={INITIAL_ROWS}
          maxToRenderPerBatch={BATCH_ROWS}
          windowSize={WINDOW_SIZE}
          renderItem={({ item, index }) => (
            <View style={{ width: `${100 / numColumns}%` }} className="p-1">
              {renderItem(item, index)}
            </View>
          )}
        />
      ) : (
        emptyState ?? null
      )}
    </VStack>
  );
}
