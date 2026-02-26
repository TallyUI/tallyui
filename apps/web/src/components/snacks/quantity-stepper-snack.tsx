'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { QuantityStepper } from '@tallyui/components';

export default function Demo() {
  const [qty1, setQty1] = React.useState(1);
  const [qty2, setQty2] = React.useState(3);
  const [qty3, setQty3] = React.useState(5);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Default (min 1, max 999)</Text>
        <QuantityStepper quantity={qty1} onChangeQuantity={setQty1} />
        <Text style={styles.value}>Quantity: {qty1}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Custom range (min 1, max 10)</Text>
        <QuantityStepper quantity={qty2} onChangeQuantity={setQty2} min={1} max={10} />
        <Text style={styles.value}>Quantity: {qty2}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Starting at 5</Text>
        <QuantityStepper quantity={qty3} onChangeQuantity={setQty3} />
        <Text style={styles.value}>Quantity: {qty3}</Text>
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

export function QuantityStepperDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="QuantityStepper"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
