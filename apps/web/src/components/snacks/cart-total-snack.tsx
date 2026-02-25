'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View } from 'react-native';
import { CartLine, CartTotal } from '@tallyui/components';

export default function Demo({ doc }) {
  const items = [
    { doc, quantity: 2 },
    { doc, quantity: 1 },
  ];

  return (
    <View>
      {items.map((item, i) => (
        <CartLine key={i} item={item} />
      ))}
      <CartTotal items={items} taxRate={0.1} taxLabel="GST" />
    </View>
  );
}`;

export function CartTotalDemo() {
  return (
    <ExpoSnack
      files={createSnackFiles(demoCode)}
      dependencies={snackDependencies}
      name="CartTotal"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
