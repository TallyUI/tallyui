'use client';

import { ExpoSnack } from '../expo-snack';
import { snackDependencies } from './snack-wrapper';

const code = `import React from 'react';
import { View, StyleSheet } from 'react-native';
import { OrderSummary } from '@tallyui/components';

export default function App() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <OrderSummary
          subtotal="$1,199.98"
          tax="$120.00"
          taxLabel="GST"
          total="$1,319.98"
          payments={[
            { label: 'Cash tendered', amount: '$1,400.00' },
            { label: 'Change due', amount: '$80.02' },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f8f9fa' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
});`;

export function OrderSummaryDemo() {
  return (
    <ExpoSnack
      code={code}
      dependencies={snackDependencies}
      name="OrderSummary"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
