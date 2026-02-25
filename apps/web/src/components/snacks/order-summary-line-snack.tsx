'use client';

import { ExpoSnack } from '../expo-snack';
import { snackDependencies } from './snack-wrapper';

const code = `import React from 'react';
import { View, StyleSheet } from 'react-native';
import { OrderSummaryLine } from '@tallyui/components';

export default function App() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <OrderSummaryLine label="Subtotal" amount="$1,199.98" />
        <OrderSummaryLine label="Tax (GST 10%)" amount="$120.00" />
        <OrderSummaryLine label="Total" amount="$1,319.98" bold />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f8f9fa' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, gap: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
});`;

export function OrderSummaryLineDemo() {
  return (
    <ExpoSnack
      code={code}
      dependencies={snackDependencies}
      name="OrderSummaryLine"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
