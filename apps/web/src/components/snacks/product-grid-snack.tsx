'use client';

import { ExpoSnack } from '../expo-snack';
import { snackDependencies } from './snack-wrapper';

const code = `import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { ConnectorProvider } from '@tallyui/core';
import { woocommerceConnector } from '@tallyui/connector-woocommerce';
import { ProductGrid, ProductCard, SearchInput, FilterChipGroup } from '@tallyui/components';

const products = [
  { id: 1, name: 'Espresso Machine Pro', price: '599.99', regular_price: '599.99', sale_price: '', on_sale: false, stock_status: 'instock', stock_quantity: 15, images: [{ id: 1, src: 'https://picsum.photos/seed/esp/200', alt: '' }], categories: [{ id: 1, name: 'Equipment', slug: 'equipment' }] },
  { id: 2, name: 'Pour-Over Kettle', price: '49.99', regular_price: '49.99', sale_price: '', on_sale: false, stock_status: 'instock', stock_quantity: 30, images: [{ id: 2, src: 'https://picsum.photos/seed/kettle/200', alt: '' }], categories: [{ id: 2, name: 'Accessories', slug: 'accessories' }] },
  { id: 3, name: 'Ethiopian Yirgacheffe', price: '18.99', regular_price: '18.99', sale_price: '', on_sale: false, stock_status: 'instock', stock_quantity: 50, images: [{ id: 3, src: 'https://picsum.photos/seed/beans/200', alt: '' }], categories: [{ id: 3, name: 'Beans', slug: 'beans' }] },
  { id: 4, name: 'Coffee Grinder', price: '129.99', regular_price: '129.99', sale_price: '', on_sale: false, stock_status: 'instock', stock_quantity: 12, images: [{ id: 4, src: 'https://picsum.photos/seed/grinder/200', alt: '' }], categories: [{ id: 1, name: 'Equipment', slug: 'equipment' }] },
];

const categories = ['All', 'Equipment', 'Accessories', 'Beans'];

export default function App() {
  const [query, setQuery] = React.useState('');
  const [chips, setChips] = React.useState(
    categories.map((label, i) => ({ label, active: i === 0 }))
  );

  const activeCategory = chips.find((c) => c.active)?.label;
  const filtered = products.filter((p) => {
    const matchesQuery = p.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = activeCategory === 'All' || p.categories.some((c) => c.name === activeCategory);
    return matchesQuery && matchesCategory;
  });

  return (
    <ConnectorProvider connector={woocommerceConnector}>
      <View style={styles.container}>
        <ProductGrid
          items={filtered}
          renderItem={(doc) => <ProductCard doc={doc} />}
          searchSlot={<SearchInput value={query} onChangeText={setQuery} placeholder="Search products..." />}
          filterSlot={
            <FilterChipGroup
              chips={chips}
              onChipPress={(i) => setChips((prev) => prev.map((c, j) => ({ ...c, active: j === i })))}
            />
          }
          emptyState={<Text style={styles.empty}>No products found</Text>}
          numColumns={2}
        />
      </View>
    </ConnectorProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  empty: { textAlign: 'center', padding: 24, color: '#6b7280' },
});`;

export function ProductGridDemo() {
  return (
    <ExpoSnack
      code={code}
      dependencies={snackDependencies}
      name="ProductGrid"
      platform="web"
      preview={true}
      height="600px"
    />
  );
}
