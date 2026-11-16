import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ProductCategory } from '@tallyui/core';
import { CategoryTile } from '../product/category-tile';

export function CategoryBrowseGrid({ categories, counts, total, columns, onOpen }: {
  categories: ProductCategory[]; counts: ReadonlyMap<string, number>; total: number; columns: number;
  onOpen: (id: string | null) => void;
}) {
  return (
    <ScrollView testID="category-browse" className="flex-1" contentContainerClassName="flex-row flex-wrap p-2">
      <View className="p-1" style={{ width: `${100 / columns}%` }}>
        <CategoryTile testID="category-tile-all" name="All products" count={total} onPress={() => onOpen(null)} />
      </View>
      {categories.map((category) => (
        <View key={category.id} className="p-1" style={{ width: `${100 / columns}%` }}>
          <CategoryTile testID={`category-tile-${category.id}`} name={category.name} imageUrl={category.imageUrl}
            count={counts.get(category.id) ?? 0} onPress={() => onOpen(category.id)} />
        </View>
      ))}
    </ScrollView>
  );
}

// v2's breadcrumb is a row of its own above the products, and the parent crumb is the way back.
export function CategoryCrumb({ here, onRoot }: { here: string; onRoot: () => void }) {
  return (
    <View testID="category-crumb" className="flex-row items-center gap-1 px-4 pt-2">
      <Pressable testID="category-crumb-root" role="button" accessibilityLabel="Categories" onPress={onRoot}
        className="min-h-11 justify-center rounded-md px-2">
        <Text className="font-medium text-foreground">Categories</Text>
      </Pressable>
      <Text aria-hidden className="text-muted-foreground">›</Text>
      <Text className="shrink px-1 font-semibold text-foreground" numberOfLines={1}>{here}</Text>
    </View>
  );
}
