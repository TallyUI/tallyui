import { Text, View } from 'react-native';
import { cn } from '@tallyui/theme';

export interface InCartBadgeProps {
  /** How many of the product the cart holds (e.g. from `cartQuantities`); nothing renders at 0. */
  count: number;
  /** Placement, e.g. `absolute right-2 top-2` for a tile's top-right corner. */
  className?: string;
  testID?: string;
}

/**
 * How many of a product are in the cart: a primary circle with the count, hidden while there are none.
 *
 * Ported from WCPOS v2 `InCartCount`, packages/core/src/screens/main/pos/products/rows/in-cart-count.tsx
 * (MIT, WCPOS), without its count beat.
 */
export function InCartBadge({ count, className, testID }: InCartBadgeProps) {
  if (count <= 0) return null;
  return (
    <View testID={testID} accessibilityLabel={`${count} in cart`}
      className={cn('h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5', className)}>
      <Text className="text-xs font-semibold tabular-nums text-primary-foreground">{String(count)}</Text>
    </View>
  );
}
