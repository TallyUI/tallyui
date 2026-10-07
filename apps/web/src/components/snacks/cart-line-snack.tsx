'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View } from 'react-native';
import { CartLine } from '@tallyui/components';
import { useProductTraits, useTraitContext, resolvePrice } from '@tallyui/core';

export default function Demo({ doc }) {
  const { getName, getPrices } = useProductTraits();
  const context = useTraitContext();
  const unitPrice = resolvePrice(getPrices(doc, context))?.current;
  if (!unitPrice) return null;

  return (
    <View style={{ gap: 4 }}>
      <CartLine name={getName(doc)} quantity={1} unitPrice={unitPrice} lineTotal={{ amount: unitPrice.amount * 1, currency: unitPrice.currency }} />
      <CartLine name={getName(doc)} quantity={3} unitPrice={unitPrice} lineTotal={{ amount: unitPrice.amount * 3, currency: unitPrice.currency }} locale="de-DE" />
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
