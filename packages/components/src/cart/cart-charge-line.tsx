// Ported from WCPOS v2 packages/core/src/screens/main/pos/cart/table.tsx cells for fee_lines/shipping_lines,
// cells/fee-name.tsx, cells/fee-price.tsx, cells/shipping-price.tsx and cells/fee-and-shipping-total.tsx; MIT, WCPOS.
import type { JSX, ReactNode } from 'react';
import { View } from 'react-native';
import { useFormatMoney, type Money } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { Text, HStack, type HStackProps } from '../ui';
import { CART_COLUMNS, CART_PICKING_QUANTITY, cartColumnSlots, type CartColumnSettings } from './cart-columns';

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
  /** A percent fee: the Price cell shows the percent, as v2's fee-price.tsx. */
  percent?: number;
  /** As CartColumnHeads' `picking`: the quantity column takes its wider picking width (default false). */
  picking?: boolean;
  className?: string;
  /** The line strip's press target (`CartLineStrip`): wraps the Total cell's content, or the last visible cell's when
   * Total is hidden, as v2's table does. */
  wrapTotal?: (content: ReactNode) => ReactNode;
}

export function CartChargeLine({ name, price, total, showPrice = true, columns, locale, percent, picking = false, className, wrapTotal, ...rest }: CartChargeLineProps): JSX.Element {
  const formatMoney = useFormatMoney();
  const slots = cartColumnSlots(columns, { showPrice });
  const target = slots.includes('total') ? 'total' : slots[slots.length - 1];
  const wrap = (id: (typeof slots)[number], content: ReactNode) => wrapTotal && id === target ? wrapTotal(content) : content;
  const cells: Record<(typeof slots)[number], ReactNode> = {
    fill: <View key="fill" className="flex-1">{wrap('fill', null)}</View>,
    quantity: <View key="quantity" className={(picking ? CART_PICKING_QUANTITY : CART_COLUMNS.quantity).cell}>{wrap('quantity', null)}</View>,
    image: <View key="image" className={CART_COLUMNS.image.cell}>{wrap('image', null)}</View>,
    name: <View key="name" className={CART_COLUMNS.name.cell}>
      {wrap('name', <Text className="text-sm" numberOfLines={2}>{name}</Text>)}
    </View>,
    sku: <View key="sku" className={CART_COLUMNS.sku.cell}>{wrap('sku', null)}</View>,
    regularPrice: <View key="regularPrice" className={CART_COLUMNS.regularPrice.cell}>{wrap('regularPrice', null)}</View>,
    price: <View key="price" className={CART_COLUMNS.price.cell}>
      {wrap('price', <Text testID="cart-charge-price" className="text-right text-sm tabular-nums text-muted-foreground">
        {percent !== undefined ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(percent)}%` : formatMoney(price, locale) ?? '—'}</Text>)}
    </View>,
    total: <View key="total" className={CART_COLUMNS.total.cell}>
      {wrap('total', <Text testID="cart-charge-total" className="text-right text-sm tabular-nums">{formatMoney(total, locale) ?? '—'}</Text>)}
    </View>,
  };
  return (
    <HStack space="none" className={cn('py-2.5', className)} {...rest}>
      {slots.map((id) => cells[id])}
    </HStack>
  );
}
