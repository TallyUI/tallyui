import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatMoney } from '@tallyui/core';
import { needsAttention, type PosOrder } from '@tallyui/pos';

const STATUS_LABEL = { pending: 'Waiting to sync', applied: 'Synced', rejected: 'Not accepted' };

/** Keeps an unparseable value as is, like medusapos's date util, since `Intl` throws on an invalid date. */
function defaultFormatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** The "Needs attention" (when not empty) and "Recent" orders, lifted from medusapos/app's orders screen (ADR-052).
 * `onRetry` is the outbox's `requeue`; `formatDate` replaces the app's date util; `footer` is the app's own content
 * (medusapos: the feedback link). The router and session redirect stay in the app. */
export function OrdersList({ orders, onRetry, formatDate = defaultFormatDate, footer }: {
  orders: PosOrder[]; onRetry(orderIds: string[]): Promise<number>; formatDate?: (iso: string) => string; footer?: ReactNode;
}) {
  const retrying = useRef(new Set<string>());
  const [retryingIds, setRetryingIds] = useState(new Set<string>());
  useEffect(() => {
    for (const id of retrying.current) {
      if (!orders.some((order) => order.id === id && order.syncStatus === 'rejected')) retrying.current.delete(id);
    }
    setRetryingIds(new Set(retrying.current));
  }, [orders]);
  return <ScrollView className="flex-1 bg-background p-4">
    {[{ title: 'Needs attention', orders: needsAttention(orders) }, { title: 'Recent', orders }].filter((section) => section.title === 'Recent' || section.orders.length > 0).map((section) => (
      <View key={section.title} className="mb-6 gap-3">
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">{section.title}</Text>
        {section.orders.map((order) => {
          const count = order.lines.reduce((sum, line) => sum + line.quantity, 0);
          return (
          <View key={order.id} className="gap-1 rounded-md border border-border bg-card p-3">
            <Text className="text-foreground">{order.serverRefs?.displayId ? `Order #${order.serverRefs.displayId} · ` : ''}{count} {count === 1 ? 'item' : 'items'}</Text>
            <Text className="text-muted-foreground">{formatDate(order.createdAt)} · {formatMoney({ amount: order.totalMinor, currency: order.currency })} · {STATUS_LABEL[order.syncStatus]}</Text>
            {order.syncStatus === 'rejected' && order.error ? <Text className="text-destructive">{order.error.code}: {order.error.message}</Text> : null}
            {section.title === 'Needs attention' && order.syncStatus === 'rejected' ? order.error?.code === 'idempotency_mismatch'
              ? <Text className="text-foreground">This sale needs checking against the store before it can be sent again.</Text>
              : <Pressable accessibilityRole="button" disabled={retryingIds.has(order.id)} onPress={async () => {
                if (retrying.current.has(order.id)) return;
                retrying.current.add(order.id);
                setRetryingIds(new Set(retrying.current));
                if (await onRetry([order.id]) === 0) {
                  retrying.current.delete(order.id);
                  setRetryingIds(new Set(retrying.current));
                }
              }} className="rounded-md bg-primary px-4 py-2">
                <Text className="text-center font-semibold text-primary-foreground">Retry</Text>
              </Pressable> : null}
            {order.warnings?.map((warning, index) => <View key={index} className="border-l-4 border-warning pl-2"><Text className="text-foreground">
              {warning.code === 'insufficient_stock'
                ? `Stock short by ${warning.quantity} for ${order.lines.find((line) => line.variantId === warning.variantId)?.name}`
                : `Store total ${formatMoney({ amount: warning.serverMinor, currency: order.currency })} vs POS ${formatMoney({ amount: warning.expectedMinor, currency: order.currency })}`}
            </Text></View>)}
          </View>
          );
        })}
      </View>
    ))}
    {footer}
  </ScrollView>;
}
