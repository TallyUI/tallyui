'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CashCountInput } from '@tallyui/components';

export default function Demo() {
  const [total, setTotal] = React.useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Cash Count</Text>
      <CashCountInput
        denominations={[
          { label: '$20', value: 20 },
          { label: '$10', value: 10 },
          { label: '$5', value: 5 },
          { label: '$1', value: 1 },
          { label: '25\\u00a2', value: 0.25 },
        ]}
        onChangeTotal={setTotal}
      />
      <View style={styles.output}>
        <Text style={styles.label}>Running total:</Text>
        <Text style={styles.value}>${'$'}{total.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8f9fa', gap: 12 },
  heading: { fontSize: 16, fontWeight: '700', color: '#111827' },
  output: { backgroundColor: '#fff', borderRadius: 8, padding: 12, gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
  value: { fontSize: 18, fontWeight: '700', color: '#374151' },
});`;

export function CashCountInputDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="CashCountInput"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
