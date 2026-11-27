import { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Platform, ScrollView, Text, View } from 'react-native';
import type { ProductCategory } from '@tallyui/core';
import { CategoryTile } from '../product/category-tile';
import { CROSSFADE, EASE } from '../lib/motion';
import { useCategoryDeal } from './category-deal';

export function CategoryBrowseGrid({ categories, counts, total, columns, onOpen }: {
  categories: ProductCategory[]; counts: ReadonlyMap<string, number>; total: number; columns: number;
  onOpen: (id: string | null, node: View | undefined) => void;
}) {
  // v2 term-tree.ts hides a term with no products; the All tile always shows.
  const shown = categories.filter((category) => (counts.get(category.id) ?? 0) > 0);
  // After a gather, every tile but the one the level went home to fades in; that one shows at once.
  const [returned] = useState(useCategoryDeal().returningId);
  const fade = useRef(new Animated.Value(returned === undefined ? 1 : 0)).current;
  useLayoutEffect(() => {
    if (returned !== undefined) Animated.timing(fade, { toValue: 1, duration: CROSSFADE, easing: EASE, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [returned, fade]);
  // The All tile's id is null; its node is kept under this key.
  const nodes = useRef(new Map<string, View>());
  const box = (id: string | null) => ({
    ref: (node: View | null) => { if (node) nodes.current.set(id ?? ALL, node); },
    collapsable: false, style: id === returned ? undefined : { opacity: fade },
  });
  const open = (id: string | null) => onOpen(id, nodes.current.get(id ?? ALL));
  return (
    <ScrollView testID="category-browse" className="flex-1" contentContainerClassName="flex-row flex-wrap p-2">
      <View className="p-1" style={{ width: `${100 / columns}%` }}>
        <Animated.View {...box(null)}>
          <CategoryTile testID="category-tile-all" name="All products" count={total} stacked mark="all" onPress={() => open(null)} />
        </Animated.View>
      </View>
      {shown.map((category) => (
        <View key={category.id} className="p-1" style={{ width: `${100 / columns}%` }}>
          <Animated.View {...box(category.id)}>
            <CategoryTile testID={`category-tile-${category.id}`} name={category.name} imageUrl={category.imageUrl}
              count={counts.get(category.id) ?? 0} stacked mark="folder" onPress={() => open(category.id)} />
          </Animated.View>
        </View>
      ))}
      <Text testID="category-browse-footer" className="w-full px-2 py-3 text-center text-sm text-muted-foreground">
        {`${shown.length === 1 ? '1 category' : `${shown.length} categories`} · ${total === 1 ? '1 product' : `${total} products`}`}
      </Text>
    </ScrollView>
  );
}

// A sentinel key for the All tile's node, which no category id can be.
const ALL = '\0all';
