import { Pressable, ScrollView, Text, View, type ViewProps } from 'react-native';
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

  return (
    <View className={cn('gap-2', className)} {...viewProps}>
      {selected && traits && (
        <View className="rounded-lg border border-primary bg-primary/5 px-3 py-2">
          <CustomerCard doc={selected} />
        </View>
      )}

      {customers.length > 0 && (
        <ScrollView className="max-h-60">
          {customers.map((customer, index) => {
            const id = traits?.getId(customer) ?? index;
            return (
              <Pressable key={id} onPress={() => onSelect(customer)}>
                <View className="border-b border-border px-3 py-2">
                  <CustomerCard doc={customer} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
