'use client';

import { ExpoSnack } from '../expo-snack';
import { snackDependencies } from './snack-wrapper';

const code = `import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ConnectorProvider } from '@tallyui/core';
import { CustomerSelect } from '@tallyui/components';

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

const allCustomers = [
  { id: 1, first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', billing: { address_1: '123 Main St', city: 'Springfield', state: 'IL' } },
  { id: 2, first_name: 'Alex', last_name: 'Johnson', email: 'alex@example.com', billing: { address_1: '456 Oak Ave', city: 'Portland', state: 'OR' } },
  { id: 3, first_name: 'Sam', last_name: 'Williams', email: 'sam@example.com', billing: { address_1: '789 Elm Dr', city: 'Austin', state: 'TX' } },
];

export default function App() {
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(null);

  const filtered = allCustomers.filter((c) => {
    const name = (c.first_name + ' ' + c.last_name).toLowerCase();
    return name.includes(query.toLowerCase());
  });

  return (
    <ConnectorProvider connector={connector}>
      <View style={styles.container}>
        <CustomerSelect
          customers={filtered}
          selected={selected}
          onSelect={setSelected}
          onSearch={setQuery}
        />
      </View>
    </ConnectorProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f8f9fa' },
});`;

export function CustomerSelectDemo() {
  return (
    <ExpoSnack
      code={code}
      dependencies={snackDependencies}
      name="CustomerSelect"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
