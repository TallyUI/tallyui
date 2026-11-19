import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { Icon } from '../ui/icon';
import { CategoryIcon } from '../ui/icon/category-icon';
import { ChevronLeftIcon } from '../ui/icon/chevron-left-icon';
import { ViewGridIcon } from '../ui/icon/view-grid-icon';

// v2 poster-tile/style.ts CARD, FAR and NEAR: the two cards drawn behind a stacked tile.
const CARD = 'absolute rounded-lg border border-border bg-card';
const FAR = { top: 6, left: 6, right: -6, bottom: -6, opacity: 0.6 };
const NEAR = { top: 3, left: 3, right: -3, bottom: -3 };

/** The two cards behind a stacked tile; drawn first inside the tile's Pressable. */
export function TileStack({ id }: { id: string }) {
  return (
    <View testID={`${id}-stack`} pointerEvents="none" className="absolute inset-0">
      <View testID={`${id}-stack-far`} className={CARD} style={FAR} />
      <View testID={`${id}-stack-near`} className={CARD} style={NEAR} />
    </View>
  );
}

export interface CategoryTileProps {
  name: string;
  /**
   * The category's photo; without one, or when it fails to load, the tile shows the name's initial on a tint.
   * A new URL gets its own chance to load.
   */
  imageUrl?: string;
  /** Products in the category, shown under the name when above 0. */
  count?: number;
  /** Draws two cards behind the tile, as v2's poster tile does (default false). */
  stacked?: boolean;
  /** The corner mark: `folder` for a category, `all` (a grid) for the All products tile. Decoration only. */
  mark?: 'folder' | 'all';
  /** Draws v2's back badge, a left chevron top-right in the mark's circle, as on a level's first tile. Decoration only (default false). */
  back?: boolean;
  /** The tile's accessible label (default `name`). */
  accessibilityLabel?: string;
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
 * lines with the count under it. The stack and the mark follow v2's `PosterTile` (poster-tile/index.tsx).
 */
export function CategoryTile({ name, imageUrl, count, stacked = false, mark, back = false, accessibilityLabel, onPress, testID, className }: CategoryTileProps) {
  const id = testID ?? 'category-tile';
  // Keyed by the URL, as v2's useTermPicture: a failed photo falls back to the initial, a new URL is tried.
  const [failed, setFailed] = useState<string | null>(null);
  const photo = imageUrl && imageUrl !== failed ? imageUrl : undefined;
  return (
    <Pressable testID={testID} role="button" accessibilityLabel={accessibilityLabel ?? name} onPress={onPress} className={className}>
      {stacked ? <TileStack id={id} /> : null}
      <View className={cn('aspect-square overflow-hidden rounded-lg border border-border', photo ? 'bg-card' : 'bg-primary/10')}>
        {photo ? (
          <Image.Root key={photo} testID={`${id}-image`} source={{ uri: photo }} alt="" contentFit="cover"
            onError={() => setFailed(photo)} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
        ) : (
          <View testID={`${id}-fallback`} className="absolute inset-0 items-center justify-center">
            <Text className="text-3xl font-semibold text-primary">{name.trim().charAt(0).toUpperCase() || '?'}</Text>
          </View>
        )}
        <View className={cn('absolute inset-x-0 bottom-0 px-2.5 py-2', photo && 'bg-card/80')}>
          <Text className="font-bold text-foreground" numberOfLines={2}>{name}</Text>
          {count !== undefined && count > 0 ? <Text className="text-xs text-muted-foreground">{count === 1 ? '1 product' : `${count} products`}</Text> : null}
        </View>
        {mark ? (
          <View testID={`${id}-mark`} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            className="absolute top-2 left-2 size-6 items-center justify-center rounded-full border border-border bg-card">
            <Icon size="sm" className="text-muted-foreground">
              {mark === 'all' ? <ViewGridIcon size={16} /> : <CategoryIcon size={16} />}
            </Icon>
          </View>
        ) : null}
        {back ? (
          <View testID={`${id}-back`} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            className="absolute top-2 right-2 size-6 items-center justify-center rounded-full border border-border bg-card">
            <Icon size="sm" className="text-muted-foreground"><ChevronLeftIcon size={16} /></Icon>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
