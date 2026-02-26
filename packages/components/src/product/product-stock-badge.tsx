import { View } from 'react-native';

import { useProductTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, HStack, type HStackProps } from '../ui';

export interface ProductStockBadgeProps extends Omit<HStackProps, 'children'> {
  /** The raw RxDB product document (connector-specific shape) */
  doc: any;
  /** Whether to show the quantity alongside the status */
  showQuantity?: boolean;
  className?: string;
}

const statusLabels: Record<string, string> = {
  instock: 'In Stock',
  outofstock: 'Out of Stock',
  onbackorder: 'On Backorder',
  unknown: 'Unknown',
};

const STATUS_STYLES: Record<string, { badge: string; dot: string; text: string }> = {
  instock: {
    badge: 'bg-success/15',
    dot: 'bg-success',
    text: 'text-success',
  },
  outofstock: {
    badge: 'bg-destructive/15',
    dot: 'bg-destructive',
    text: 'text-destructive',
  },
  onbackorder: {
    badge: 'bg-warning/15',
    dot: 'bg-warning',
    text: 'text-warning',
  },
  unknown: {
    badge: 'bg-muted/15',
    dot: 'bg-muted',
    text: 'text-muted-foreground',
  },
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
export function ProductStockBadge({ doc, showQuantity = false, className, ...props }: ProductStockBadgeProps) {
  const { getStockStatus, getStockQuantity } = useProductTraits();
  const status = getStockStatus(doc);
  const quantity = getStockQuantity(doc);
  const label = statusLabels[status] ?? statusLabels.unknown;
  const styles = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;

  return (
    <HStack
      space="none"
      className={cn('gap-1.5 self-start rounded-xl px-2 py-1', styles.badge, className)}
      {...props}
    >
      <View className={cn('h-1.5 w-1.5 rounded-full', styles.dot)} />
      <Text className={cn('text-xs font-semibold', styles.text)}>
        {label}
        {showQuantity && quantity != null ? ` (${quantity})` : ''}
      </Text>
    </HStack>
  );
}
