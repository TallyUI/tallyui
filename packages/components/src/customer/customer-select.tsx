import { ScrollView, View, type ViewProps } from 'react-native';
import { Select } from '@tallyui/primitives';
import { useCustomerTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { CustomerCard } from './customer-card';

export interface CustomerSelectProps extends Omit<ViewProps, 'children'> {
  /** Customer documents to display as options */
  customers: any[];
  /** Currently selected customer (if any) */
  selected?: any;
  /** Called when a customer is selected */
  onSelect: (customer: any) => void;
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
export function CustomerSelect({
  customers,
  selected,
  onSelect,
  onSearch,
  placeholder = 'Search customers...',
  className,
  ...viewProps
}: CustomerSelectProps) {
  const traits = useCustomerTraits();

  // Map selected customer to Select primitive's Option format
  const selectedOption = selected && traits
    ? { value: traits.getId(selected), label: traits.getName(selected) }
    : undefined;

  // Build a lookup so we can resolve the original customer doc on selection
  const customerById = new Map<string, any>();
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
      <View className={cn('gap-2', className)} {...viewProps}>
        {selected && traits && (
          <Select.Trigger asChild>
            <View className="rounded-lg border border-primary bg-primary/5 px-3 py-2">
              <CustomerCard doc={selected} />
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
                    <View className="border-b border-border px-3 py-2">
                      <CustomerCard doc={customer} />
                    </View>
                  </Select.Item>
                );
              })}
            </ScrollView>
          </Select.Content>
        )}
      </View>
    </Select.Root>
  );
}
