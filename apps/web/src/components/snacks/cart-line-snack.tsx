'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View } from 'react-native';
import { CartLine } from '@tallyui/components';

export default function Demo({ doc }) {
  return (
    <View style={{ gap: 4 }}>
      <CartLine item={{ doc, quantity: 1 }} />
      <CartLine item={{ doc, quantity: 3 }} currencySymbol="\u20ac" />
    </View>
  );
}`;

export function CartLineDemo() {
  return (
    <ExpoSnack
      files={createSnackFiles(demoCode)}
      dependencies={snackDependencies}
      name="CartLine"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
