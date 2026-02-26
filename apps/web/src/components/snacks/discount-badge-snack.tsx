'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DiscountBadge } from '@tallyui/components';

export default function Demo() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Percentage discount</Text>
        <DiscountBadge label="20% OFF" />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Fixed amount discount</Text>
        <DiscountBadge label="Save $5.00" />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>On a product line</Text>
        <View style={styles.productRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.productName}>Espresso Machine Pro</Text>
            <Text style={styles.productPrice}>$599.99</Text>
          </View>
          <DiscountBadge label="SALE" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  productName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  productPrice: { fontSize: 13, color: '#6b7280' },
});`;

export function DiscountBadgeDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="DiscountBadge"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
