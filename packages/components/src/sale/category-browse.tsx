import { ScrollView, Text, View } from 'react-native';
import type { ProductCategory } from '@tallyui/core';
import { CategoryTile } from '../product/category-tile';

export function CategoryBrowseGrid({ categories, counts, total, columns, onOpen }: {
  categories: ProductCategory[]; counts: ReadonlyMap<string, number>; total: number; columns: number;
  onOpen: (id: string | null) => void;
}) {
  // v2 term-tree.ts hides a term with no products; the All tile always shows.
  const shown = categories.filter((category) => (counts.get(category.id) ?? 0) > 0);
  return (
    <ScrollView testID="category-browse" className="flex-1" contentContainerClassName="flex-row flex-wrap p-2">
      <View className="p-1" style={{ width: `${100 / columns}%` }}>
        <CategoryTile testID="category-tile-all" name="All products" count={total} stacked mark="all" onPress={() => onOpen(null)} />
      </View>
      {shown.map((category) => (
        <View key={category.id} className="p-1" style={{ width: `${100 / columns}%` }}>
          <CategoryTile testID={`category-tile-${category.id}`} name={category.name} imageUrl={category.imageUrl}
            count={counts.get(category.id) ?? 0} stacked mark="folder" onPress={() => onOpen(category.id)} />
        </View>
      ))}
      <Text testID="category-browse-footer" className="w-full px-2 py-3 text-center text-sm text-muted-foreground">
        {`${shown.length === 1 ? '1 category' : `${shown.length} categories`} · ${total === 1 ? '1 product' : `${total} products`}`}
      </Text>
    </ScrollView>
  );
}
