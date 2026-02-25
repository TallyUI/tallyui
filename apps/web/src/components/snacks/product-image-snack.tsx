'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { ProductImage } from '@tallyui/components';

export default function Demo({ doc }) {
  return (
    <>
      <ProductImage doc={doc} size={80} />
      <ProductImage doc={doc} size={120} className="rounded-lg" />
    </>
  );
}`;

export function ProductImageDemo() {
  return (
    <ExpoSnack
      files={createSnackFiles(demoCode)}
      dependencies={snackDependencies}
      name="ProductImage"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
