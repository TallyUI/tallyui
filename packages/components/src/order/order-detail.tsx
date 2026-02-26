import type { ReactNode } from 'react';
import { ScrollView, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

import { OrderStatusBadge, type OrderStatus } from './order-status-badge';

export interface OrderDetailLineItem {
  name: string;
  quantity: number;
  total: string;
}

export interface OrderDetailProps extends Omit<ViewProps, 'children'> {
  orderNumber: string;
  status: OrderStatus;
  lineItems: OrderDetailLineItem[];
  subtotal: string;
  tax: string;
  total: string;
  customerSlot?: ReactNode;
  paymentSlot?: ReactNode;
  footerSlot?: ReactNode;
  className?: string;
}

export function OrderDetail({
  orderNumber,
  status,
  lineItems,
  subtotal,
  tax,
  total,
  customerSlot,
  paymentSlot,
  footerSlot,
  className,
  ...viewProps
}: OrderDetailProps) {
  return (
    <ScrollView className={cn('flex-1', className)} {...viewProps}>
      <View className="gap-4 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-foreground">{orderNumber}</Text>
          <OrderStatusBadge status={status} />
        </View>

        {customerSlot && <View className="border-b border-border pb-3">{customerSlot}</View>}

        <View className="gap-1">
          <Text className="text-xs font-semibold text-muted">Items</Text>
          {lineItems.map((item, i) => (
            <View key={i} className="flex-row items-center justify-between py-1">
              <Text className="flex-1 text-sm text-foreground">
                {item.name} x{item.quantity}
              </Text>
              <Text className="text-sm text-foreground">{item.total}</Text>
            </View>
          ))}
        </View>

        <View className="gap-1 border-t border-border pt-3">
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">Subtotal</Text>
            <Text className="text-sm text-foreground">{subtotal}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">Tax</Text>
            <Text className="text-sm text-foreground">{tax}</Text>
          </View>
          <View className="flex-row justify-between pt-1">
            <Text className="text-sm font-bold text-foreground">Total</Text>
            <Text className="text-sm font-bold text-foreground">{total}</Text>
          </View>
        </View>

        {paymentSlot && <View className="border-t border-border pt-3">{paymentSlot}</View>}
        {footerSlot && <View className="border-t border-border pt-3">{footerSlot}</View>}
      </View>
    </ScrollView>
  );
}
