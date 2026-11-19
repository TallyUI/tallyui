import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { CustomerDropdown } from '@tallyui/components';
import type { Customer } from '@tallyui/core';

/** The dropdown's page size (its PAGE_SIZE, v2's 50): the demo hands out this many per page. */
const PAGE = 50;
const first = ['Ava', 'Ben', 'Cleo', 'Dan', 'Eve', 'Finn', 'Gia', 'Hugo', 'Iris', 'Jack'];
const last = ['Baker', 'Clark', 'Diaz', 'Evans', 'Fox', 'Grant', 'Hill', 'Irwin', 'Jones', 'King', 'Lopez', 'Moore'];
/** Six named customers and 120 more (10 first names x 12 last names), so the browse ends after three pages: 50, 50, 26. */
const customers: Customer[] = [
  ['alice', 'Alice Martin'], ['andy', 'Andy Abbott'], ['joel', 'Joel Abbe'], ['kevin', 'Kevin Ablett'], ['priya', 'Priya Shah'], ['sam', 'Sam Lee'],
  ...last.flatMap((surname) => first.map((given) => [`${given}-${surname}`.toLowerCase(), `${given} ${surname}`])),
].map(([id, name]) => ({ id, name, email: `${id}@example.com` }));
const lastName = (customer: Customer) => customer.name.split(' ').at(-1) ?? '';
const sorted = [...customers].sort((a, b) => lastName(a).localeCompare(lastName(b)));
const slice = (all: Customer[], page: number) => all.slice((page - 1) * PAGE, page * PAGE);

/** Made-up customers matched by name or email, case-insensitive, a page at a time after a 300 ms wait (a stand-in for the connector). */
const search = (query: string, page = 1) => new Promise<Customer[]>((resolve) => setTimeout(() => resolve(slice(customers.filter((customer) =>
  `${customer.name} ${customer.email}`.toLowerCase().includes(query.trim().toLowerCase())), page)), 300));
/** v2's customer browse for an empty query: the made-up customers by last name, a page at a time, after the same wait. */
const browse = (page = 1) => new Promise<Customer[]>((resolve) => setTimeout(() => resolve(slice(sorted, page)), 300));

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
          <CustomerDropdown search={search} browse={browse} selected={selected} onSelect={setSelected} online
            onEditAddress={() => setHasAddress((on) => !on)} hasAddress={hasAddress} />
        </View>
      </View>
    </ScrollView>
  );
}
