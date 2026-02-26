'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text } from 'react-native';
import { ReceiptPreview } from '@tallyui/components';

export default function Demo() {
  return (
    <View style={{ gap: 24 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>Basic receipt</Text>
      <ReceiptPreview
        items={[
          { name: 'Espresso', quantity: 2, total: '$9.00' },
          { name: 'Croissant', quantity: 1, total: '$4.50' },
        ]}
        subtotal="$13.50"
        tax="$1.08"
        total="$14.58"
      />

      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>With payments</Text>
      <ReceiptPreview
        items={[
          { name: 'Latte', quantity: 1, total: '$5.50' },
          { name: 'Muffin', quantity: 2, total: '$7.00' },
        ]}
        subtotal="$12.50"
        tax="$1.00"
        total="$13.50"
        payments={[
          { method: 'Cash', amount: '$20.00' },
          { method: 'Change', amount: '$6.50' },
        ]}
        headerSlot={<Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111' }}>My Coffee Shop</Text>}
        footerSlot={<Text style={{ fontSize: 12, color: '#6b7280' }}>Thank you for your purchase!</Text>}
      />
    </View>
  );
}`;

export function ReceiptPreviewDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="ReceiptPreview"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
