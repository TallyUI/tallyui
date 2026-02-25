import { Text, View, StyleSheet, type ViewProps } from 'react-native';

import { useProductTraits } from '@tallyui/core';
import type { CartLineItem } from './cart-line';

export interface CartTotalProps extends Omit<ViewProps, 'children'> {
  /** All cart line items */
  items: CartLineItem[];
  /** Currency symbol (defaults to '$') */
  currencySymbol?: string;
  /** Tax rate as a decimal (e.g. 0.1 for 10%). Defaults to 0. */
  taxRate?: number;
  /** Label for the tax line (defaults to 'Tax') */
  taxLabel?: string;
}

/**
 * Displays a cart summary with subtotal, optional tax, and total.
 *
 * ```tsx
 * <CartTotal items={cartItems} taxRate={0.1} />
 * ```
 */
export function CartTotal({
  items,
  currencySymbol = '$',
  taxRate = 0,
  taxLabel = 'Tax',
  style,
  ...viewProps
}: CartTotalProps) {
  const { getPrice } = useProductTraits();

  const subtotal = items.reduce((sum, item) => {
    const price = getPrice(item.doc);
    return sum + (price ? parseFloat(price) * item.quantity : 0);
  }, 0);

  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return (
    <View style={[styles.container, style]} {...viewProps}>
      <View style={styles.row}>
        <Text style={styles.label}>Subtotal</Text>
        <Text style={styles.value}>{currencySymbol}{subtotal.toFixed(2)}</Text>
      </View>

      {taxRate > 0 && (
        <View style={styles.row}>
          <Text style={styles.label}>{taxLabel}</Text>
          <Text style={styles.value}>{currencySymbol}{tax.toFixed(2)}</Text>
        </View>
      )}

      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{currencySymbol}{total.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
  },
  value: {
    fontSize: 14,
    color: '#374151',
  },
  totalRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
});
