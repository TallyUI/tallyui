import type { JSX, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '@tallyui/theme';
import { VStack, type VStackProps } from '../ui';

export interface CartPanelProps<T> extends Omit<VStackProps, 'children'> {
  /** Cart line items to render */
  items: T[];
  /** Render function for each cart line */
  renderItem: (item: T, index: number) => ReactNode;
  /** Header slot (e.g. customer info) */
  header?: ReactNode;
  /** Content after the lines, inside the scrolling region (e.g. discount chips); shown even with no lines, so it isn't hidden by an empty cart */
  afterItems?: ReactNode;
  /** Footer slot (e.g. totals, checkout button) */
  footer?: ReactNode;
  /** Content shown when items is empty */
  emptyState?: ReactNode;
  className?: string;
}

/**
 * A scrollable cart panel with header/footer slots.
 *
 * Composes CartLine (or custom renderItem) into a scrollable list with an
 * optional header. The footer stays pinned at the bottom at every height;
 * afterItems renders inside the scrolling region, after the lines.
 *
 * ```tsx
 * <CartPanel
 *   items={cartItems}
 *   renderItem={(item) => <CartLine {...item} />}
 *   header={<CustomerCard doc={customer} />}
 *   afterItems={<DiscountChips discounts={discounts} />}
 *   footer={<CartTotal subtotal={subtotal} total={total} />}
 * />
 * ```
 */
export function CartPanel<T>({
  items,
  renderItem,
  header,
  afterItems,
  footer,
  emptyState,
  className,
  ...props
}: CartPanelProps<T>): JSX.Element {
  const hasItems = items.length > 0;

  return (
    <VStack space="none" className={cn('flex-1 min-h-0', className)} {...props}>
      {header && <View className="border-b border-border px-3 py-2">{header}</View>}

      <ScrollView className="flex-1 min-h-0" contentContainerClassName="flex-grow">
        {hasItems
          ? items.map((item, index) => <View key={index}>{renderItem(item, index)}</View>)
          : (emptyState ?? null)}
        {afterItems}
      </ScrollView>

      {footer && <View className="border-t border-border px-3 py-2">{footer}</View>}
    </VStack>
  );
}
