import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { CustomerDropdown } from '@tallyui/components';
import type { Customer } from '@tallyui/core';

const customers: Customer[] = [
  ['alice', 'Alice Martin'], ['andy', 'Andy Abbott'], ['joel', 'Joel Abbe'], ['kevin', 'Kevin Ablett'], ['priya', 'Priya Shah'], ['sam', 'Sam Lee'],
].map(([id, name]) => ({ id, name, email: `${id}@example.com` }));

/** Made-up customers matched by name or email, case-insensitive, after a 300 ms wait (a stand-in for the connector). */
const search = (query: string) => new Promise<Customer[]>((resolve) => setTimeout(() => resolve(customers.filter((customer) =>
  `${customer.name} ${customer.email}`.toLowerCase().includes(query.trim().toLowerCase()))), 300));

export default function CustomerDropdownScreen() {
  const [selected, setSelected] = useState<Customer | null>(null);
  const [hasAddress, setHasAddress] = useState(false);
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6" testID="customer-dropdown-screen">
      <Stack.Screen options={{ title: 'CustomerDropdown' }} />
      {/* v2's cart head row. */}
      <View className="max-w-md rounded-lg border border-border bg-card">
        <View className="border-b border-border px-2 py-2">
          {/* The pin's toggle stands in for the app's address editor. */}
          <CustomerDropdown search={search} selected={selected} onSelect={setSelected} online
            onEditAddress={() => setHasAddress((on) => !on)} hasAddress={hasAddress} />
        </View>
      </View>
    </ScrollView>
  );
}
