'use client';

import { ExpoSnack } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View } from 'react-native';
import { CartLine, CartTotal } from '@tallyui/components';
import { useProductTraits, useTraitContext, resolvePrice } from '@tallyui/core';

export default function Demo({ doc }) {
  const { getName, getPrices } = useProductTraits();
  const context = useTraitContext();
  const unitPrice = resolvePrice(getPrices(doc, context))?.current;
  if (!unitPrice) return null;

  const items = [2, 1].map((quantity) => ({
    quantity,
    lineTotal: { amount: unitPrice.amount * quantity, currency: unitPrice.currency },
  }));
  const subtotal = {
    amount: items.reduce((sum, item) => sum + item.lineTotal.amount, 0),
    currency: unitPrice.currency,
  };
  const tax = { amount: Math.round(subtotal.amount * 0.1), currency: unitPrice.currency };
  const total = { amount: subtotal.amount + tax.amount, currency: unitPrice.currency };

  return (
    <View>
      {items.map((item, i) => (
        <CartLine key={i} name={getName(doc)} quantity={item.quantity} unitPrice={unitPrice} lineTotal={item.lineTotal} />
      ))}
      <CartTotal subtotal={subtotal} taxLines={[{ label: 'GST', amount: tax }]} total={total} />
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
