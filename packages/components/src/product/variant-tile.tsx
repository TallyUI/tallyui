import { Pressable, Text, View } from 'react-native';
import type { StockStatus } from '@tallyui/core';
import { VStack } from '../ui';
import { PressVeil } from './press-veil';
import { ProductImage } from './product-image';
import { ProductTitle } from './product-title';
import { STOCK_STATUS_LABELS } from './product-stock-badge';

// v2's variation tile (P/tiles/variation-tile.tsx:129-213): the product name small above one chip per option value
// (P/option-chips.tsx:7-23), then price and stock. The chips are labels; a tap on the tile adds the variant.
export function VariantTile({ name, chips, price, stockStatus, onPress, testID }: {
  name: string; chips: string[]; price?: string; stockStatus: StockStatus; onPress: () => void; testID: string;
}) {
  return (
    <Pressable accessibilityRole="button" testID={testID} onPress={onPress}>
      {({ pressed }) => <>
        <VStack space="sm" className="rounded-lg border border-border bg-card p-3">
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>{name}</Text>
          <View testID={`${testID}-chips`} className="flex-row flex-wrap gap-1">
            {chips.map((chip, index) => (
              <Text key={index} className="rounded bg-foreground/12 px-1.5 text-xs font-bold text-foreground">{chip}</Text>
            ))}
          </View>
          {price ? <Text className="text-sm font-semibold text-foreground">{price}</Text> : null}
          <Text className="text-xs text-muted-foreground">{STOCK_STATUS_LABELS[stockStatus] ?? STOCK_STATUS_LABELS.unknown}</Text>
        </VStack>
        <PressVeil pressed={pressed} className="rounded-lg" />
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
