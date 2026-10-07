'use client';

import { ExpoSnack, type ExpoSnackProps } from '../expo-snack';
import { createSnackFiles, snackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { Text, View } from 'react-native';
import { CartPanel, CartLine, CartTotal } from '@tallyui/components';
import { useProductTraits, useTraitContext, resolvePrice } from '@tallyui/core';

export default function Demo({ doc }) {
  const { getName, getPrices } = useProductTraits();
  const context = useTraitContext();
  const unitPrice = resolvePrice(getPrices(doc, context))?.current;
  if (!unitPrice) return <CartPanel items={[]} renderItem={() => null} />;

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
    <CartPanel
      items={items}
      renderItem={(item, index) => (
        <CartLine key={index} name={getName(doc)} quantity={item.quantity} unitPrice={unitPrice} lineTotal={item.lineTotal} />
      )}
      header={
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1f2937' }}>Current Cart</Text>
          <Text style={{ fontSize: 12, color: '#6b7280' }}>2 items</Text>
        </View>
      }
      footer={<CartTotal subtotal={subtotal} taxLines={[{ label: 'GST', amount: tax }]} total={total} />}
    />
  );
}`;

export function CartPanelDemo({
  embedded,
  minWidth,
}: Pick<ExpoSnackProps, 'embedded' | 'minWidth'> = {}) {
  return (
    <ExpoSnack
      files={createSnackFiles(demoCode)}
      dependencies={snackDependencies}
      name="CartPanel"
      platform="web"
      preview={true}
      height="500px"
      embedded={embedded}
      minWidth={minWidth}
    />
  );
}
