'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { ProductSku } from '@tallyui/components';

export default function Demo({ doc }) {
  return (
    <>
      <ProductSku doc={doc} />
      <ProductSku doc={doc} fallback="N/A" />
    </>
  );
}`;

export function ProductSkuDemo() {
  return (
    <ExpoSnack
      files={createSnackFiles(demoCode)}
      dependencies={snackDependencies}
      name="ProductSku"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
