// Ported from WCPOS v2 packages/core/src/screens/main/pos/cart/table.tsx (AMOUNT_COLUMNS,
// PRICE_COLUMN_MIN_WIDTH, the header labels) and packages/components/src/lib/device.ts (the phone
// boundary), MIT, WCPOS.
import type { JSX } from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { useT } from '../i18n';
import { Text } from '../ui';

/**
 * The cart's columns, head and cell. Item gives way: the amount columns hold a width and the name takes what is
 * left, so a total never wraps. The total cell has a floor, so a long total widens its own cell rather than wrapping.
 */
export const CART_COLUMNS = {
  quantity: { head: 'w-12 flex-none items-center pr-1 pl-2', cell: 'w-12 flex-none items-center pr-2 pl-3' },
  image: { head: 'w-14 flex-none items-center justify-center pl-3', cell: 'w-14 flex-none items-center justify-center pl-3' },
  name: { head: 'min-w-0 flex-1 px-3', cell: 'min-w-0 flex-1 px-3' },
  sku: { head: 'w-24 flex-none px-2', cell: 'w-24 flex-none px-2' },
  price: { head: 'w-18 flex-none items-end px-2', cell: 'w-18 flex-none items-end px-2' },
  regularPrice: { head: 'w-18 flex-none items-end px-2', cell: 'w-18 flex-none items-end px-2' },
  total: { head: 'w-20 flex-none items-end pr-3 pl-2', cell: 'min-w-20 flex-none items-end pr-3 pl-2' },
};
/** The quantity column while Cart's `picker` is on: w-48 (192px) fits v2's `− 99 of 99 +` stepper (two 44px buttons, two gaps and the count, about 175px) and its "This payment" head. */
export const CART_PICKING_QUANTITY = { head: 'w-48 flex-none items-center px-2', cell: 'w-48 flex-none items-center px-2' };

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
 * v2's Cart Settings › Columns: each column's `show` switch, display options and order. Every field is optional; the
 * defaults are today's look and v2's: Qty, Item, Price and Total show, in v2's order (Qty, Image, Item, SKU, Price,
 * Regular Price, Total), with `price.onSale` on; Image, SKU, Regular Price, `quantity.split` and `name.sku` are off.
 */
export interface CartColumnSettings {
  /** `split`: a Split link under a quantity above 1. */
  quantity?: { show?: boolean; split?: boolean };
  /** The line's image, in its own column with no head label. */
  image?: { show?: boolean };
  /** `sku`: the SKU on a line under the name. */
  name?: { show?: boolean; sku?: boolean };
  sku?: { show?: boolean };
  /** Still folds on a narrow cart or a phone (`showPrice`). `onSale` (default true): the regular price struck through
   * above a lower price (v2's `on_sale`). */
  price?: { show?: boolean; onSale?: boolean };
  /** The regular unit price, read-only (v2's Regular Price column); off by default. */
  regularPrice?: { show?: boolean };
  total?: { show?: boolean };
  /** The column order (v2's drag order). Listed ids come first, in this order; ids not listed follow in the default
   * order; unknown and repeated ids are ignored. */
  order?: readonly CartColumnId[];
}

export type CartColumnId = 'quantity' | 'image' | 'name' | 'sku' | 'price' | 'regularPrice' | 'total';
export const CART_COLUMN_DEFAULT_SHOWN: Record<CartColumnId, boolean> = {
  quantity: true, image: false, name: true, sku: false, price: true, regularPrice: false, total: true,
};

/** Every column in `columns.order`, then the default order. */
export function cartColumnOrder(columns: CartColumnSettings = {}): CartColumnId[] {
  const all = Object.keys(CART_COLUMN_DEFAULT_SHOWN) as CartColumnId[];
  return [...new Set([...(columns.order ?? []).filter((id) => all.includes(id)), ...all])];
}

const shown = (columns: CartColumnSettings, showPrice: boolean) => (id: CartColumnId) =>
  (columns[id]?.show ?? CART_COLUMN_DEFAULT_SHOWN[id]) && (id !== 'price' || showPrice);

/** The visible columns, in order; the heads and every line use it, so they cannot disagree. */
export function cartColumnIds(columns: CartColumnSettings = {}, { showPrice = true }: { showPrice?: boolean } = {}): CartColumnId[] {
  return cartColumnOrder(columns).filter(shown(columns, showPrice));
}

/** cartColumnIds with a `fill` in Item's place when it is hidden, so the amount columns stay right-aligned. */
export function cartColumnSlots(columns: CartColumnSettings = {}, { showPrice = true }: { showPrice?: boolean } = {}): (CartColumnId | 'fill')[] {
  const ordered = cartColumnOrder(columns);
  const ids = ordered.filter(shown(columns, showPrice));
  if (ids.includes('name')) return ids;
  const after = ordered.slice(ordered.indexOf('name') + 1);
  const at = ids.findIndex((id) => after.includes(id));
  return at < 0 ? [...ids, 'fill'] : [...ids.slice(0, at), 'fill', ...ids.slice(at)];
}

/** Each head's catalogue key, v2's `pos_cart.col_*` and `common.*`; Image has no label. */
const HEADS: Partial<Record<CartColumnId, string>> = {
  quantity: 'pos_cart.col_qty', name: 'pos_cart.col_item', sku: 'common.sku', price: 'pos_cart.col_price',
  regularPrice: 'common.regular_price', total: 'pos_cart.col_total',
};

export interface CartColumnHeadsProps extends Omit<ViewProps, 'children'> {
  /** Show the Price head (default true); pass the same value as each CartLine's `showPrice`. */
  showPrice?: boolean;
  /** Which columns show (v2's Cart Settings › Columns); pass the same value as each CartLine's `columns`. */
  columns?: CartColumnSettings;
  /** Cart's `picker` is on: the quantity column heads v2's split-by-item bill, "This payment" (default false). */
  picking?: boolean;
  className?: string;
}

/**
 * The cart's header row, Qty, Item, Price and Total, over lines laid out by CartLine in the same columns.
 *
 * ```tsx
 * <CartColumnHeads showPrice={showPrice} />
 * ```
 */
export function CartColumnHeads({ showPrice = true, columns, picking = false, className, ...props }: CartColumnHeadsProps): JSX.Element {
  const t = useT();
  const label = (id: CartColumnId) => picking && id === 'quantity' ? t('pos_checkout.this_payment') : HEADS[id] && t(HEADS[id]);
  return (
    <View role="row" className={cn('flex-row border-b border-border', className)} {...props}>
      {cartColumnSlots(columns, { showPrice }).map((id) => id === 'fill' ? <View key={id} className="flex-1" /> : (
        <View key={id} role="columnheader" className={cn('h-9 justify-center', (picking && id === 'quantity' ? CART_PICKING_QUANTITY : CART_COLUMNS[id]).head)}>
          {label(id) ? <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground" numberOfLines={1}>{label(id)}</Text> : null}
        </View>
      ))}
    </View>
  );
}
