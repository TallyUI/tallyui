'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { CartLineActions } from '@tallyui/components';

function FakeCartLine({ name, price, qty }) {
  return (
    <View style={styles.lineContent}>
      <Text style={styles.lineName}>{name}</Text>
      <Text style={styles.lineDetail}>{qty} x \${price}</Text>
    </View>
  );
}

export default function Demo() {
  const [items, setItems] = React.useState([
    { id: '1', name: 'Espresso Machine', price: '599.99', qty: 1 },
    { id: '2', name: 'Coffee Beans (1kg)', price: '24.99', qty: 3 },
  ]);

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <View style={styles.container}>
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <CartLineActions
            actions={[
              {
                id: 'remove',
                label: 'Remove',
                onPress: () => removeItem(item.id),
              },
            ]}
          >
            <FakeCartLine name={item.name} price={item.price} qty={item.qty} />
          </CartLineActions>
        </View>
      ))}

      {items.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.emptyText}>Cart is empty</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 8 },
  lineContent: { padding: 4, gap: 2 },
  lineName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  lineDetail: { fontSize: 13, color: '#6b7280' },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', padding: 16 },
});`;

export function CartLineActionsDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="CartLineActions"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
