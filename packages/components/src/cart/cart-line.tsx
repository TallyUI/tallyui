import type { ReactNode } from 'react';
import { View } from 'react-native';
import { formatMoney, type Money } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, HStack, type HStackProps } from '../ui';
import { CART_COLUMNS } from './cart-columns';

export interface CartLineProps extends Omit<HStackProps, 'children'> {
  name: string;
  /** The variant's chosen options, shown as one "Name: Value · Name: Value" line under the name. */
  attributes?: Record<string, string>;
  quantity: number;
  unitPrice: Money;
  /** The regular unit price; shown struck through above unitPrice only when it is above unitPrice. */
  regularUnitPrice?: Money;
  lineTotal: Money;
  /** Show the Price column (default true); the Cart passes false on a narrow cart or a phone, as CartColumnHeads does. */
  showPrice?: boolean;
  /** Replaces the quantity's text, e.g. a LinePopover that edits it (Cart's `lineEditor="popover"`). */
  quantitySlot?: ReactNode;
  /** Replaces the unit price's text (the struck regular price stays above it). */
  priceSlot?: ReactNode;
  locale?: string;
  className?: string;
}

// Name and attributes: WCPOS v2 packages/core/src/screens/main/pos/cart/cells/product-name.tsx; price:
// cells/price.tsx; total: cells/product-total.tsx; MIT, WCPOS.
/**
 * A single cart line in the columns of CartColumnHeads: quantity, the name with its attributes, the unit price
 * (with the regular price struck through when it is higher) and the line total.
 *
 * ```tsx
 * <CartLine name="Coffee" quantity={2} unitPrice={unitPrice} lineTotal={lineTotal} />
 * ```
 */
export function CartLine({ name, attributes, quantity, unitPrice, regularUnitPrice, lineTotal, showPrice = true, quantitySlot, priceSlot, locale, className, ...props }: CartLineProps) {
  const options = Object.entries(attributes ?? {}).map(([key, value]) => `${key}: ${value}`).join(' · ');
  const regular = regularUnitPrice && regularUnitPrice.currency === unitPrice.currency && regularUnitPrice.amount > unitPrice.amount
    ? formatMoney(regularUnitPrice, locale) ?? '—' : null;
  return (
    <HStack space="none" className={cn('py-2.5', className)} {...props}>
      <View className={CART_COLUMNS.quantity.cell}>
        {quantitySlot ?? <Text className="text-sm tabular-nums">{quantity}</Text>}
      </View>
      <View className={CART_COLUMNS.name.cell}>
        <Text className="text-sm font-medium" numberOfLines={2}>{name}</Text>
        {options ? <Text className="text-xs text-muted-foreground" numberOfLines={2}>{options}</Text> : null}
      </View>
      {showPrice ? <View className={CART_COLUMNS.price.cell}>
        {regular ? <Text accessibilityLabel={`Regular price ${regular}`} style={{ textDecorationLine: 'line-through' }}
          className="text-right text-sm tabular-nums text-muted-foreground line-through">{regular}</Text> : null}
        {priceSlot ?? <Text className="text-right text-sm tabular-nums text-muted-foreground">{formatMoney(unitPrice, locale) ?? '—'}</Text>}
      </View> : null}
      <View className={CART_COLUMNS.total.cell}>
        <Text className="text-right text-sm font-semibold tabular-nums">{formatMoney(lineTotal, locale) ?? '—'}</Text>
      </View>
    </HStack>
  );
}
