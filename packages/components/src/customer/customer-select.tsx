import { Pressable, ScrollView, View } from 'react-native';
import { Select } from '@tallyui/primitives';
import { useCustomerTraits, type CustomerTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { VStack, type VStackProps } from '../ui';
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
  className,
  traits,
  ...props
}: CustomerSelectProps<Doc>) {

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
        {selected && traits && (
          <Select.Trigger asChild>
            <View className="rounded-lg border border-primary bg-primary/5 px-3 py-2">
              <CustomerCard doc={selected} traits={traits} />
            </View>
          </Select.Trigger>
        )}

        {customers.length > 0 && (
          <Select.Content asChild forceMount disablePositioningStyle>
            <ScrollView className="max-h-60">
              {customers.map((customer, index) => {
                const id = traits?.getId(customer) ?? String(index);
                const label = traits?.getName(customer) ?? '';
                return (
                  <Select.Item
                    key={id}
                    value={id}
                    label={label}
                    asChild
                  >
                    <Pressable accessibilityLabel={label} className="border-b border-border px-3 py-2">
                      <CustomerCard doc={customer} traits={traits} />
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
