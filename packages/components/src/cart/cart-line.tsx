import { useProductTraits } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, HStack, VStack, type HStackProps } from '../ui';

export interface CartLineItem {
  /** The raw product document (connector-specific shape) */
  doc: any;
  /** Quantity in cart */
  quantity: number;
}

export interface CartLineProps extends Omit<HStackProps, 'children'> {
  /** The cart line item */
  item: CartLineItem;
  /** Currency symbol (defaults to '$') */
  currencySymbol?: string;
  className?: string;
}

/**
 * Displays a single cart line item: product name, quantity, and line total.
 *
 * ```tsx
 * <CartLine item={{ doc: productDocument, quantity: 2 }} />
 * ```
 */
export function CartLine({ item, currencySymbol = '$', className, ...props }: CartLineProps) {
  const { getName, getPrice } = useProductTraits();
  const name = getName(item.doc);
  const unitPrice = getPrice(item.doc);
  const lineTotal = unitPrice
    ? (parseFloat(unitPrice) * item.quantity).toFixed(2)
    : null;

  return (
    <HStack className={cn('px-3 py-2.5', className)} {...props}>
      <VStack space="none" className="flex-1 gap-0.5">
        <Text className="text-sm font-medium" numberOfLines={1}>{name}</Text>
        <Text className="text-xs text-muted-foreground">
          {unitPrice ? `${currencySymbol}${unitPrice} × ${item.quantity}` : `× ${item.quantity}`}
        </Text>
      </VStack>
      <Text className="text-sm font-semibold">
        {lineTotal ? `${currencySymbol}${lineTotal}` : '—'}
      </Text>
    </HStack>
  );
}
