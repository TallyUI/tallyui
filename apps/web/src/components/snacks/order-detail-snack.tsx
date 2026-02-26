'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { OrderDetail } from '@tallyui/components';

export default function Demo() {
  return (
    <View style={{ gap: 24 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>Basic order</Text>
      <OrderDetail
        orderNumber="#1042"
        status="completed"
        lineItems={[
          { name: 'Espresso', quantity: 2, total: '$9.00' },
          { name: 'Croissant', quantity: 1, total: '$4.50' },
        ]}
        subtotal="$13.50"
        tax="$1.08"
        total="$14.58"
      />

      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>With slots</Text>
      <OrderDetail
        orderNumber="#1043"
        status="processing"
        lineItems={[
          { name: 'Latte', quantity: 1, total: '$5.50' },
          { name: 'Muffin', quantity: 2, total: '$7.00' },
          { name: 'Orange Juice', quantity: 1, total: '$3.50' },
        ]}
        subtotal="$16.00"
        tax="$1.28"
        total="$17.28"
        customerSlot={
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>Jane Smith</Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>jane@example.com</Text>
          </View>
        }
        paymentSlot={
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: '#6b7280' }}>Cash</Text>
            <Text style={{ fontSize: 13, color: '#111' }}>$20.00</Text>
          </View>
        }
        footerSlot={
          <Pressable style={{ backgroundColor: '#6366f1', borderRadius: 8, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Print Receipt</Text>
          </Pressable>
        }
      />
    </View>
  );
}`;

export function OrderDetailDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="OrderDetail"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
