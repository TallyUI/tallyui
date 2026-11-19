import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  AddressEditor, Button, CustomerDropdown, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Text, useT,
  type AddressEditorValue,
} from '@tallyui/components';
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

/** A small country list for the editor: GB and AU take free-text states, US picks from three. */
const countries = [{ value: 'GB', label: 'United Kingdom' }, { value: 'US', label: 'United States' }, { value: 'AU', label: 'Australia' }];
const US_STATES = [{ value: 'CA', label: 'California' }, { value: 'NY', label: 'New York' }, { value: 'TX', label: 'Texas' }];
const statesFor = (country: string) => (country === 'US' ? US_STATES : undefined);

export default function CustomerDropdownScreen() {
  const t = useT();
  const { height } = useWindowDimensions();
  const [selected, setSelected] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<AddressEditorValue>({});
  const [editing, setEditing] = useState(false);
  // v2 customer.tsx:52: the pin is lit once billing has an address.
  const hasAddress = !!(addresses.billing?.address1 || addresses.billing?.city || addresses.billing?.postcode);
  // v2 use-add-customer.ts:56-67: picking a customer replaces the sale's addresses with theirs (the demo's have none).
  const pick = (customer: Customer | null) => {
    setSelected(customer);
    setAddresses({ billing: customer?.billing, shipping: customer?.shipping });
  };
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6" testID="customer-dropdown-screen">
      <Stack.Screen options={{ title: 'CustomerDropdown' }} />
      {/* v2's cart head row. */}
      <View className="max-w-md rounded-lg border border-border bg-card">
        <View className="border-b border-border px-2 py-2">
          <CustomerDropdown search={search} browse={browse} selected={selected} onSelect={pick} online
            onEditAddress={() => setEditing(true)} hasAddress={hasAddress} />
        </View>
      </View>
      {/* v2's edit-cart-customer dialog: the editor scrolls, the footer stays. */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent testID="address-editor-dialog" className="flex-col overflow-hidden" style={{ maxHeight: Math.max(280, height - 64) }}>
          <DialogHeader><DialogTitle>{t('pos_cart.edit_customer_address')}</DialogTitle></DialogHeader>
          <ScrollView className="flex-1" testID="address-editor-body">
            {/* Keyed by customer, so shipping's link to billing is read again for each. */}
            <AddressEditor key={selected?.id ?? 'guest'} value={addresses} onChange={setAddresses} countries={countries} statesFor={statesFor}
              defaultCountry="GB" />
          </ScrollView>
          <DialogFooter bordered className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-sm text-muted-foreground">{t('pos_cart.changes_save_to_order')}</Text>
            <Button testID="address-editor-done" className="h-11" onPress={() => setEditing(false)}><Text>Done</Text></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollView>
  );
}
