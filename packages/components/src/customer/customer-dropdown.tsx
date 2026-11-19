// Port of WCPOS v2 (monorepo main) pos/cart/customer.tsx and components/customer-select.tsx (CustomerSearch, CustomerList,
// CustomerSelectItem): the cart header's customer chip and its search dropdown; MIT, WCPOS.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { CustomerServiceError, type Customer } from '@tallyui/core';
import { Popover } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { Avatar, avatarInitials, Input, UserIcon } from '../ui';
import { MapPinIcon } from '../ui/icon/map-pin-icon';
import { customerErrorText } from './customer-picker';

/** line-popover.tsx's focus targets: here the search field and the rows. */
const FOCUSABLE = 'button, [href], input, [tabindex]:not([tabindex="-1"])';
const row = 'min-h-11 flex-row items-center gap-2 rounded-md px-2 py-1.5 web:focus:bg-accent';
/** v2's SEARCH_SELECT_PAGE_SIZE (monorepo packages/core/src/query/search-select.ts:28): a page shorter than this is the last one. */
const PAGE_SIZE = 50;

export interface CustomerDropdownProps {
  /** The connector's searchCustomers, bound to its context by the app. `page` (1-based) asks for the next 50 when the cashier reaches the end of the list; absent means the first page. */
  search: (query: string, page?: number) => Promise<Customer[]>;
  /** The first customers to list for an empty query (v2's customer browse, e.g. the first 50 by last name). Absent: an empty query lists Guest alone. `page` (1-based) asks for the next 50 when the cashier reaches the end of the list; absent means the first page. */
  browse?: (page?: number) => Promise<Customer[]>;
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
  /** Opens the app's editor for the sale's addresses (v2's split pin beside the chip). Absent: no pin. */
  onEditAddress?: () => void;
  /** Default `false`; false greys the pin until the sale's billing has an address, as in v2. */
  hasAddress?: boolean;
}

/** v2's GuestAvatar: the Guest is not a person, so a neutral glyph on a muted circle, never initials. */
export function GuestGlyph() {
  return <View className="h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground"><UserIcon size={14} /></View>;
}

