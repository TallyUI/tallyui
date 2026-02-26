import { useProductTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, HStack, VStack, type VStackProps } from '../ui';
import type { CartLineItem } from './cart-line';

export interface CartTotalProps extends Omit<VStackProps, 'children'> {
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
  ...props
}: CartTotalProps) {
  const { getPrice } = useProductTraits();

  const subtotal = items.reduce((sum, item) => {
    const price = getPrice(item.doc);
    return sum + (price ? parseFloat(price) * item.quantity : 0);
  }, 0);

  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return (
    <VStack space="none" className={cn('gap-1.5 px-3 py-3', className)} {...props}>
      <HStack space="none" className="justify-between">
        <Text className="text-sm text-muted-foreground">Subtotal</Text>
        <Text className="text-sm">{currencySymbol}{subtotal.toFixed(2)}</Text>
      </HStack>

      {taxRate > 0 && (
        <HStack space="none" className="justify-between">
          <Text className="text-sm text-muted-foreground">{taxLabel}</Text>
          <Text className="text-sm">{currencySymbol}{tax.toFixed(2)}</Text>
        </HStack>
      )}

      <HStack space="none" className="mt-1.5 justify-between border-t border-border pt-2">
        <Text className="font-bold">Total</Text>
        <Text className="font-bold">{currencySymbol}{total.toFixed(2)}</Text>
      </HStack>
    </VStack>
  );
}
