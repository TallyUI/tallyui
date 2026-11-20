import { Pressable, Text, View } from 'react-native';
import type { StockStatus } from '@tallyui/core';
import { DEFAULT_TILE_FIELDS, type TileFields } from '@tallyui/pos';
import { VStack } from '../ui';
import { InCartBadge } from './in-cart-badge';
import { PressVeil } from './press-veil';
import { ProductImage } from './product-image';
import { ProductTitle } from './product-title';
import { STOCK_STATUS_LABELS } from './product-stock-badge';

// v2's variation tile (P/tiles/variation-tile.tsx:129-213): the product name small above one chip per option value
// (P/option-chips.tsx:7-23), then price and stock. The chips are labels; a tap on the tile adds the variant.
// Its words follow the grid's Tile Fields as v2's gridFields (variation-tile.tsx:136,180): name off keeps name and
// chips as the label, SKU then barcode after the price, and out of stock still shows while the price does.
export function VariantTile({ name, chips, price, stockStatus, onPress, testID, fields: tileFields, sku, barcode, inCart }: {
  name: string; chips: string[]; price?: string; stockStatus: StockStatus; onPress: () => void; testID: string;
  fields?: Partial<TileFields>; sku?: string; barcode?: string;
  /** How many of this variant the cart holds, top-right as v2's per-variation InCartCount (variation-tile.tsx:176-177). */
  inCart?: number;
}) {
  const fields: TileFields = { ...DEFAULT_TILE_FIELDS, ...tileFields };
  const facts = [fields.sku && sku ? `SKU ${sku}` : '', fields.barcode ? barcode ?? '' : ''].filter(Boolean);
  const showStock = fields.stock || (stockStatus === 'out_of_stock' && fields.price);
  return (
    <Pressable accessibilityRole="button" testID={testID} onPress={onPress}
      {...(fields.name ? {} : { accessibilityLabel: [name, ...chips].join(', ') })}>
      {({ pressed }) => <>
        <VStack space="sm" className="rounded-lg border border-border bg-card p-3">
          {fields.name ? <>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>{name}</Text>
            <View testID={`${testID}-chips`} className="flex-row flex-wrap gap-1">
              {chips.map((chip, index) => (
                <Text key={index} className="rounded bg-foreground/12 px-1.5 text-xs font-bold text-foreground">{chip}</Text>
              ))}
            </View>
          </> : null}
          {price && fields.price ? <Text className="text-sm font-semibold text-foreground">{price}</Text> : null}
          {facts.map((fact, index) => <Text key={index} className="text-xs text-muted-foreground" numberOfLines={1}>{fact}</Text>)}
          {showStock
            ? <Text className="text-xs text-muted-foreground">{STOCK_STATUS_LABELS[stockStatus] ?? STOCK_STATUS_LABELS.unknown}</Text>
            : null}
        </VStack>
        <PressVeil pressed={pressed} className="rounded-lg" />
        <InCartBadge count={inCart ?? 0} className="absolute right-2 top-2" testID={`${testID}-in-cart`} />
      </>}
    </Pressable>
  );
}

// v2's parent tile in slot 0 (P/tiles/variation-tile.tsx:223-255): the product's own tile acts as Back, with a
// chevron-left badge in a circle top-right.
export function VariantParentTile({ doc, onPress }: { doc: unknown; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" testID="variations-parent-tile" onPress={onPress}>
      {({ pressed }) => <>
        <VStack space="sm" className="items-center rounded-lg border border-border bg-card p-3">
          <ProductImage doc={doc} size={80} className="rounded-md" />
          <ProductTitle doc={doc} className="text-sm" numberOfLines={2} />
        </VStack>
        <PressVeil pressed={pressed} className="rounded-lg" />
        <View aria-hidden pointerEvents="none"
          className="absolute right-2 top-2 h-6 w-6 items-center justify-center rounded-full bg-foreground/12">
          <Text className="text-base leading-none text-foreground">‹</Text>
        </View>
      </>}
    </Pressable>
  );
}
