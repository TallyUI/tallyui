import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '@tallyui/theme';
import { VStack, type VStackProps } from '../ui';
import type { CartLineItem } from './cart-line';

export interface CartPanelProps extends Omit<VStackProps, 'children'> {
  /** Cart line items to render */
  items: CartLineItem[];
  /** Render function for each cart line */
  renderItem: (item: CartLineItem, index: number) => ReactNode;
  /** Header slot (e.g. customer info) */
  header?: ReactNode;
  /** Footer slot (e.g. totals, checkout button) */
  footer?: ReactNode;
  /** Content shown when items is empty */
  emptyState?: ReactNode;
  className?: string;
}

/**
 * A scrollable cart panel with header/footer slots.
 *
 * Composes CartLine (or custom renderItem) into a scrollable list
 * with optional header, footer, and empty state.
 *
 * ```tsx
 * <CartPanel
 *   items={cartItems}
 *   renderItem={(item) => <CartLine item={item} />}
 *   header={<CustomerCard doc={customer} />}
 *   footer={<CartTotal items={cartItems} />}
 * />
 * ```
 */
export function CartPanel({
  items,
  renderItem,
  header,
  footer,
  emptyState,
  className,
  ...props
}: CartPanelProps) {
  const hasItems = items.length > 0;

  return (
    <VStack space="none" className={cn('flex-1', className)} {...props}>
      {header && <View className="border-b border-border px-3 py-2">{header}</View>}

      {hasItems ? (
        <ScrollView className="flex-1">
          {items.map((item, index) => (
            <View key={item.doc?.id ?? index}>
              {renderItem(item, index)}
            </View>
          ))}
        </ScrollView>
      ) : (
        emptyState ?? null
      )}

      {footer && <View className="border-t border-border px-3 py-2">{footer}</View>}
    </VStack>
  );
}
