'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text } from 'react-native';
import { ProductCard } from '@tallyui/components';

export default function Demo({ doc }) {
  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <ProductCard doc={doc} onPress={() => alert('Tapped!')} />
      <ProductCard doc={doc} imageSize={120} currencySymbol="\u20ac" />
    </View>
  );
}`;

export function ProductCardDemo() {
  return (
    <ExpoSnack
      files={createSnackFiles(demoCode)}
      dependencies={snackDependencies}
      name="ProductCard"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
