'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View } from 'react-native';
import { ProductStockBadge } from '@tallyui/components';

export default function Demo({ doc }) {
  return (
    <View style={{ gap: 8 }}>
      <ProductStockBadge doc={doc} />
      <ProductStockBadge doc={doc} showQuantity />
    </View>
  );
}`;

export function ProductStockBadgeDemo() {
  return (
    <ExpoSnack
      files={createSnackFiles(demoCode)}
      dependencies={snackDependencies}
      name="ProductStockBadge"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