/** v2's cart-header customer chip (the sale's customer, or Guest); it opens a search panel anchored under it, Guest first. */
export function CustomerDropdown({ search, browse, selected, onSelect, onError, online, debounceMs = 250, className, testID = 'customer-dropdown-chip', onEditAddress, hasAddress = false }: CustomerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;
  const browseRef = useRef(browse);
  browseRef.current = browse;
  const canBrowse = browse !== undefined;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const chip = useRef<View>(null);
  const name = selected?.name ?? 'Guest';
  // The shown rows' paging: their generation (any newer first page makes older pages stale), query, last page loaded
  // (0 until the first page resolves), whether there is no more, and v2's latch (one later page in flight).
  const paging = useRef({ gen: 0, query: '', page: 0, done: false, busy: false });

  // CustomerPicker's search: debounced, a stale response dropped; nothing sent offline; a blank query sends `browse` while
  // open (when given), else nothing.
  useEffect(() => {
    paging.current = { gen: paging.current.gen + 1, query, page: 0, done: false, busy: false };
    const p = paging.current;
    const stale = () => paging.current.gen !== p.gen;
    setError(null);
    const blank = !query.trim();
    if (!online || (blank && (!canBrowse || !open))) { setCustomers([]); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await (blank ? browseRef.current?.() ?? [] : searchRef.current(query));
        if (stale()) return;
        setCustomers(results);
        p.page = 1;
        p.done = results.length < PAGE_SIZE;
      } catch (error) {
        if (stale()) return;
        setError(customerErrorText(error));
        if (!(error instanceof CustomerServiceError)) onErrorRef.current?.(error);
      }
    }, blank ? 0 : debounceMs);
    return () => { clearTimeout(timer); paging.current.gen++; };
  }, [query, online, debounceMs, open, canBrowse]);

  // v2's next page at the end of the list: the next 50 for the query the rows came from, one request at a time, never
  // offline; rows are kept by customer id.
  const more = async () => {
    const p = paging.current;
    if (!online || !open || p.page < 1 || p.done || p.busy) return;
    p.busy = true;
    const next = p.page + 1;
    try {
      const results = await (p.query.trim() ? searchRef.current(p.query, next) : browseRef.current?.(next) ?? []);
      if (paging.current.gen !== p.gen) return;
      setError(null);
      const held = new Set(customers.map((customer) => customer.id));
      const fresh = results.filter((customer) => !held.has(customer.id));
      setCustomers((rows) => [...rows, ...fresh]);
      p.page = next;
      if (results.length < PAGE_SIZE) p.done = true;
      if (!fresh.length) p.done = true;
    } catch (error) {
      if (paging.current.gen !== p.gen) return;
      setError(customerErrorText(error));
      if (!(error instanceof CustomerServiceError)) onErrorRef.current?.(error);
    } finally { p.busy = false; }
  };
  // v2's onEndReachedThreshold={0.1}: within a tenth of the visible height of the end.
  const onScroll = ({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (contentSize.height - (contentOffset.y + layoutMeasurement.height) <= 0.1 * layoutMeasurement.height) void more();
  };

  // Each open starts, and each close leaves, an empty query with no results.
  const openChange = (next: boolean) => { setQuery(''); setCustomers([]); setOpen(next); };
  const pick = (customer: Customer | null) => { openChange(false); onSelect(customer); };
  const split = onEditAddress !== undefined && !open;

  // The products column's filter pill, as in v2; lit while open like a pill that is on. With onEditAddress and closed it is
  // the left cell of v2's split chip, the pill frame on the wrapper below.
  const trigger = <Popover.Trigger ref={chip} testID={testID} accessibilityLabel={`Customer: ${name}`}
    className={split ? 'flex-row items-center gap-1.5 rounded-l-full px-3 web:hover:bg-accent'
      : cn('min-h-11 flex-row items-center gap-1.5 rounded-full border border-border px-3', open ? 'border-primary/30 bg-primary/10' : 'bg-card')}>
    {open ? <><View className="text-muted-foreground"><UserIcon size={16} /></View><Text className="text-foreground">Select Customer</Text></>
      : <>{selected ? <Avatar tone="primary" className="h-6 w-6" fallback={avatarInitials(selected.name)} aria-hidden /> : <GuestGlyph />}
        <Text numberOfLines={1} className="text-foreground">{name}</Text></>}
  </Popover.Trigger>;

  return <View className={cn('flex-row items-center gap-2', className)}>
    <Text className="text-muted-foreground">Customer</Text>
    <Popover.Root open={open} onOpenChange={openChange}>
      {/* The wrapper stays while open (no frame, no pin) so the trigger is not remounted and focus can return to it on close. */}
      {onEditAddress ? <View className={cn('flex-row', split && 'min-h-11 items-stretch rounded-full border border-border bg-card')}>
        {trigger}
        {split && <Pressable role="button" accessibilityLabel="Edit Customer Address" testID="customer-dropdown-address" onPress={onEditAddress}
          className="min-w-11 items-center justify-center rounded-r-full border-l border-border web:hover:bg-accent">
          <View className={hasAddress ? 'text-foreground' : 'text-muted-foreground'}><MapPinIcon size={16} /></View>
        </Pressable>}
      </View> : trigger}
      <Popover.Portal>
        <Popover.Overlay style={StyleSheet.absoluteFill} />
        <Popover.Content testID="customer-dropdown" align="start" sideOffset={4} className="z-50 w-80 rounded-md border border-border bg-popover p-2 shadow-md outline-none">
          <Panel chip={chip} onClose={() => openChange(false)}>
            <Input className="mb-2"><Input.Field accessibilityLabel="Search customers" placeholder="Search Customers" testID="customer-dropdown-search"
              value={query} onChangeText={setQuery} editable={online} /></Input>
            {!online && <Text className="text-sm text-muted-foreground">Connect to search customers.</Text>}
            {error && <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text>}
            {/* Guest first, always: v2's cart dropdown prepends it, so a search with no matches shows Guest alone. */}
            <ScrollView className="max-h-60" testID="customer-dropdown-list" onScroll={onScroll} scrollEventThrottle={16}>
              <Pressable role="option" aria-selected={selected === null} testID="customer-dropdown-option-guest" accessibilityLabel="Guest" onPress={() => pick(null)} className={row}>
                <GuestGlyph />
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
