import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Text as UIText } from '../ui/text';
import { OrderStatusBadge, type OrderStatus } from './order-status-badge';

export interface OrderDetailLineItem {
  name: string;
  quantity: number;
  total: string;
}

/** One tax rate's share, drawn indented under the Tax row (v2: "US 10%  $9.20"). */
export interface OrderDetailTaxLine {
  label: string;
  amount: string;
}

export interface OrderDetailProps extends Omit<ViewProps, 'children'> {
  orderNumber: string;
  status: OrderStatus;
  lineItems: OrderDetailLineItem[];
  subtotal: string;
  tax: string;
  total: string;
  /** The line under the header, v2's "when · store · cashier"; empty parts are dropped. */
  meta?: string[];
  /** Formatted discount, shown as given (pass the negative, e.g. "-$2.00"). Omit to hide the row. */
  discount?: string;
  /** Coupon codes, already joined (v2 joins with ", "), in a chip beside "Discount". */
  couponCodes?: string;
  /** Formatted shipping total. Omit to hide the row. */
  shipping?: string;
  /** Shipping method title, shown beside "Shipping" as "· <title>". */
  shippingMethod?: string;
  /** Formatted fees total. Omit to hide the row. */
  fees?: string;
  /** Per-rate tax breakdown, indented under the Tax row. */
  taxLines?: OrderDetailTaxLine[];
  customerSlot?: ReactNode;
  paymentSlot?: ReactNode;
  footerSlot?: ReactNode;
  /** Re-open the order; draws the Re-open button in the pinned actions row. */
  onReopen?: () => void;
  /** Sync the order with the server; draws the Sync button. */
  onSync?: () => void;
  /** Show the order's receipt; draws the Receipt button. */
  onReceipt?: () => void;
  /** Refund the order; draws Refund in the actions row's destructive group. */
  onRefund?: () => void;
  /** Delete the order; draws Delete, which asks for confirmation and calls this only on confirm. */
  onDelete?: () => void;
  /** Disables Re-open, e.g. while it runs or while storage is degraded. Default `false`. */
  reopenDisabled?: boolean;
  className?: string;
}

export function OrderDetail({
  orderNumber,
  status,
  lineItems,
  subtotal,
  tax,
  total,
  meta,
  discount,
  couponCodes,
  shipping,
  shippingMethod,
  fees,
  taxLines,
  customerSlot,
  paymentSlot,
  footerSlot,
  onReopen,
  onSync,
  onReceipt,
  onRefund,
  onDelete,
  reopenDisabled = false,
  className,
  ...viewProps
}: OrderDetailProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const metaLine = meta?.filter(Boolean).join(' · ');
  const scroll = (
    <ScrollView className={cn('flex-1', className)} {...viewProps}>
      <View className="gap-4 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-foreground">{orderNumber}</Text>
          <OrderStatusBadge status={status} />
        </View>
        {metaLine ? (
          <Text testID="order-detail-meta" className="text-xs text-muted-foreground">
            {metaLine}
          </Text>
        ) : null}

        {customerSlot && <View className="border-b border-border pb-3">{customerSlot}</View>}

        <View className="gap-1">
          <Text className="text-xs font-semibold text-muted-foreground">Items</Text>
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
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">Subtotal</Text>
            <Text className="text-sm text-foreground">{subtotal}</Text>
          </View>
          {discount ? (
            <View testID="order-detail-discount" className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm text-muted-foreground">Discount</Text>
                {couponCodes ? (
                  <View className="rounded bg-primary/10 px-1.5 py-0.5">
                    <Text className="text-xs font-medium text-primary">{couponCodes}</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-sm text-foreground">{discount}</Text>
            </View>
          ) : null}
          {shipping ? (
            <View testID="order-detail-shipping" className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm text-muted-foreground">Shipping</Text>
                {shippingMethod ? <Text className="text-xs text-muted-foreground">· {shippingMethod}</Text> : null}
              </View>
              <Text className="text-sm text-foreground">{shipping}</Text>
            </View>
          ) : null}
          {fees ? (
            <View testID="order-detail-fees" className="flex-row items-center justify-between">
              <Text className="text-sm text-muted-foreground">Fees</Text>
              <Text className="text-sm text-foreground">{fees}</Text>
            </View>
          ) : null}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">Tax</Text>
            <Text className="text-sm text-foreground">{tax}</Text>
          </View>
          {taxLines?.map((line, i) => (
            <View key={i} testID={`order-detail-tax-line-${i}`} className="flex-row items-center justify-between pl-3">
              <Text className="text-xs text-muted-foreground">{line.label}</Text>
              <Text className="text-xs text-muted-foreground">{line.amount}</Text>
            </View>
          ))}
          <View className="flex-row items-center justify-between border-t border-border pt-2 mt-1">
            <Text className="text-sm font-bold text-foreground">Total</Text>
            <Text className="text-sm font-bold text-foreground">{total}</Text>
          </View>
        </View>

        {paymentSlot && <View className="border-t border-border pt-3">{paymentSlot}</View>}
        {footerSlot && <View className="border-t border-border pt-3">{footerSlot}</View>}
      </View>
    </ScrollView>
  );
  if (!onReopen && !onSync && !onReceipt && !onRefund && !onDelete) return scroll;
  return (
    <View className="flex-1">
      {scroll}
      {/* v2's pinned order footer (orders/edit/view.tsx): Delete, Refund and Sync on the left, Receipt and Re-open on the right. */}
      <View testID="order-detail-actions" className="flex-row flex-wrap items-center justify-between gap-2 border-t border-border p-4">
        <View className="min-w-0 shrink flex-row flex-wrap gap-2">
          {onDelete && <Button variant="outline" className="border-destructive" testID="order-detail-delete" onPress={() => setDeleteOpen(true)}>
            <UIText className="text-destructive">Delete</UIText></Button>}
          {onRefund && <Button variant="outline" className="border-destructive" testID="order-detail-refund" onPress={onRefund}>
            <UIText className="text-destructive">Refund</UIText></Button>}
          {onSync && <Button variant="outline" testID="order-detail-sync" onPress={onSync}><UIText>Sync</UIText></Button>}
        </View>
        <View className="ml-auto flex-row flex-wrap gap-2">
          {onReceipt && <Button variant="outline" testID="order-detail-receipt" onPress={onReceipt}><UIText>Receipt</UIText></Button>}
          {onReopen && <Button testID="order-detail-reopen" onPress={onReopen} disabled={reopenDisabled}
            accessibilityState={{ disabled: reopenDisabled }}><UIText>Re-open</UIText></Button>}
        </View>
      </View>
      {onDelete && <ConfirmDialog
        testID="order-detail-delete-dialog"
        title={`Delete order ${orderNumber}`}
        description="Are you sure you want to delete this order?"
        confirmLabel="Delete"
        open={deleteOpen} onOpenChange={setDeleteOpen}
        onConfirm={onDelete}
      />}
    </View>
  );
}
