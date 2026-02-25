import { Text, View, StyleSheet, type ViewProps } from 'react-native';

import { useProductTraits } from '@tallyui/core';

export interface CartLineItem {
  /** The raw product document (connector-specific shape) */
  doc: any;
  /** Quantity in cart */
  quantity: number;
}

export interface CartLineProps extends Omit<ViewProps, 'children'> {
  /** The cart line item */
  item: CartLineItem;
  /** Currency symbol (defaults to '$') */
  currencySymbol?: string;
}

/**
 * Displays a single cart line item: product name, quantity, and line total.
 *
 * ```tsx
 * <CartLine item={{ doc: productDocument, quantity: 2 }} />
 * ```
 */
export function CartLine({ item, currencySymbol = '$', style, ...viewProps }: CartLineProps) {
  const { getName, getPrice } = useProductTraits();
  const name = getName(item.doc);
  const unitPrice = getPrice(item.doc);
  const lineTotal = unitPrice
    ? (parseFloat(unitPrice) * item.quantity).toFixed(2)
    : null;

  return (
    <View style={[styles.container, style]} {...viewProps}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.meta}>
          {unitPrice ? `${currencySymbol}${unitPrice} × ${item.quantity}` : `× ${item.quantity}`}
        </Text>
      </View>
      <Text style={styles.total}>
        {lineTotal ? `${currencySymbol}${lineTotal}` : '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  meta: {
    fontSize: 12,
    color: '#6b7280',
  },
  total: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
});
