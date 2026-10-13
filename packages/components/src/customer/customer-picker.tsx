import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { customerTraits, CustomerServiceError, ConnectorUnauthorizedError, type Customer, type CustomerInput } from '@tallyui/core';
import { cn } from '@tallyui/theme';
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
  /** Called for errors the picker can't explain to the cashier, including `ConnectorUnauthorizedError`: sign in again only when its `code` is `'unauthorized'` (401). `'forbidden'` (403) means signed in but not allowed; never sign out for it. */
  onError?: (error: unknown) => void;
  /** false disables search and create (online only in v1). */
  online: boolean;
  /** Debounce before a search, ms. */
  debounceMs?: number;
  className?: string;
  /** testID of the search field, for e2e tests. Default `customer-picker-search`. */
  testID?: string;
}

/** `@tallyui/core/server`'s `payloadBoundErrors` bound on `customer.email`, in UTF-16 code units. */
const EMAIL_MAX = 254;
/** A simple shape, not RFC 5322: one `@`, a non-empty local part, a domain with text either side of a dot, no whitespace or NUL. */
const EMAIL_SHAPE = /^[^\s@\u0000]+@[^\s@\u0000]+\.[^\s@\u0000]+$/u;

export function CustomerPicker({ search, create, selected, onSelect, onError, online, debounceMs = 250, className, testID = 'customer-picker-search' }: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<CustomerFormValues>({ firstName: '', lastName: '', email: '', phone: '', address: '' });
  const sequence = useRef(0);
  const searchRef = useRef(search);
  searchRef.current = search;
  const [noResults, setNoResults] = useState(false);

  function handleError(error: unknown) {
    if (error instanceof CustomerServiceError) {
      setError(error.code === 'network' ? "Couldn't reach the store. Try again."
        : error.code === 'server' ? "The store couldn't do that. Try again." : error.message);
    } else {
      setError(error instanceof ConnectorUnauthorizedError && error.code === 'unauthorized' ? 'Sign in again to continue.'
        : error instanceof ConnectorUnauthorizedError && error.code === 'forbidden' ? "Your account isn't allowed to do this on this store. Ask the store owner."
          : 'Something went wrong. Try again.');
      onError?.(error);
    }
  }

  useEffect(() => {
    const current = ++sequence.current;
    setNoResults(false);
    setError(null);
    if (!online || !query.trim()) { setCustomers([]); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await searchRef.current(query);
        if (current === sequence.current) { setCustomers(results); setNoResults(results.length === 0); }
      } catch (error) {
        if (current === sequence.current) handleError(error);
      }
    }, debounceMs);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [query, online, debounceMs]);

  async function submit() {
    const email = values.email.trim();
    if (!online || !create || creating || !email) return;
    // The till sends this email in order.create, whose shape check refuses one over 254 characters: refuse it here instead.
    if (email.length > EMAIL_MAX || !EMAIL_SHAPE.test(email)) return setError(`Enter a valid email address (up to ${EMAIL_MAX} characters)`);
    setCreating(true);
    setError(null);
    try {
      const created = await create({ email,
        ...(values.firstName.trim() ? { firstName: values.firstName.trim() } : {}),
        ...(values.lastName.trim() ? { lastName: values.lastName.trim() } : {}),
        ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
      });
      onSelect(created);
      setValues({ firstName: '', lastName: '', email: '', phone: '', address: '' });
      setShowForm(false);
    } catch (error) {
      handleError(error);
    } finally {
      setCreating(false);
    }
  }

  return <View className={cn('gap-3', className)}>
    {selected && <View>
      <CustomerCard doc={selected} traits={customerTraits} />
      <Pressable accessibilityRole="button" className="items-center rounded-lg border border-border px-4 py-3" onPress={() => onSelect(null)}><Text className="text-sm font-semibold text-foreground">Remove customer</Text></Pressable>
    </View>}
    <Text className="text-xs font-medium text-muted-foreground">Search customers</Text>
    <TextInput accessibilityLabel="Search customers" testID={testID} value={query} onChangeText={setQuery} editable={online}
      className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
      placeholderTextColorClassName="accent-muted-foreground" placeholder="Name or email" />
    {!online && <Text className="text-sm text-muted-foreground">Connect to search or add customers.</Text>}
    {noResults && <Text className="text-sm text-muted-foreground">No customers found.</Text>}
    {error && <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text>}
    <CustomerSelect customers={customers} traits={customerTraits} onSearch={setQuery} showSearch={false}
      onSelect={(customer) => { onSelect(customer); setQuery(''); }} />
    {create && <Pressable accessibilityRole="button" disabled={!online || creating} onPress={() => setShowForm(true)}
      className={cn('items-center rounded-lg border border-border px-4 py-3', (!online || creating) && 'opacity-50')}>
      <Text className="text-sm font-semibold text-foreground">New customer</Text>
    </Pressable>}
    {showForm && <View>
      <CustomerForm values={values} showAddress={false}
        onChangeField={(field, value) => setValues((current) => ({ ...current, [field]: value }))} />
      <View className="flex-row gap-3">
        <Pressable accessibilityRole="button" disabled={!online || creating || !values.email.trim()} onPress={submit}
          className={cn('items-center rounded-lg bg-primary px-4 py-3', (!online || creating || !values.email.trim()) && 'opacity-50')}>
          <Text className="text-sm font-semibold text-primary-foreground">Save Customer</Text>
        </Pressable>
        <Pressable accessibilityRole="button" className="items-center rounded-lg border border-border px-4 py-3"
          onPress={() => { setShowForm(false); setValues({ firstName: '', lastName: '', email: '', phone: '', address: '' }); }}>
          <Text className="text-sm font-semibold text-foreground">Cancel</Text>
        </Pressable>
      </View>
    </View>}
  </View>;
}
