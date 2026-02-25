import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { PaymentMethodCard } from './payment-method-card';

export interface PaymentMethod {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface PaymentSelectorProps extends Omit<ViewProps, 'children'> {
  /** Available payment methods */
  methods: PaymentMethod[];
  /** ID of the currently selected method */
  selected: string;
  /** Called when a method is selected */
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * A list of payment method cards where one can be selected at a time.
 *
 * Wraps PaymentMethodCard for each method and manages the selected state.
 *
 * ```tsx
 * <PaymentSelector
 *   methods={[{ id: 'cash', label: 'Cash' }, { id: 'card', label: 'Credit Card' }]}
 *   selected={selectedMethod}
 *   onSelect={setSelectedMethod}
 * />
 * ```
 */
export function PaymentSelector({
  methods,
  selected,
  onSelect,
  className,
  ...viewProps
}: PaymentSelectorProps) {
  return (
    <View className={cn('gap-2', className)} {...viewProps}>
      {methods.map((method) => (
        <PaymentMethodCard
          key={method.id}
          label={method.label}
          selected={method.id === selected}
          onPress={() => onSelect(method.id)}
          icon={method.icon}
        />
      ))}
    </View>
  );
}
