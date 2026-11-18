import { useMemo } from 'react';
import { useProductTraits, useTraitContext, type ProductTraits, type TraitContext } from '@tallyui/core';
import { productSortValue } from '@tallyui/pos';
import { View } from 'react-native';
import { HStack, Switch, Text, VStack } from '../ui';
import { ProductImage } from './product-image';
import { ProductTitle } from './product-title';
import { ProductPrice } from './product-price';
import { ProductStockBadge } from './product-stock-badge';
import type { ProductTableColumn } from './product-table';

// v2's Products screen thumbnail, about 48 px.
const IMAGE_SIZE = 48;
// The ids productSortValue knows (PRODUCT_SORT_FIELDS); image and stockStatus stay unsortable.
const SORTABLE = new Set(['name', 'stock', 'category', 'price']);

/**
 * WCPOS v2's Products screen read columns: image, product (with its variation count), stock with the Manage switch,
 * stock status, categories and price. Pass them to `ProductTable columns={...}`.
 */
export function productsScreenColumns(
  traits: ProductTraits, context?: TraitContext, options?: { currencySymbol?: string },
): ProductTableColumn[] {
  const columns: ProductTableColumn[] = [
    { id: 'image', header: 'Image', hideHeader: true, flex: 0.6,
      render: (doc) => <ProductImage doc={doc} size={IMAGE_SIZE} showPlaceholder className="rounded-md" /> },
    { id: 'name', header: 'Product', flex: 3, render: (doc) => {
      const count = traits.getVariantCount(doc);
      return (
        <VStack space="none">
          <ProductTitle doc={doc} numberOfLines={2} />
          {traits.hasVariants(doc) ? (
            <Text testID="product-variation-count" className="text-xs text-muted-foreground">
              {count === 1 ? `${count} variation` : `${count} variations`}
            </Text>
          ) : null}
        </VStack>
      );
    } },
    { id: 'stock', header: 'Stock', flex: 1.5, render: (doc) => {
      // "Manages stock" from the core contract, not a new trait: getStock's quantity is "the total on hand when every
      // variant is tracked, else undefined" (packages/core/src/types/traits/product.ts, getStock).
      const quantity = traits.getStock(doc).quantity;
      return (
        <VStack space="none" className="gap-1">
          <Text testID="product-stock-quantity">{quantity === undefined ? '—' : String(quantity)}</Text>
          {/* Read-only, unlike v2's editable field and switch: edits go through each platform's own API (a later row). */}
          <HStack space="none" className="items-center gap-1.5">
            <Switch size="sm" disabled checked={quantity !== undefined} testID="product-manage-stock" accessibilityLabel="Manage" />
            <Text className="text-xs text-muted-foreground">Manage</Text>
          </HStack>
        </VStack>
      );
    } },
    { id: 'stockStatus', header: 'Stock Status', flex: 1.5, render: (doc) => (
      <View testID="product-stock-status"><ProductStockBadge doc={doc} showAsOf={false} /></View>
    ) },
    { id: 'category', header: 'Categories', flex: 2, render: (doc) => <Text>{traits.getCategoryNames(doc).join(', ') || '—'}</Text> },
    // One Price column: ProductPrice draws a sale price with the price it replaces, from getPrices. v2's separate
    // Regular and Sale price columns would need the deprecated getRegularPrice / getSalePrice, so they are left out.
    { id: 'price', header: 'Price', flex: 1.5, align: 'right',
      render: (doc) => <ProductPrice doc={doc} currencySymbol={options?.currencySymbol} /> },
  ];
  return columns.map((column) => SORTABLE.has(column.id)
    ? { ...column, sortValue: (doc) => productSortValue(doc, column.id, traits, context) } : column);
}

/** `productsScreenColumns` from the ConnectorProvider's traits, memoised; requires a ConnectorProvider. */
export function useProductsScreenColumns(options?: { currencySymbol?: string }): ProductTableColumn[] {
  const traits = useProductTraits();
  const context = useTraitContext();
  const currencySymbol = options?.currencySymbol;
  return useMemo(() => productsScreenColumns(traits, context, { currencySymbol }), [traits, context, currencySymbol]);
}
