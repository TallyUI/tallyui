// Port of WCPOS v2 `packages/core/src/screens/main/pos/cart/foot.tsx` and `cart/buttons/pay.tsx`
// (the ⋮ beside a full-width "Checkout {order_total}"), MIT, WCPOS.
import * as React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { formatMoney, type Money } from '@tallyui/core';
import { cn } from '@tallyui/theme';

export interface CartFootAction {
  label: string;
  onPress: () => void;
  /** Shown in the destructive colour, e.g. a Void. */
  destructive?: boolean;
}

export interface CartFootProps {
  total: Money;
  onCheckout: () => void;
  /** The ⋮ menu's items; the ⋮ is left out when there are none. */
  actions?: readonly CartFootAction[];
  /** Disables Checkout only; the menu stays usable. */
  disabled?: boolean;
  locale?: string;
  className?: string;
}

const MENU_LABEL = 'More actions';

/**
 * The cart's foot: a ⋮ menu of the host's actions beside one "Checkout {total}" button, as in WCPOS v2.
 * v2's ⋮ opens its Order details sheet; here the host passes the items, so it can pass one that opens its own sheet.
 *
 * ```tsx
 * <CartFoot total={total} onCheckout={startCheckout} actions={[{ label: 'Void', onPress: voidSale, destructive: true }]} />
 * ```
 */
export function CartFoot({ total, onCheckout, actions = [], disabled = false, locale, className }: CartFootProps) {
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<View>(null);
  const menu = React.useRef<View>(null);

  // Web keyboard: focus moves to the first item on open; Escape closes and hands focus back to the ⋮.
  React.useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    (menu.current as unknown as HTMLElement | null)?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      (trigger.current as unknown as HTMLElement | null)?.focus?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <View className={cn('gap-2', className)}>
      {open && actions.length > 0 ? (
        <View ref={menu} role="menu" aria-label={MENU_LABEL} testID="cart-foot-menu"
          className="rounded-md border border-border bg-card p-1">
          {actions.map((action, index) => (
            <Pressable key={index} role="menuitem" className="min-h-11 justify-center rounded-sm px-3 py-2"
              onPress={() => { setOpen(false); action.onPress(); }}>
              <Text className={action.destructive ? 'text-destructive' : 'text-foreground'}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-3">
        {actions.length > 0 ? (
          <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={MENU_LABEL} aria-haspopup="menu"
            aria-expanded={open} testID="cart-foot-more" onPress={() => setOpen((value) => !value)}
            className="min-h-12 min-w-12 items-center justify-center rounded-md border border-border bg-card">
            <Text className="text-lg text-foreground">⋮</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" testID="cart-checkout" disabled={disabled} onPress={onCheckout}
          className={cn('min-h-12 flex-1 justify-center rounded-md bg-primary px-4 py-3', disabled && 'opacity-50')}>
          <Text className="text-center font-semibold text-primary-foreground">{`Checkout ${formatMoney(total, locale) ?? '—'}`}</Text>
        </Pressable>
      </View>
    </View>
  );
}
