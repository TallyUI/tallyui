'use client';

import { ExpoSnack } from '../expo-snack';
import { snackDependencies } from './snack-wrapper';

const code = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SearchInput } from '@tallyui/components';

export default function App() {
  const [value, setValue] = React.useState('');

  return (
    <View style={styles.container}>
      <SearchInput value={value} onChangeText={setValue} placeholder="Search products..." />
      <View style={styles.output}>
        <Text style={styles.label}>Current value:</Text>
        <Text style={styles.value}>{value || '(empty)'}</Text>
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

export function SearchInputDemo() {
  return (
    <ExpoSnack
      code={code}
      dependencies={snackDependencies}
      name="SearchInput"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
