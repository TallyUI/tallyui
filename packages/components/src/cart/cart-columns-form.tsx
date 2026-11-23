// Ported from WCPOS v2 packages/core/src/screens/main/components/ui-settings/columns-form.tsx (the Columns section,
// its Show and display switches) and use-ui-label.ts (the labels), MIT, WCPOS. v2's drag handle is replaced by Move up
// and Move down buttons (desk, 19 Nov).
import type { JSX } from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { useT } from '../i18n';
import { Button } from '../ui/button';
import { ChevronDownIcon } from '../ui/icon/chevron-down-icon';
import { IconButton } from '../ui/icon-button';
import { Switch } from '../ui/switch';
import { Text } from '../ui/text';
import { CART_COLUMN_DEFAULT_SHOWN, cartColumnOrder, type CartColumnId, type CartColumnSettings } from './cart-columns';

/** Each column's catalogue key, v2's `use-ui-label.ts`. */
const LABELS: Record<CartColumnId, string> = {
  quantity: 'pos_cart.qty_abbrev', image: 'common.image', name: 'common.name', sku: 'common.sku',
  price: 'common.price', regularPrice: 'common.regular_price', total: 'common.total',
};

/** The display switch nested under a column, drawn only while the column shows; `on` is its default. */
const DISPLAY: Partial<Record<CartColumnId, { field: 'split' | 'sku' | 'onSale'; label: string; on: boolean }>> = {
  quantity: { field: 'split', label: 'pos_cart.split_qty', on: false },
  name: { field: 'sku', label: 'common.sku', on: false },
  price: { field: 'onSale', label: 'common.on_sale', on: true },
};

export interface CartColumnsFormProps extends Omit<ViewProps, 'children'> {
  /** The saved columns (default `{}`, today's look). */
  value?: CartColumnSettings;
  /** Called with a fresh value on every change; the form stores nothing. */
  onChange: (next: CartColumnSettings) => void;
  /** Draw a Restore Default Settings button that emits `{}` (default false; v2 keeps it in the dialog footer). */
  showReset?: boolean;
  className?: string;
}

/**
 * v2's Cart Settings › Columns: a Show switch per column, the nested Split, SKU and On Sale switches, and Move up and
 * Move down buttons for the order. It emits a value for `Cart`'s `columns`.
 *
 * ```tsx
 * <CartColumnsForm value={settings['cart.columns']} onChange={(next) => setSetting('cart.columns', next)} />
 * ```
 */
export function CartColumnsForm({ value = {}, onChange, showReset = false, className, ...viewProps }: CartColumnsFormProps): JSX.Element {
  const t = useT();
  const order = cartColumnOrder(value);
  const patch = (id: CartColumnId, fields: Record<string, boolean>) =>
    onChange({ ...value, [id]: { ...value[id], ...fields } });
  const move = (at: number, by: -1 | 1) => {
    const next = [...order];
    [next[at], next[at + by]] = [next[at + by], next[at]];
    onChange({ ...value, order: next });
  };
  return (
    <View className={cn('gap-1', className)} {...viewProps}>
      <Text role="heading" aria-level={4} className="pb-1 text-base font-semibold">{t('common.columns')}</Text>
      {order.map((id, at) => {
        const label = t(LABELS[id]);
        const show = value[id]?.show ?? CART_COLUMN_DEFAULT_SHOWN[id];
        const display = DISPLAY[id];
        const fields = value[id] as Record<string, boolean | undefined> | undefined;
        const first = at === 0;
        const last = at === order.length - 1;
        return (
          <View key={id} testID={`cart-columns-${id}`} className="py-1">
            <View className="flex-row items-center gap-3">
              <Switch testID={`cart-columns-${id}-show`} accessibilityLabel={label} checked={show}
                onCheckedChange={(on) => patch(id, { show: on })} />
              <Text className="flex-1">{label}</Text>
              <IconButton size="sm" testID={`cart-columns-${id}-up`} accessibilityLabel={t('common.move_up_value', { label })}
                disabled={first} aria-disabled={first} onPress={() => move(at, -1)}>
                <View style={{ transform: [{ rotate: '180deg' }] }}><ChevronDownIcon size={18} strokeWidth={1.5} /></View>
              </IconButton>
              <IconButton size="sm" testID={`cart-columns-${id}-down`} accessibilityLabel={t('common.move_down_value', { label })}
                disabled={last} aria-disabled={last} onPress={() => move(at, 1)}>
                <ChevronDownIcon size={18} strokeWidth={1.5} />
              </IconButton>
            </View>
            {display && show ? (
              <View className="flex-row items-center gap-3 pt-2 pl-10">
                <Switch size="sm" testID={`cart-columns-${id}-${display.field}`} accessibilityLabel={t(display.label)}
                  checked={fields?.[display.field] ?? display.on} onCheckedChange={(on) => patch(id, { [display.field]: on })} />
                <Text className="flex-1 text-sm">{t(display.label)}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
      {showReset ? (
        <Button variant="outline" testID="cart-columns-reset" className="mt-2 self-start" onPress={() => onChange({})}>
          <Text>{t('common.restore_default_settings')}</Text>
        </Button>
      ) : null}
    </View>
  );
}
