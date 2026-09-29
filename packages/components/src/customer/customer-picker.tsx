import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { customerTraits, CustomerServiceError, type Customer, type CustomerInput } from '@tallyui/core';
import { CustomerCard } from './customer-card';
import { CustomerSelect } from './customer-select';
import { CustomerForm, type CustomerFormValues } from './customer-form';

export interface CustomerPickerProps {
  /** The connector's searchCustomers, bound to its context by the app. */
  search: (query: string) => Promise<Customer[]>;
  /** The connector's createCustomer, bound; absent hides "New customer". */
  create?: (input: CustomerInput) => Promise<Customer>;
  selected: Customer | null;
  onSelect: (customer: Customer | null) => void;
  /** false disables search and create (online only in v1). */
  online: boolean;
  /** Debounce before a search, ms. */
  debounceMs?: number;
  className?: string;
}

export function CustomerPicker({ search, create, selected, onSelect, online, debounceMs = 250, className }: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<CustomerFormValues>({ firstName: '', lastName: '', email: '', phone: '', address: '' });
  const sequence = useRef(0);

  useEffect(() => {
    const current = ++sequence.current;
    setError(null);
    if (!online || !query.trim()) { setCustomers([]); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await search(query);
        if (current === sequence.current) setCustomers(results);
      } catch (error) {
        if (current === sequence.current) setError(error instanceof CustomerServiceError && error.code === 'network'
          ? "Couldn't reach the store. Try again." : error instanceof Error ? error.message : String(error));
      }
    }, debounceMs);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [query, online, search, debounceMs]);

  async function submit() {
    if (!online || !create || creating || !values.email.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await create({ email: values.email,
        ...(values.firstName ? { firstName: values.firstName } : {}),
        ...(values.lastName ? { lastName: values.lastName } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
      });
      onSelect(created);
      setShowForm(false);
    } catch (error) {
      setError(error instanceof CustomerServiceError && error.code === 'network'
        ? "Couldn't reach the store. Try again." : error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  return <View className={className}>
    {selected && <View>
      <CustomerCard doc={selected} traits={customerTraits} />
      <Pressable accessibilityRole="button" onPress={() => onSelect(null)}><Text>Guest</Text></Pressable>
    </View>}
    <Text>Search customers</Text>
    <TextInput accessibilityLabel="Search customers" value={query} onChangeText={setQuery} editable={online} />
    {!online && <Text>Connect to search or add customers.</Text>}
    {error && <Text accessibilityRole="alert">{error}</Text>}
    <CustomerSelect customers={customers} traits={customerTraits} onSearch={setQuery}
      onSelect={(customer) => { onSelect(customer); setQuery(''); }} />
    {create && <Pressable accessibilityRole="button" disabled={!online || creating} onPress={() => setShowForm(true)}>
      <Text>New customer</Text>
    </Pressable>}
    {showForm && <View>
      <CustomerForm values={values} showAddress={false}
        onChangeField={(field, value) => setValues((current) => ({ ...current, [field]: value }))} />
      <Pressable accessibilityRole="button" disabled={!online || creating || !values.email.trim()} onPress={submit}>
        <Text>Save Customer</Text>
      </Pressable>
    </View>}
  </View>;
}
