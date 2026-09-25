import { formatMoney, type Money } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, HStack, VStack, type VStackProps } from '../ui';

export interface CartTotalProps extends Omit<VStackProps, 'children'> {
  subtotal: Money;
  taxLines?: Array<{ label: string; amount: Money }>;
  discount?: Money;
  total: Money;
  /** The tax is already in the subtotal (an inclusive display), so its rows read "incl." rather than add up. */
  taxInclusive?: boolean;
  locale?: string;
  className?: string;
}

/**
 * Displays a cart summary: subtotal, optional discount, optional tax, and total, in the receipt's order.
 *
 * ```tsx
 * <CartTotal subtotal={subtotal} discount={discount} taxLines={taxLines} total={total} />
 * ```
 */
export function CartTotal({
  subtotal,
  taxLines,
  discount,
  total,
  taxInclusive,
  locale,
  className,
  ...props
}: CartTotalProps) {
  return (
    <VStack space="none" className={cn('gap-1.5 px-3 py-3', className)} {...props}>
      <HStack space="none" className="justify-between">
        <Text className="text-sm text-muted-foreground">Subtotal</Text>
        <Text className="text-sm">{formatMoney(subtotal, locale) ?? '—'}</Text>
      </HStack>

      {discount && discount.amount > 0 && (
        <HStack space="none" className="justify-between">
          <Text className="text-sm text-muted-foreground">Discount</Text>
          <Text className="text-sm">−{formatMoney(discount, locale) ?? '—'}</Text>
        </HStack>
      )}

      {taxLines?.map((line, index) => (
        <HStack key={index} space="none" className="justify-between">
          <Text className="text-sm text-muted-foreground">{taxInclusive ? `incl. ${line.label}` : line.label}</Text>
          <Text className="text-sm">{formatMoney(line.amount, locale) ?? '—'}</Text>
        </HStack>
      ))}

      <HStack space="none" className="mt-1.5 justify-between border-t border-border pt-2">
        <Text className="font-bold">Total</Text>
        <Text className="font-bold">{formatMoney(total, locale) ?? '—'}</Text>
      </HStack>
    </VStack>
  );
}
