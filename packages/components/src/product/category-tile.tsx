import { Pressable, Text, View } from 'react-native';
import { Image } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

export interface CategoryTileProps {
  name: string;
  /** The category's photo; without one the tile shows the name's initial on a tint. */
  imageUrl?: string;
  /** Products in the category, shown under the name when above 0. */
  count?: number;
  onPress?: () => void;
  testID?: string;
  className?: string;
}

/**
 * A category as a square tile: its photo full-bleed with the name over the foot, or the name's initial on a
 * tint when there is no photo.
 *
 * Ported from WCPOS v2 `TermTile`, packages/core/src/screens/main/pos/products/browse/term-tile.tsx
 * (MIT, WCPOS): the picture fills the square (`contentFit="cover"`), else a tint; the name bold over two
 * lines with the count under it.
 */
export function CategoryTile({ name, imageUrl, count, onPress, testID, className }: CategoryTileProps) {
  const id = testID ?? 'category-tile';
  return (
    <Pressable testID={testID} role="button" accessibilityLabel={name} onPress={onPress}
      className={cn('aspect-square overflow-hidden rounded-lg border border-border', imageUrl ? 'bg-card' : 'bg-primary/10', className)}>
      {imageUrl ? (
        <Image.Root testID={`${id}-image`} source={{ uri: imageUrl }} alt="" contentFit="cover"
          className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
      ) : (
        <View testID={`${id}-fallback`} className="absolute inset-0 items-center justify-center">
          <Text className="text-3xl font-semibold text-primary">{name.trim().charAt(0).toUpperCase() || '?'}</Text>
        </View>
      )}
      <View className={cn('absolute inset-x-0 bottom-0 px-2.5 py-2', imageUrl && 'bg-card/80')}>
        <Text className="font-bold text-foreground" numberOfLines={2}>{name}</Text>
        {count !== undefined && count > 0 ? <Text className="text-xs text-muted-foreground">{count === 1 ? '1 product' : `${count} products`}</Text> : null}
      </View>
    </Pressable>
  );
}
