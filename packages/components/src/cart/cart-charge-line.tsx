// Ported from WCPOS v2 packages/core/src/screens/main/pos/cart/table.tsx cells for fee_lines/shipping_lines,
// cells/fee-name.tsx, cells/fee-price.tsx, cells/shipping-price.tsx and cells/fee-and-shipping-total.tsx; MIT, WCPOS.
import type { JSX, ReactNode } from 'react';
import { View } from 'react-native';
import { useFormatMoney, type Money } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, HStack, type HStackProps } from '../ui';
import { CART_COLUMNS, cartColumnSlots, type CartColumnSettings } from './cart-columns';

export interface CartChargeLineProps extends Omit<HStackProps, 'children'> {
  name: string;
  /** The charge as entered (v2's Price cell). */
  price: Money;
  /** The charge in the display tax mode (v2's Total cell). */
  total: Money;
  /** As CartLine's showPrice. */
  showPrice?: boolean;
  /** As CartLine's columns. */
  columns?: CartColumnSettings;
  locale?: string;
  className?: string;
}

export function CartChargeLine({ name, price, total, showPrice = true, columns, locale, className, ...rest }: CartChargeLineProps): JSX.Element {
  const formatMoney = useFormatMoney();
  const cells: Record<ReturnType<typeof cartColumnSlots>[number], ReactNode> = {
    fill: <View key="fill" className="flex-1" />,
    quantity: <View key="quantity" className={CART_COLUMNS.quantity.cell} />,
    image: <View key="image" className={CART_COLUMNS.image.cell} />,
    name: <View key="name" className={CART_COLUMNS.name.cell}>
      <Text className="text-sm" numberOfLines={2}>{name}</Text>
    </View>,
    sku: <View key="sku" className={CART_COLUMNS.sku.cell} />,
    price: <View key="price" className={CART_COLUMNS.price.cell}>
      <Text testID="cart-charge-price" className="text-right text-sm tabular-nums text-muted-foreground">{formatMoney(price, locale) ?? '—'}</Text>
    </View>,
    total: <View key="total" className={CART_COLUMNS.total.cell}>
      <Text testID="cart-charge-total" className="text-right text-sm tabular-nums">{formatMoney(total, locale) ?? '—'}</Text>
    </View>,
  };
  return (
    <HStack space="none" className={cn('py-2.5', className)} {...rest}>
      {cartColumnSlots(columns, { showPrice }).map((id) => cells[id])}
    </HStack>
  );
}
