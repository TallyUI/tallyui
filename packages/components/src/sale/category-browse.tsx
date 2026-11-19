import { ScrollView, View } from 'react-native';
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
