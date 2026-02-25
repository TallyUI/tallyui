'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { ProductTitle } from '@tallyui/components';

export default function Demo({ doc }) {
  return (
    <>
      <ProductTitle doc={doc} />
      <ProductTitle doc={doc} className="text-lg font-bold text-primary" />
    </>
  );
}`;

export function ProductTitleDemo() {
  return (
    <ExpoSnack
      files={createSnackFiles(demoCode)}
      dependencies={snackDependencies}
      name="ProductTitle"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
