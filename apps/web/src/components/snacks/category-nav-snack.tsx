'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CategoryNav } from '@tallyui/components';

const categories = [
  { id: 'all', name: 'All' },
  { id: 'equipment', name: 'Equipment' },
  { id: 'beans', name: 'Beans' },
  { id: 'accessories', name: 'Accessories' },
  { id: 'merch', name: 'Merch' },
];

export default function Demo() {
  const [horizontalId, setHorizontalId] = React.useState('all');
  const [verticalId, setVerticalId] = React.useState('beans');

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Horizontal (default)</Text>
        <CategoryNav
          categories={categories}
          selectedId={horizontalId}
          onSelect={setHorizontalId}
        />
        <Text style={styles.value}>
          Selected: {categories.find((c) => c.id === horizontalId)?.name}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Vertical</Text>
        <CategoryNav
          categories={categories}
          selectedId={verticalId}
          onSelect={setVerticalId}
          orientation="vertical"
        />
        <Text style={styles.value}>
          Selected: {categories.find((c) => c.id === verticalId)?.name}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
  value: { fontSize: 14, color: '#374151' },
});`;

export function CategoryNavDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="CategoryNav"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
