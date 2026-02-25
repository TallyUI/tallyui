'use client';

import { ExpoSnack } from '../expo-snack';
import { snackDependencies } from './snack-wrapper';

const code = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FilterChipGroup } from '@tallyui/components';

const categories = ['All', 'Equipment', 'Accessories', 'Beans', 'Merch'];

export default function App() {
  const [chips, setChips] = React.useState(
    categories.map((label, i) => ({ label, active: i === 0 }))
  );

  const handlePress = (index) => {
    setChips((prev) =>
      prev.map((chip, i) => ({ ...chip, active: i === index }))
    );
  };

  const active = chips.find((c) => c.active);

  return (
    <View style={styles.container}>
      <FilterChipGroup chips={chips} onChipPress={handlePress} />
      <View style={styles.output}>
        <Text style={styles.label}>Selected:</Text>
        <Text style={styles.value}>{active?.label ?? 'None'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f8f9fa', gap: 16 },
  output: { backgroundColor: '#fff', borderRadius: 8, padding: 12, gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
  value: { fontSize: 14, color: '#374151' },
});`;

export function FilterChipGroupDemo() {
  return (
    <ExpoSnack
      code={code}
      dependencies={snackDependencies}
      name="FilterChipGroup"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
