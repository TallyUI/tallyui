import { Text, View, type ViewProps } from 'react-native';

import { useProductTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
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
  className?: string;
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
  className,
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
    <View className={cn('gap-1.5 px-3 py-3', className)} {...viewProps}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted-foreground">Subtotal</Text>
        <Text className="text-sm text-foreground">{currencySymbol}{subtotal.toFixed(2)}</Text>
      </View>

      {taxRate > 0 && (
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">{taxLabel}</Text>
          <Text className="text-sm text-foreground">{currencySymbol}{tax.toFixed(2)}</Text>
        </View>
      )}

      <View className="mt-1.5 flex-row items-center justify-between border-t border-border pt-2">
        <Text className="text-base font-bold text-foreground">Total</Text>
        <Text className="text-base font-bold text-foreground">{currencySymbol}{total.toFixed(2)}</Text>
      </View>
    </View>
  );
}
