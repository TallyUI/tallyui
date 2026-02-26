'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RegisterSummary } from '@tallyui/components';

export default function Demo() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Balanced Register</Text>
      <RegisterSummary
        expectedCash={500.00}
        actualCash={500.00}
        transactions={[
          { method: 'Cash', count: 14, total: 312.50 },
          { method: 'Credit Card', count: 22, total: 875.00 },
          { method: 'Gift Card', count: 3, total: 45.00 },
        ]}
      />

      <Text style={styles.heading}>Register With Discrepancy</Text>
      <RegisterSummary
        expectedCash={500.00}
        actualCash={487.25}
        transactions={[
          { method: 'Cash', count: 9, total: 187.25 },
          { method: 'Credit Card', count: 15, total: 620.00 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8f9fa', gap: 16 },
  heading: { fontSize: 14, fontWeight: '700', color: '#111827' },
});`;

export function RegisterSummaryDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="RegisterSummary"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
