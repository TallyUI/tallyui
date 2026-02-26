'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CustomerOrderHistory } from '@tallyui/components';

const sampleOrders = [
  { id: '1001', date: '2026-02-20', total: 149.99, items: 3 },
  { id: '1002', date: '2026-02-18', total: 42.50, items: 1 },
  { id: '1003', date: '2026-02-10', total: 275.00, items: 5 },
];

function OrderRow({ order }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.orderId}>Order #{order.id}</Text>
        <Text style={styles.orderMeta}>{order.date} — {order.items} items</Text>
      </View>
      <Text style={styles.orderTotal}>${'$'}{order.total.toFixed(2)}</Text>
    </View>
  );
}

export default function Demo() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>With Orders</Text>
      <CustomerOrderHistory
        orders={sampleOrders}
        renderItem={(order) => <OrderRow order={order} />}
      />

      <Text style={styles.heading}>Empty State</Text>
      <CustomerOrderHistory
        orders={[]}
        renderItem={(order) => <OrderRow order={order} />}
        emptyState={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No orders found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8f9fa', gap: 16 },
  heading: { fontSize: 14, fontWeight: '700', color: '#111827' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 12 },
  rowLeft: { gap: 2 },
  orderId: { fontSize: 14, fontWeight: '600', color: '#111827' },
  orderMeta: { fontSize: 12, color: '#6b7280' },
  orderTotal: { fontSize: 14, fontWeight: '700', color: '#374151' },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#9ca3af' },
});`;

export function CustomerOrderHistoryDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="CustomerOrderHistory"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
