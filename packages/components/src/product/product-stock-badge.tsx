import { View } from 'react-native';

import { useProductTraits } from '@tallyui/core';
import type { StockStatus } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, HStack, type HStackProps } from '../ui';

export interface ProductStockBadgeProps extends Omit<HStackProps, 'children'> {
  /** The raw RxDB product document (connector-specific shape) */
  doc: any;
  /** Whether to show the quantity alongside the status */
  showQuantity?: boolean;
  className?: string;
}

const statusLabels: Record<StockStatus, string> = {
  in_stock: 'In Stock',
  out_of_stock: 'Out of Stock',
  backorder: 'On Backorder',
  unknown: 'Unknown',
};

const STATUS_STYLES: Record<StockStatus, { badge: string; dot: string; text: string }> = {
  in_stock: {
    badge: 'bg-success/15',
    dot: 'bg-success',
    text: 'text-success',
  },
  out_of_stock: {
    badge: 'bg-destructive/15',
    dot: 'bg-destructive',
    text: 'text-destructive',
  },
  backorder: {
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
  const { getStock } = useProductTraits();
  const { status, quantity } = getStock(doc);
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
        {status !== 'out_of_stock' && showQuantity && quantity != null ? ` (${quantity})` : ''}
      </Text>
    </HStack>
  );
}
