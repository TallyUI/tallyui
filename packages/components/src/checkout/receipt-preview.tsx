import type { ReactNode } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface ReceiptItem {
  name: string;
  quantity: number;
  total: string;
}

export interface ReceiptPreviewProps extends Omit<ViewProps, 'children'> {
  items: ReceiptItem[];
  subtotal: string;
  tax: string;
  total: string;
  payments?: Array<{ method: string; amount: string }>;
  headerSlot?: ReactNode;
  footerSlot?: ReactNode;
  className?: string;
}

export function ReceiptPreview({
  items,
  subtotal,
  tax,
  total,
  payments,
  headerSlot,
  footerSlot,
  className,
  ...viewProps
}: ReceiptPreviewProps) {
  return (
    <View className={cn('rounded-lg border border-border bg-surface p-4', className)} {...viewProps}>
      {headerSlot && <View className="mb-3 items-center border-b border-dashed border-border pb-3">{headerSlot}</View>}

      <View className="gap-1">
        {items.map((item, i) => (
          <View key={i} className="flex-row justify-between">
            <Text className="flex-1 text-sm text-foreground">
              {item.name} x{item.quantity}
            </Text>
            <Text className="text-sm text-foreground">{item.total}</Text>
          </View>
        ))}
      </View>

      <View className="mt-3 gap-1 border-t border-dashed border-border pt-3">
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted">Subtotal</Text>
          <Text className="text-sm text-foreground">{subtotal}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted">Tax</Text>
          <Text className="text-sm text-foreground">{tax}</Text>
        </View>
        <View className="flex-row justify-between border-t border-border pt-1">
          <Text className="text-sm font-bold text-foreground">Total</Text>
          <Text className="text-sm font-bold text-foreground">{total}</Text>
        </View>
      </View>

      {payments && payments.length > 0 && (
        <View className="mt-3 gap-1 border-t border-dashed border-border pt-3">
          {payments.map((p, i) => (
            <View key={i} className="flex-row justify-between">
              <Text className="text-sm text-muted">{p.method}</Text>
              <Text className="text-sm text-foreground">{p.amount}</Text>
            </View>
          ))}
        </View>
      )}

      {footerSlot && <View className="mt-3 items-center border-t border-dashed border-border pt-3">{footerSlot}</View>}
    </View>
  );
}
