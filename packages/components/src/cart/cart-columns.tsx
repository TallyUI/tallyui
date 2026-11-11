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
  image: { head: 'w-14 flex-none items-center justify-center pl-3', cell: 'w-14 flex-none items-center justify-center pl-3' },
  name: { head: 'min-w-0 flex-1 px-3', cell: 'min-w-0 flex-1 px-3' },
  sku: { head: 'w-24 flex-none px-2', cell: 'w-24 flex-none px-2' },
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

/**
 * v2's Cart Settings › Columns: each column's `show` switch and display options. Every field is optional; the
 * defaults are today's look and v2's: Qty, Item, Price and Total show; Image, SKU, `quantity.split` and `name.sku` are off.
 */
export interface CartColumnSettings {
  /** `split`: a Split link under a quantity above 1. */
  quantity?: { show?: boolean; split?: boolean };
  /** The line's image, in its own column with no head label. */
  image?: { show?: boolean };
  /** `sku`: the SKU on a line under the name. */
  name?: { show?: boolean; sku?: boolean };
  sku?: { show?: boolean };
  /** Still folds on a narrow cart or a phone (`showPrice`). */
  price?: { show?: boolean };
  total?: { show?: boolean };
}

export type CartColumnId = 'quantity' | 'image' | 'name' | 'sku' | 'price' | 'total';
const DEFAULT_SHOWN: Record<CartColumnId, boolean> = { quantity: true, image: false, name: true, sku: false, price: true, total: true };

/** The visible columns, in their fixed order; the heads and every line use it, so they cannot disagree. */
export function cartColumnIds(columns: CartColumnSettings = {}, { showPrice = true }: { showPrice?: boolean } = {}): CartColumnId[] {
  return (Object.keys(DEFAULT_SHOWN) as CartColumnId[])
    .filter((id) => (columns[id]?.show ?? DEFAULT_SHOWN[id]) && (id !== 'price' || showPrice));
}

/** cartColumnIds with a `fill` in Item's place when it is hidden, so the amount columns stay right-aligned. */
export function cartColumnSlots(...args: Parameters<typeof cartColumnIds>): (CartColumnId | 'fill')[] {
  const ids = cartColumnIds(...args);
  if (ids.includes('name')) return ids;
  const at = ids.filter((id) => id === 'quantity' || id === 'image').length;
  return [...ids.slice(0, at), 'fill', ...ids.slice(at)];
}

const HEADS: Record<CartColumnId, string> = { quantity: 'Qty', image: '', name: 'Item', sku: 'SKU', price: 'Price', total: 'Total' };

export interface CartColumnHeadsProps extends Omit<ViewProps, 'children'> {
  /** Show the Price head (default true); pass the same value as each CartLine's `showPrice`. */
  showPrice?: boolean;
  /** Which columns show (v2's Cart Settings › Columns); pass the same value as each CartLine's `columns`. */
  columns?: CartColumnSettings;
  className?: string;
}

/**
 * The cart's header row, Qty, Item, Price and Total, over lines laid out by CartLine in the same columns.
 *
 * ```tsx
 * <CartColumnHeads showPrice={showPrice} />
 * ```
 */
export function CartColumnHeads({ showPrice = true, columns, className, ...props }: CartColumnHeadsProps): JSX.Element {
  return (
    <View role="row" className={cn('flex-row border-b border-border', className)} {...props}>
      {cartColumnSlots(columns, { showPrice }).map((id) => id === 'fill' ? <View key={id} className="flex-1" /> : (
        <View key={id} role="columnheader" className={cn('h-9 justify-center', CART_COLUMNS[id].head)}>
          {HEADS[id] ? <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground" numberOfLines={1}>{HEADS[id]}</Text> : null}
        </View>
      ))}
    </View>
  );
}
