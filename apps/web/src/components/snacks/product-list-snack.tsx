'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { ProductList } from '@tallyui/components';

const allProducts = [
  { id: '1', name: 'Espresso Machine Pro', price: '$599.99', category: 'Equipment' },
  { id: '2', name: 'Coffee Beans (1kg)', price: '$24.99', category: 'Beans' },
  { id: '3', name: 'Milk Frother', price: '$49.99', category: 'Accessories' },
  { id: '4', name: 'Paper Filters (100pk)', price: '$8.99', category: 'Accessories' },
  { id: '5', name: 'Ceramic Mug Set', price: '$34.99', category: 'Merch' },
];

function ProductRow({ item }) {
  return (
    <Pressable style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.productName}>{item.name}</Text>
        <Text style={styles.productCategory}>{item.category}</Text>
      </View>
      <Text style={styles.productPrice}>{item.price}</Text>
    </Pressable>
  );
}

export default function Demo() {
  const [search, setSearch] = React.useState('');

  const filtered = allProducts.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <ProductList
        items={filtered}
        renderItem={(item) => <ProductRow item={item} />}
        searchSlot={
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search products..."
            style={styles.searchInput}
            placeholderTextColor="#9ca3af"
          />
        }
        emptyState={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No products match your search</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', height: 360 },
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  productName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  productCategory: { fontSize: 12, color: '#6b7280' },
  productPrice: { fontSize: 14, fontWeight: '600', color: '#374151' },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#9ca3af' },
});`;

export function ProductListDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="ProductList"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
