import { useMemo, useState, type JSX, type ReactNode } from 'react';
import { FlatList, Pressable, View, type ViewProps } from 'react-native';
import { useProductTraits, useTraitContext, useStockOverlaid, type ProductTraits, type TraitContext } from '@tallyui/core';
import { productSortValue, sortProducts, type ProductSort, type ProductSortValue } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Text, VStack } from '../ui';
import { ProductTitle } from './product-title';
import { ProductSku } from './product-sku';
import { ProductPrice } from './product-price';
import { ProductStockBadge } from './product-stock-badge';

// Limit initial mounts for a 2,000-product catalogue to eight rows.
const INITIAL_ROWS = 8;
// Keep each render batch small for a 2,000-product catalogue.
const BATCH_ROWS = 8;
// Keep nearby rows mounted without rendering the whole 2,000-product catalogue.
const WINDOW_SIZE = 5;

export interface ProductTableColumn<Doc = any> {
  /** Stable id; the default columns use PRODUCT_SORT_FIELDS. */
  id: string;
  /** Header label. */
  header: string;
  render: (doc: Doc) => ReactNode;
  /** The value the header sort orders by; omit to make the column unsortable. */
  sortValue?: (doc: Doc) => ProductSortValue;
  /** Flex weight of the column; default 1. */
  flex?: number;
}

export interface ProductTableProps extends Omit<ViewProps, 'children'> {
  items: any[];
  /** Default: trait columns with a ConnectorProvider, else none. */
  columns?: ProductTableColumn[];
  /** Controlled sort when not undefined (null = no sort). */
  sort?: ProductSort | null;
  /** Initial sort when uncontrolled; default null. */
  defaultSort?: ProductSort | null;
  onSortChange?: (sort: ProductSort | null) => void;
  /** Sort rows here (default true); false leaves ordering to the app. */
  sortItems?: boolean;
  onSelect?: (doc: any) => void;
  searchSlot?: ReactNode;
  filterSlot?: ReactNode;
  emptyState?: ReactNode;
  showUnsellable?: boolean;
  /** Passed to the default price column's ProductPrice. */
  currencySymbol?: string;
  className?: string;
}

export function defaultProductColumns(
  traits: ProductTraits, context?: TraitContext, options?: { currencySymbol?: string },
): ProductTableColumn[] {
  const columns: ProductTableColumn[] = [
    { id: 'name', header: 'Name', flex: 3, render: (doc) => <ProductTitle doc={doc} numberOfLines={2} /> },
    { id: 'sku', header: 'SKU', flex: 1, render: (doc) => <ProductSku doc={doc} /> },
    { id: 'barcode', header: 'Barcode', flex: 1, render: (doc) => <Text>{traits.getBarcode(doc) ?? '—'}</Text> },
    { id: 'price', header: 'Price', flex: 1, render: (doc) => <ProductPrice doc={doc} currencySymbol={options?.currencySymbol} /> },
    { id: 'stock', header: 'Stock', flex: 1, render: (doc) => <ProductStockBadge doc={doc} showQuantity showAsOf={false} /> },
    { id: 'category', header: 'Category', flex: 2, render: (doc) => <Text>{traits.getCategoryNames(doc).join(', ') || '—'}</Text> },
  ];
  return columns.map((column) => ({
    ...column, sortValue: (doc) => productSortValue(doc, column.id, traits, context),
  }));
}

export function useDefaultProductColumns(options?: { currencySymbol?: string }): ProductTableColumn[] {
  const traits = useProductTraits();
  const context = useTraitContext();
  const currencySymbol = options?.currencySymbol;
  return useMemo(() => defaultProductColumns(traits, context, { currencySymbol }), [traits, context, currencySymbol]);
}

export function ProductTable({
  items, columns, sort, defaultSort = null, onSortChange, sortItems = true, onSelect,
  searchSlot, filterSlot, emptyState, showUnsellable = false, currencySymbol, className, ...viewProps
}: ProductTableProps): JSX.Element {
  // Without a ConnectorProvider, custom columns can render without traits.
  let traits: ReturnType<typeof useProductTraits> | undefined;
  try {
    traits = useProductTraits();
  } catch {
    traits = undefined;
  }
  const context = useTraitContext();
  const resolvedColumns = useMemo(() => columns ?? (traits
    ? defaultProductColumns(traits, context, { currencySymbol }) : []), [columns, traits, context, currencySymbol]);
  const [internalSort, setInternalSort] = useState(defaultSort);
  const activeSort = sort === undefined ? internalSort : sort;
  const visibleItems = showUnsellable || !traits ? items : items.filter((item) => traits!.isSellable(item));
  const overlaidItems = useStockOverlaid(visibleItems);
  const rows = sortItems ? sortProducts([...overlaidItems], activeSort,
    (doc, field) => resolvedColumns.find((column) => column.id === field)?.sortValue?.(doc)) : overlaidItems;

  const changeSort = (id: string) => {
    const next: ProductSort | null = activeSort?.field !== id ? { field: id, dir: 'asc' }
      : activeSort.dir === 'asc' ? { field: id, dir: 'desc' } : null;
    if (sort === undefined) setInternalSort(next);
    onSortChange?.(next);
  };

  return (
    <VStack space="none" className={cn('flex-1', className)} {...viewProps}>
      {searchSlot && <View className="px-3 py-2">{searchSlot}</View>}
      {filterSlot && <View className="px-3 pb-2">{filterSlot}</View>}
      {rows.length ? (
        <Table className="flex-1">
          <TableHeader>
            <TableRow>
              {resolvedColumns.map((column) => (
                <TableHead key={column.id} style={{ flex: column.flex ?? 1 }}
                  {...(column.sortValue ? { 'aria-sort': activeSort?.field === column.id
                    ? (activeSort.dir === 'asc' ? 'ascending' : 'descending') : 'none' } : {})}>
                  {column.sortValue ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={'Sort by ' + column.header}
                      testID={'product-table-sort-' + column.id} onPress={() => changeSort(column.id)}>
                      <Text>{column.header}{activeSort?.field === column.id ? (activeSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</Text>
                    </Pressable>
                  ) : <Text>{column.header}</Text>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="flex-1">
            <FlatList
              data={rows}
              keyExtractor={(item, index) => String(item.id ?? index)}
              initialNumToRender={INITIAL_ROWS}
              maxToRenderPerBatch={BATCH_ROWS}
              windowSize={WINDOW_SIZE}
              renderItem={({ item, index }) => {
                const key = String(item.id ?? index);
                const row = (
                  <TableRow testID={onSelect ? undefined : 'product-row-' + key}>
                    {resolvedColumns.map((column) => (
                      <TableCell key={column.id} style={{ flex: column.flex ?? 1 }}>{column.render(item)}</TableCell>
                    ))}
                  </TableRow>
                );
                return onSelect ? (
                  <Pressable accessibilityRole="button" testID={'product-row-' + key} onPress={() => onSelect(item)}>
                    {row}
                  </Pressable>
                ) : row;
              }}
            />
          </TableBody>
        </Table>
      ) : emptyState ?? null}
    </VStack>
  );
}
