import { useMemo, useState, type JSX, type ReactNode } from 'react';
import { FlatList, Pressable, View, type ViewProps } from 'react-native';
import { useProductTraits, useTraitContext, useStockOverlaid, type ProductTraits, type TraitContext } from '@tallyui/core';
import { productSortValue, sortProducts, type ProductSort, type ProductSortValue } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Text, VStack, IconButton, PlusIcon, ChevronRightIcon } from '../ui';
import { MinTargetBand } from '../scale/min-target';
import { usePointer } from '../scale/use-pointer';
import { ProductImage } from './product-image';
import { ProductTitle } from './product-title';
import { ProductSku } from './product-sku';
import { ProductPrice } from './product-price';
import { ProductStockBadge } from './product-stock-badge';
import { InCartBadge } from './in-cart-badge';

// Limit initial mounts for a 2,000-product catalogue to eight rows.
const INITIAL_ROWS = 8;
// Keep each render batch small for a 2,000-product catalogue.
const BATCH_ROWS = 8;
// Keep nearby rows mounted without rendering the whole 2,000-product catalogue.
const WINDOW_SIZE = 5;

// v2 PosterThumb sizes: sm (size-10) under a fine pointer, md (size-14) under a coarse one.
const THUMB_FINE = 40;
const THUMB_COARSE = 56;
// The thumbnail column adds the cells' px-3 (12 px each side) to the image.
const CELL_PAD_X = 24;
// The add column: a 40 px md IconButton centred with 8 px either side.
const ACTION_WIDTH = 56;

// Place column content horizontally inside column-direction Views.
const ALIGN = { left: 'items-start', center: 'items-center', right: 'items-end' } as const;

export interface ProductTableColumn<Doc = any> {
  /** Stable id; the default columns use PRODUCT_SORT_FIELDS. */
  id: string;
  /** Header label. */
  header: string;
  /** Places the head and the cells' content; default left (WCPOS v2 column-style). */
  align?: 'left' | 'center' | 'right';
  /** Draws no head label; `header` stays the head's accessible name (v2's image column). */
  hideHeader?: boolean;
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
  /** Lead each row with the product's thumbnail, as v2's image column: 40 px, 56 px under a coarse pointer, an
   * initial tile when there is no image. Needs a ConnectorProvider. Default false. */
  showThumbnail?: boolean;
  /** End each row with v2's add control, which calls onSelect(item) exactly as a row press does: a + labelled
   * "Add to cart", or a > labelled "Variations" for a product with more than one variant. Needs onSelect. Default false. */
  showAddButton?: boolean;
  /** v2's in-cart count: how many of the product the cart holds (e.g. from cartQuantities). In the add column
   * (showAddButton), a count above 0 shows in place of the +, labelled "In cart: N", and pressing it calls onSelect
   * as the + does; a product with variants keeps its >. Default: no count. */
  cartQuantity?: (doc: any) => number;
  className?: string;
}

export function defaultProductColumns(
  traits: ProductTraits, context?: TraitContext, options?: { currencySymbol?: string },
): ProductTableColumn[] {
  const columns: ProductTableColumn[] = [
    { id: 'name', header: 'Name', flex: 3, render: (doc) => <ProductTitle doc={doc} numberOfLines={2} /> },
    { id: 'sku', header: 'SKU', flex: 1, render: (doc) => <ProductSku doc={doc} /> },
    { id: 'barcode', header: 'Barcode', flex: 1, render: (doc) => <Text>{traits.getBarcode(doc) ?? '—'}</Text> },
    { id: 'price', header: 'Price', flex: 1, align: 'right', render: (doc) => <ProductPrice doc={doc} currencySymbol={options?.currencySymbol} /> },
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
  searchSlot, filterSlot, emptyState, showUnsellable = false, currencySymbol, showThumbnail = false,
  showAddButton = false, cartQuantity, className, ...viewProps
}: ProductTableProps): JSX.Element {
  // Without a ConnectorProvider, custom columns can render without traits.
  let traits: ReturnType<typeof useProductTraits> | undefined;
  try {
    traits = useProductTraits();
  } catch {
    traits = undefined;
  }
  const context = useTraitContext();
  const thumb = usePointer() === 'coarse' ? THUMB_COARSE : THUMB_FINE;
  const thumbnail = showThumbnail && traits !== undefined;
  const addButton = showAddButton && onSelect !== undefined;
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
              {thumbnail ? <TableHead aria-label="Image" style={{ width: thumb + CELL_PAD_X }} className="h-9 flex-none px-3 py-0" /> : null}
              {resolvedColumns.map((column) => (
                <TableHead key={column.id} style={{ flex: column.flex ?? 1 }}
                  className={cn('h-9 justify-center px-3 py-0', column.align && ALIGN[column.align])}
                  aria-label={column.hideHeader ? column.header : undefined}
                  {...(column.sortValue ? { 'aria-sort': activeSort?.field === column.id
                    ? (activeSort.dir === 'asc' ? 'ascending' : 'descending') : 'none' } : {})}>
                  {column.sortValue ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={'Sort by ' + column.header}
                      testID={'product-table-sort-' + column.id} onPress={() => changeSort(column.id)}>
                      <Text numberOfLines={1}>{column.hideHeader ? '' : column.header}{activeSort?.field === column.id ? (activeSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</Text>
                    </Pressable>
                  ) : <Text numberOfLines={1}>{column.hideHeader ? '' : column.header}</Text>}
                </TableHead>
              ))}
              {addButton ? <TableHead aria-label="Actions" style={{ width: ACTION_WIDTH }} className="h-9 flex-none px-3 py-0" /> : null}
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
                const variations = addButton && traits !== undefined && traits.getVariantCount(item) > 1;
                const count = addButton && !variations ? cartQuantity?.(item) ?? 0 : 0;
                const row = (
                  <TableRow testID={onSelect ? undefined : 'product-row-' + key}>
                    {thumbnail ? <TableCell style={{ width: thumb + CELL_PAD_X }} className="flex-none px-3 py-1.5">
                      <ProductImage doc={item} size={thumb} showPlaceholder className="rounded-md" /></TableCell> : null}
                    {resolvedColumns.map((column) => (
                      <TableCell key={column.id} style={{ flex: column.flex ?? 1 }}
                        className={cn('px-3 py-1.5', column.align && ALIGN[column.align])}>{column.render(item)}</TableCell>
                    ))}
                    {addButton ? (
                      <TableCell style={{ width: ACTION_WIDTH }} className="flex-none items-center justify-center px-0 py-1.5">
                        <IconButton testID={'product-row-add-' + key}
                          accessibilityLabel={variations ? 'Variations' : count > 0 ? `In cart: ${count}` : 'Add to cart'}
                          onPress={(event) => { event.stopPropagation?.(); onSelect!(item); }}>
                          {variations || count <= 0 ? <View className="text-muted-foreground">
                            {variations ? <ChevronRightIcon size={18} /> : <PlusIcon size={18} />}</View> : null}
                          {!variations && cartQuantity ? <InCartBadge count={count} identity={key} testID={'product-row-in-cart-' + key} /> : null}
                          <MinTargetBand square />
                        </IconButton>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
                return onSelect ? (
                  <Pressable accessibilityRole={addButton ? undefined : 'button'} testID={'product-row-' + key} onPress={() => onSelect(item)}>
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
