'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text } from 'react-native';
import { OrderList, OrderCard } from '@tallyui/components';

const orders = [
  { id: '1', number: '#1042', date: 'Feb 26, 2026', total: '$48.50', status: 'completed', customer: 'Jane Smith' },
  { id: '2', number: '#1043', date: 'Feb 26, 2026', total: '$12.00', status: 'pending', customer: null },
  { id: '3', number: '#1044', date: 'Feb 25, 2026', total: '$95.75', status: 'processing', customer: 'Bob Wilson' },
];

export default function Demo() {
  return (
    <View style={{ gap: 24 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>With orders</Text>
      <OrderList
        items={orders}
        renderItem={(order) => (
          <OrderCard
            orderNumber={order.number}
            date={order.date}
            total={order.total}
            status={order.status}
            customerName={order.customer}
          />
        )}
        headerSlot={<Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111' }}>Recent Orders</Text>}
      />

      <Text style={{ fontSize: 14, fontWeight: '600', color: '#6b7280' }}>Empty state</Text>
      <OrderList
        items={[]}
        renderItem={() => null}
        emptyState={
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: '#9ca3af' }}>No orders yet</Text>
          </View>
        }
      />
    </View>
  );
}`;

export function OrderListDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="OrderList"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
