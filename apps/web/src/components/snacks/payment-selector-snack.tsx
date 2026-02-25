'use client';

import { ExpoSnack } from '../expo-snack';
import { snackDependencies } from './snack-wrapper';

const code = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PaymentSelector } from '@tallyui/components';

const methods = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Credit Card' },
  { id: 'gift', label: 'Gift Card' },
];

export default function App() {
  const [selected, setSelected] = React.useState('cash');

  return (
    <View style={styles.container}>
      <PaymentSelector
        methods={methods}
        selected={selected}
        onSelect={setSelected}
      />
      <View style={styles.output}>
        <Text style={styles.label}>Selected method:</Text>
        <Text style={styles.value}>{selected}</Text>
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

export function PaymentSelectorDemo() {
  return (
    <ExpoSnack
      code={code}
      dependencies={snackDependencies}
      name="PaymentSelector"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
