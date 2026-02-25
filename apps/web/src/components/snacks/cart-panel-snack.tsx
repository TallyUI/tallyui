'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { Text, View } from 'react-native';
import { CartPanel, CartLine, CartTotal } from '@tallyui/components';

export default function Demo({ doc }) {
  const items = [
    { doc, quantity: 2 },
    { doc, quantity: 1 },
  ];

  return (
    <CartPanel
      items={items}
      renderItem={(item, index) => <CartLine key={index} item={item} />}
      header={
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1f2937' }}>Current Cart</Text>
          <Text style={{ fontSize: 12, color: '#6b7280' }}>2 items</Text>
        </View>
      }
      footer={<CartTotal items={items} taxRate={0.1} taxLabel="GST" />}
    />
  );
}`;

export function CartPanelDemo() {
  return (
    <ExpoSnack
      files={createSnackFiles(demoCode)}
      dependencies={snackDependencies}
      name="CartPanel"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
