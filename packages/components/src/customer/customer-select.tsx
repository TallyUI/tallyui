import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Select } from '@tallyui/primitives';
import { useCustomerTraits, type CustomerTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Avatar, avatarInitials, HStack, VStack, type VStackProps } from '../ui';
import { SearchInput } from '../input/search-input';
import { CustomerCard } from './customer-card';

export interface CustomerSelectProps<Doc = any> extends Omit<VStackProps, 'children'> {
  /** Customer documents to display as options */
  customers: Doc[];
  /** Currently selected customer (if any) */
  selected?: Doc | null;
  /** Called when a customer is selected */
  onSelect: (customer: Doc) => void;
  traits?: CustomerTraits<Doc>;
  /** Called when the search text changes */
  onSearch: (query: string) => void;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Renders the search input; pass false when the parent renders its own (as CustomerPicker does) */
  showSearch?: boolean;
  /** Draws an initials avatar before each row and the selected summary, the way v2's cart dropdown does */
  showAvatar?: boolean;
  /** The avatar's tone; defaults to `'primary'`, v2's look (light initials on a solid primary circle) */
  avatarTone?: 'muted' | 'primary';
  className?: string;
}

/**
 * A customer picker that displays a list of customer cards.
 *
 * When a customer is selected, their name is shown as a summary.
 * The parent is responsible for filtering — this component just
 * calls onSearch with the query text and renders whatever customers
 * are passed in.
 *
 * Built on top of the Select primitive for proper accessibility
 * semantics (combobox role, option roles, aria-expanded, aria-checked).
 *
 * ```tsx
 * <CustomerSelect
 *   customers={filteredCustomers}
 *   selected={selectedCustomer}
 *   onSelect={setSelectedCustomer}
 *   onSearch={setSearchQuery}
 * />
 * ```
 */
export function CustomerSelect<Doc>(props: CustomerSelectProps<Doc>) {
  return props.traits ? <CustomerSelectView {...props} /> : <CustomerSelectFromContext {...props} />;
}

function CustomerSelectFromContext<Doc>(props: CustomerSelectProps<Doc>) {
  return <CustomerSelectView {...props} traits={useCustomerTraits()} />;
}

function CustomerSelectView<Doc>({
  customers,
  selected,
  onSelect,
  onSearch,
  placeholder = 'Search customers...',
  showSearch = true,
  showAvatar = false,
  avatarTone = 'primary',
  className,
  traits,
  ...props
}: CustomerSelectProps<Doc>) {
  const [search, setSearch] = useState('');

  // The avatar is decorative: the row's accessibility label already carries the name and email.
  function card(doc: Doc) {
    const customerCard = <CustomerCard doc={doc} traits={traits} />;
    if (!showAvatar) return customerCard;
    return (
      <HStack space="sm">
        <Avatar aria-hidden size="sm" tone={avatarTone} fallback={avatarInitials(traits?.getName(doc) ?? '')} />
        {customerCard}
      </HStack>
    );
  }

  // Map selected customer to Select primitive's Option format
  const selectedOption = selected && traits
    ? { value: traits.getId(selected), label: traits.getName(selected) }
    : undefined;

  // Build a lookup so we can resolve the original customer doc on selection
  const customerById = new Map<string, Doc>();
  if (traits) {
    for (const customer of customers) {
      customerById.set(traits.getId(customer), customer);
    }
  }

  function handleValueChange(option: { value: string; label: string }) {
    const doc = customerById.get(option.value);
    if (doc) onSelect(doc);
  }

  return (
    <Select.Root
      value={selectedOption}
      onValueChange={handleValueChange}
      defaultOpen={true}
    >
      <VStack space="sm" className={cn(className)} {...props}>
        {showSearch && <SearchInput
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            onSearch(text);
          }}
          placeholder={placeholder}
          testID="customer-select-search"
          accessibilityLabel="Search customers"
        />}
        {selected && traits && (
          <Select.Trigger asChild>
            <View className="rounded-lg border border-primary bg-primary/5 px-3 py-2">
              {card(selected)}
            </View>
          </Select.Trigger>
        )}

        {customers.length > 0 && (
          <Select.Content asChild forceMount disablePositioningStyle>
            <ScrollView className="max-h-60">
              {customers.map((customer, index) => {
                const id = traits?.getId(customer) ?? String(index);
                const label = traits?.getName(customer) ?? '';
                const email = traits?.getEmail(customer);
                return (
                  <Select.Item
                    key={id}
                    value={id}
                    label={label}
                    asChild
                  >
                    <Pressable accessibilityLabel={email ? `${label}, ${email}` : label} className="border-b border-border px-3 py-2">
                      {card(customer)}
                    </Pressable>
                  </Select.Item>
                );
              })}
            </ScrollView>
          </Select.Content>
        )}
      </VStack>
    </Select.Root>
  );
}
