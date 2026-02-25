'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { ProductPrice } from '@tallyui/components';

export default function Demo({ doc }) {
  return (
    <>
      <ProductPrice doc={doc} />
      <ProductPrice doc={doc} currencySymbol="\u20ac" />
    </>
  );
}`;

export function ProductPriceDemo() {
  return (
    <ExpoSnack
      files={createSnackFiles(demoCode)}
      dependencies={snackDependencies}
      name="ProductPrice"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
