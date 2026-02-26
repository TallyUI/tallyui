'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProductVariantPicker } from '@tallyui/components';

const clothingOptions = [
  { name: 'Size', values: ['XS', 'S', 'M', 'L', 'XL'] },
  { name: 'Color', values: ['Black', 'White', 'Navy', 'Grey'] },
];

const coffeeOptions = [
  { name: 'Weight', values: ['250g', '500g', '1kg'] },
  { name: 'Grind', values: ['Whole Bean', 'Espresso', 'Filter', 'French Press'] },
];

export default function Demo() {
  const [clothing, setClothing] = React.useState({ Size: 'M', Color: 'Black' });
  const [coffee, setCoffee] = React.useState({ Weight: '500g' });

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Branded T-Shirt</Text>
        <ProductVariantPicker
          options={clothingOptions}
          selected={clothing}
          onSelect={setClothing}
        />
        <Text style={styles.value}>
          Selected: {clothing.Size || '—'} / {clothing.Color || '—'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Single Origin Coffee</Text>
        <ProductVariantPicker
          options={coffeeOptions}
          selected={coffee}
          onSelect={setCoffee}
        />
        <Text style={styles.value}>
          Selected: {coffee.Weight || '—'} / {coffee.Grind || '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, gap: 10 },
  title: { fontSize: 15, fontWeight: '700', color: '#111827' },
  value: { fontSize: 13, color: '#6b7280', marginTop: 4 },
});`;

export function ProductVariantPickerDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="ProductVariantPicker"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
