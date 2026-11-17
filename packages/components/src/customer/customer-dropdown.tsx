// Port of WCPOS v2 (monorepo main) pos/cart/customer.tsx and components/customer-select.tsx (CustomerSearch, CustomerList,
// CustomerSelectItem): the cart header's customer chip and its search dropdown; MIT, WCPOS.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CustomerServiceError, type Customer } from '@tallyui/core';
import { Popover } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { Avatar, avatarInitials, Input, UserIcon } from '../ui';
import { customerErrorText } from './customer-picker';

/** line-popover.tsx's focus targets: here the search field and the rows. */
const FOCUSABLE = 'button, [href], input, [tabindex]:not([tabindex="-1"])';
const row = 'min-h-11 flex-row items-center gap-2 rounded-md px-2 py-1.5 web:focus:bg-accent';

export interface CustomerDropdownProps {
  /** The connector's searchCustomers, bound to its context by the app. */
  search: (query: string) => Promise<Customer[]>;
  selected: Customer | null;
  /** A customer, or null for Guest. */
  onSelect: (customer: Customer | null) => void;
  /** Called for errors the dropdown can't explain to the cashier, including `ConnectorUnauthorizedError`: sign in again only when its `code` is `'unauthorized'` (401). `'forbidden'` (403) means signed in but not allowed; never sign out for it. */
  onError?: (error: unknown) => void;
  /** false disables search; Guest stays selectable. */
  online: boolean;
  /** Debounce before a search, ms. Default 250. */
  debounceMs?: number;
  className?: string;
  /** testID of the chip. Default `customer-dropdown-chip`. */
  testID?: string;
}

/** v2's cart-header customer chip (the sale's customer, or Guest); it opens a search panel anchored under it, Guest first. */
export function CustomerDropdown({ search, selected, onSelect, onError, online, debounceMs = 250, className, testID = 'customer-dropdown-chip' }: CustomerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const chip = useRef<View>(null);
  const name = selected?.name ?? 'Guest';

  // CustomerPicker's search: debounced, a stale response dropped, nothing sent for a blank query or offline.
  useEffect(() => {
    let stale = false;
    setError(null);
    if (!online || !query.trim()) { setCustomers([]); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await searchRef.current(query);
        if (!stale) setCustomers(results);
      } catch (error) {
        if (stale) return;
        setError(customerErrorText(error));
        if (!(error instanceof CustomerServiceError)) onErrorRef.current?.(error);
      }
    }, debounceMs);
    return () => { clearTimeout(timer); stale = true; };
  }, [query, online, debounceMs]);

  // Each open starts, and each close leaves, an empty query with no results.
  const openChange = (next: boolean) => { setQuery(''); setCustomers([]); setOpen(next); };
  const pick = (customer: Customer | null) => { openChange(false); onSelect(customer); };

  return <View className={cn('flex-row items-center gap-2', className)}>
    <Text className="text-muted-foreground">Customer</Text>
    <Popover.Root open={open} onOpenChange={openChange}>
      {/* The products column's filter pill, as in v2; lit while open like a pill that is on. */}
      <Popover.Trigger ref={chip} testID={testID} accessibilityLabel={`Customer: ${name}`}
        className={cn('min-h-11 flex-row items-center gap-1.5 rounded-full border border-border px-3', open ? 'border-primary/30 bg-primary/10' : 'bg-card')}>
        {open ? <><View className="text-muted-foreground"><UserIcon size={16} /></View><Text className="text-foreground">Select Customer</Text></>
          : <><Avatar tone="primary" className="h-6 w-6" fallback={avatarInitials(name)} aria-hidden /><Text numberOfLines={1} className="text-foreground">{name}</Text></>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay style={StyleSheet.absoluteFill} />
        <Popover.Content testID="customer-dropdown" align="start" sideOffset={4} className="z-50 w-80 rounded-md border border-border bg-popover p-2 shadow-md outline-none">
          <Panel chip={chip} onClose={() => openChange(false)}>
            <Input className="mb-2"><Input.Field accessibilityLabel="Search customers" placeholder="Search Customers" testID="customer-dropdown-search"
              value={query} onChangeText={setQuery} editable={online} /></Input>
            {!online && <Text className="text-sm text-muted-foreground">Connect to search customers.</Text>}
            {error && <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text>}
            {/* Guest first, always: v2's cart dropdown prepends it, so a search with no matches shows Guest alone. */}
            <ScrollView className="max-h-60">
              <Pressable role="option" aria-selected={selected === null} testID="customer-dropdown-option-guest" accessibilityLabel="Guest" onPress={() => pick(null)} className={row}>
                <View className="h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground"><UserIcon size={14} /></View>
                <Text className="text-foreground">Guest</Text>
              </Pressable>
              {customers.map((customer) => <Pressable key={customer.id} role="option" aria-selected={selected?.id === customer.id} testID={`customer-dropdown-option-${customer.id}`}
                accessibilityLabel={customer.email ? `${customer.name}, ${customer.email}` : customer.name} onPress={() => pick(customer)} className={row}>
                <Avatar tone="primary" className="h-6 w-6" fallback={avatarInitials(customer.name)} aria-hidden />
                <View className="flex-1"><Text className="text-foreground">{customer.name}</Text>
                  {customer.email ? <Text className="text-sm text-muted-foreground">{customer.email}</Text> : null}</View>
              </Pressable>)}
            </ScrollView>
          </Panel>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </View>;
}

/** Web: focus goes to the search field, and back to the chip on close; arrows move between the field and the rows, wrapping
 * (v2's use-arrow-key-navigation, scoped to the panel); Escape closes; Space picks a focused row (Enter is react-native-web's own press). */
function Panel({ chip, onClose, children }: { chip: RefObject<View | null>; onClose: () => void; children: ReactNode }) {
  const panel = useRef<View>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const node = panel.current as unknown as HTMLElement | null;
    const trigger = chip.current as unknown as HTMLElement | null;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Escape') closeRef.current();
      else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length) {
        event.preventDefault();
        items[at < 0 ? 0 : (at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      } else if (event.key === ' ' && items[at]?.getAttribute('role') === 'option') {
        event.preventDefault();
        items[at].click();
      }
    };
    // Capture phase: react-native-web's TextInput stops keydown propagation (TextInput/index.js, "see #612"), so a bubble listener never hears the field.
    document.addEventListener('keydown', onKeyDown, true);
    return () => { document.removeEventListener('keydown', onKeyDown, true); trigger?.focus?.(); };
  }, [chip]);
  return <View ref={panel}>{children}</View>;
}
