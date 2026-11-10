// Ported from WCPOS v2 packages/core/src/screens/main/pos/cart/table.tsx (AMOUNT_COLUMNS,
// PRICE_COLUMN_MIN_WIDTH, the header labels) and packages/components/src/lib/device.ts (the phone
// boundary), MIT, WCPOS.
import type { JSX } from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { Text } from '../ui';

/**
 * The cart's columns, head and cell. Item gives way: the amount columns hold a width and the name takes what is
 * left, so a total never wraps. The total cell has a floor, so a long total widens its own cell rather than wrapping.
 */
export const CART_COLUMNS = {
  quantity: { head: 'w-12 flex-none items-center pr-2 pl-3', cell: 'w-12 flex-none items-center pr-2 pl-3' },
  name: { head: 'min-w-0 flex-1 px-3', cell: 'min-w-0 flex-1 px-3' },
  price: { head: 'w-18 flex-none items-end px-2', cell: 'w-18 flex-none items-end px-2' },
  total: { head: 'w-20 flex-none items-end pr-3 pl-2', cell: 'min-w-20 flex-none items-end pr-3 pl-2' },
};

/** Under this cart width the Price column folds away, so the item name keeps room to read. */
const PRICE_COLUMN_MIN_WIDTH = 300;
/** A window narrower or shorter than this is a phone, which has no Price column either. */
const WIDE_MIN_WIDTH = 768;
const WIDE_MIN_HEIGHT = 480;

/** Whether the Price column shows. An unmeasured cart (`cartWidth` undefined) counts as wide. */
export function cartShowsPrice({ cartWidth, windowWidth, windowHeight }:
  { cartWidth?: number; windowWidth: number; windowHeight: number }): boolean {
  return (cartWidth ?? Infinity) >= PRICE_COLUMN_MIN_WIDTH && windowWidth >= WIDE_MIN_WIDTH && windowHeight >= WIDE_MIN_HEIGHT;
}

const HEADS = [['quantity', 'Qty'], ['name', 'Item'], ['price', 'Price'], ['total', 'Total']] as const;

export interface CartColumnHeadsProps extends Omit<ViewProps, 'children'> {
  /** Show the Price head (default true); pass the same value as each CartLine's `showPrice`. */
  showPrice?: boolean;
  className?: string;
}

/**
 * The cart's header row, Qty, Item, Price and Total, over lines laid out by CartLine in the same columns.
 *
 * ```tsx
 * <CartColumnHeads showPrice={showPrice} />
 * ```
 */
export function CartColumnHeads({ showPrice = true, className, ...props }: CartColumnHeadsProps): JSX.Element {
  return (
    <View role="row" className={cn('flex-row border-b border-border', className)} {...props}>
      {HEADS.filter(([id]) => showPrice || id !== 'price').map(([id, label]) => (
        <View key={id} role="columnheader" className={cn('h-9 justify-center', CART_COLUMNS[id].head)}>
          <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground" numberOfLines={1}>{label}</Text>
        </View>
      ))}
    </View>
  );
}
