import { formatMoney, type Money } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, HStack, VStack, type HStackProps } from '../ui';

export interface CartLineProps extends Omit<HStackProps, 'children'> {
  name: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  locale?: string;
  className?: string;
}

/**
 * Displays a single cart line item: product name, quantity, and line total.
 *
 * ```tsx
 * <CartLine name="Coffee" quantity={2} unitPrice={unitPrice} lineTotal={lineTotal} />
 * ```
 */
export function CartLine({ name, quantity, unitPrice, lineTotal, locale, className, ...props }: CartLineProps) {
  return (
    <HStack className={cn('px-3 py-2.5', className)} {...props}>
      <VStack space="none" className="flex-1 gap-0.5">
        <Text className="text-sm font-medium" numberOfLines={1}>{name}</Text>
        <Text className="text-xs text-muted-foreground">
          {`${formatMoney(unitPrice, locale) ?? '—'} × ${quantity}`}
        </Text>
      </VStack>
      <Text className="text-sm font-semibold">
        {formatMoney(lineTotal, locale) ?? '—'}
      </Text>
    </HStack>
  );
}
