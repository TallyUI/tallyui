'use client';

import { ExpoSnack } from '../expo-snack';
import { snackDependencies } from './snack-wrapper';

const code = `import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ConnectorProvider } from '@tallyui/core';
import { CustomerCard } from '@tallyui/components';

const customerTraits = {
  getId: (doc) => String(doc.id),
  getName: (doc) => [doc.first_name, doc.last_name].filter(Boolean).join(' ') || 'Guest',
  getEmail: (doc) => doc.email || undefined,
  getPhone: (doc) => doc.phone || undefined,
  getAddressSummary: (doc) => {
    const b = doc.billing;
    if (!b?.address_1) return undefined;
    return [b.address_1, b.city, b.state].filter(Boolean).join(', ');
  },
};

const connector = {
  id: 'demo',
  name: 'Demo',
  description: 'Demo connector',
  auth: { type: 'none', fields: [], getHeaders: () => ({}) },
  schemas: { products: { version: 0, primaryKey: 'id', type: 'object', properties: { id: { type: 'string', maxLength: 100 } }, required: ['id'] } },
  traits: { product: {}, customer: customerTraits },
  sync: { products: { fetchAllIds: async () => [], fetchByIds: async () => [] } },
};

const customers = [
  { id: 1, first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', billing: { address_1: '123 Main St', city: 'Springfield', state: 'IL' } },
  { id: 2, first_name: 'Alex', last_name: 'Johnson', email: 'alex@example.com', billing: { address_1: '456 Oak Ave', city: 'Portland', state: 'OR' } },
];

export default function App() {
  return (
    <ConnectorProvider connector={connector}>
      <View style={styles.container}>
        {customers.map((c) => (
          <View key={c.id} style={styles.card}>
            <CustomerCard doc={c} />
          </View>
        ))}
      </View>
    </ConnectorProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f8f9fa', gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
});`;

export function CustomerCardDemo() {
  return (
    <ExpoSnack
      code={code}
      dependencies={snackDependencies}
      name="CustomerCard"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
