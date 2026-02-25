import { Text, View, type ViewProps, StyleSheet } from 'react-native';

import { useProductTraits } from '@tallyui/core';

export interface ProductStockBadgeProps extends Omit<ViewProps, 'children'> {
  /** The raw RxDB product document (connector-specific shape) */
  doc: any;
  /** Whether to show the quantity alongside the status */
  showQuantity?: boolean;
}

const statusLabels: Record<string, string> = {
  instock: 'In Stock',
  outofstock: 'Out of Stock',
  onbackorder: 'On Backorder',
  unknown: 'Unknown',
};

const statusColors: Record<string, string> = {
  instock: '#059669',
  outofstock: '#dc2626',
  onbackorder: '#d97706',
  unknown: '#6b7280',
};

/**
 * Displays a visual stock status badge for a product.
 *
 * Shows a colored label (In Stock / Out of Stock / On Backorder)
 * with an optional quantity count.
 *
 * ```tsx
 * <ProductStockBadge doc={productDocument} showQuantity />
 * ```
 */
export function ProductStockBadge({ doc, showQuantity = false, style, ...viewProps }: ProductStockBadgeProps) {
  const { getStockStatus, getStockQuantity } = useProductTraits();
  const status = getStockStatus(doc);
  const quantity = getStockQuantity(doc);
  const color = statusColors[status] ?? statusColors.unknown;
  const label = statusLabels[status] ?? statusLabels.unknown;

  return (
    <View style={[styles.badge, { backgroundColor: color + '1a' }, style]} {...viewProps}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>
        {label}
        {showQuantity && quantity != null ? ` (${quantity})` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
