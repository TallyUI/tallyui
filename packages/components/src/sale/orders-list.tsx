import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatMoney, knownWarnings } from '@tallyui/core';
import { needsAttention, type OutboxState, type PosOrder } from '@tallyui/pos';
import { orderReference } from './order-reference';
import { sinceText } from './since-text';

const STATUS_LABEL = { pending: 'Waiting to sync', applied: 'Synced', rejected: 'Not accepted' };
/** `figures_mismatch`'s labels; a field a newer store sends that isn't here is shown by its raw name. */
const FIGURE_LABELS = new Map([['subtotalMinor', 'Subtotal'], ['taxMinor', 'Tax'], ['discountMinor', 'Discount']]);
/** A rejected sale's line in the cashier's words, by the store's error code (#269). The store's own message goes to the
 * sync log (the outbox logs it), never here. */
const REFUSAL_SENTENCES = new Map([
  ['invalid_payload', "The online store refused this sale: this till sent it in a form the store can't read. Ask the store owner to look at the till's sync log."],
  ['unsupported_version', "The online store refused this sale: the store's software is older than this till's. Ask the store owner to update the POS plugin."],
  ['idempotency_mismatch', "The online store has a different sale under this sale's number. Don't send it again; ask the store owner to compare the two."],
  ['store_configuration', 'The online store refused this sale: a setting on the store needs changing. Once the store owner fixes it, press Retry.'],
  ['platform_error', "The online store refused this sale. Ask the store owner to look at the till's sync log."],
  ['internal_error', "The online store hit a fault in its POS plugin and refused this sale. Ask the store owner to look at the till's sync log."],
  ['insufficient_stock', "The online store refused this sale: it doesn't have enough stock of one of the items."],
  ['unsupported_tax_mode', "The online store refused this sale: its tax settings can't take a sale like this one. Ask the store owner to check them."],
  ['unknown_variant', 'The online store refused this sale: that product variation no longer exists.'],
  ['invalid_quantity', "The online store refused this sale: a quantity or a discount on it isn't allowed."],
  ['underpaid', 'The online store refused this sale: the payments add up to less than the total.'],
  ['unsupported_currency', "The online store refused this sale: the store doesn't take this currency."],
]);
// Any other code, or none: platform_error's sentence, as the generic fallback (approved by the Front desk, 2026-09-30).
const refusalSentence = (code: string | undefined) => REFUSAL_SENTENCES.get(code ?? '') ?? REFUSAL_SENTENCES.get('platform_error')!;

/** Keeps an unparseable value as is, like medusapos's date util, since `Intl` throws on an invalid date. */
function defaultFormatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** The "Needs attention" (when not empty) and "Recent" orders, lifted from medusapos/app's orders screen (ADR-052).
 * `onRetry` is the outbox's `requeue`; `formatDate` replaces the app's date util; `footer` is the app's own content
 * (medusapos: the feedback link). The router and session redirect stay in the app. `stuck` is the outbox's
 * `state.stuck` (`useOrderOutbox`): those pending orders need attention too, each with its own entry's reason and since. */
export function OrdersList({ orders, onRetry, formatDate = defaultFormatDate, footer, stuck }: {
  orders: PosOrder[]; onRetry(orderIds: string[]): Promise<number>; formatDate?: (iso: string) => string; footer?: ReactNode;
  stuck?: OutboxState['stuck'];
}) {
  const retrying = useRef(new Set<string>());
  const [retryingIds, setRetryingIds] = useState(new Set<string>());
  const [expanded, setExpanded] = useState(new Set<string>());
  useEffect(() => {
    for (const id of retrying.current) {
      if (!orders.some((order) => order.id === id && order.syncStatus === 'rejected')) retrying.current.delete(id);
    }
    setRetryingIds(new Set(retrying.current));
  }, [orders]);
  return <ScrollView className="flex-1 bg-background p-4">
    {[{ title: 'Needs attention', orders: needsAttention(orders, { stuckCommandIds: stuck?.commandIds }) }, { title: 'Recent', orders }].filter((section) => section.title === 'Recent' || section.orders.length > 0).map((section) => (
      <View key={section.title} className="mb-6 gap-3">
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">{section.title}</Text>
        {section.title === 'Recent' && orders.length === 0 ? <Text testID="orders-empty" className="text-muted-foreground">No sales yet. Completed sales appear here.</Text> : null}
        {section.orders.map((order) => {
          const count = order.lines.reduce((sum, line) => sum + line.quantity, 0);
          const key = `${section.title}:${order.id}`;
          const isExpanded = expanded.has(key);
          // The order's own stuck entry: its clock and latest reason, not the earliest across all stuck orders.
          const stuckEntry = order.syncStatus === 'pending' ? stuck?.orders.find((entry) => entry.commandId === order.commandId) : undefined;
          return (
          <View key={order.id} className="gap-1 rounded-md border border-border bg-card p-3">
            <Pressable accessibilityRole="button" aria-expanded={isExpanded}
              accessibilityHint="Shows the items and payments of this sale" testID={`order-row-${order.id}`} className="gap-1"
              onPress={() => setExpanded((current) => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              })}>
              <Text className="text-foreground">{`Order ${orderReference(order)} · ${count} ${count === 1 ? 'item' : 'items'}`}</Text>
              <Text className="text-muted-foreground">{formatDate(order.createdAt)} · {formatMoney({ amount: order.totalMinor, currency: order.currency })} · {STATUS_LABEL[order.syncStatus]}</Text>
            </Pressable>
            {isExpanded ? <View testID={`order-detail-${order.id}`} className="mt-1 gap-1 border-t border-border pt-2">
              {order.lines.map((line) => <Text key={line.id} className="text-foreground">{`${line.quantity} × ${line.name}`}</Text>)}
              {order.payments.map((payment) => <Text key={payment.id} className="text-muted-foreground">
                {`${payment.method === 'cash' ? 'Cash' : 'Card terminal'} ${formatMoney({ amount: payment.amountMinor, currency: order.currency })}${payment.reference ? ` · ${payment.reference}` : ''}`}
              </Text>)}
            </View> : null}
            {stuckEntry ? <Text className="text-destructive">
              {/* The same words for any reason, with no reason code; the hour as the status line has it (numeric, #245). */}
              {`Hasn't reached the online store since ${sinceText(stuckEntry)}.`}
            </Text> : null}
            {/* The code's sentence alone: the cashier sees no error code and never the store's message. */}
            {order.syncStatus === 'rejected' ? <Text className="text-destructive">{refusalSentence(order.error?.code)}</Text> : null}
            {/* A late sale (ADR-032) needs no Retry of its own; a rejected one still gets its Retry below. */}
            {order.lateSessionId !== undefined ? <Text className="text-foreground">Taken after the register closed. It is not in that register's closure.</Text> : null}
            {order.localWarnings?.map((warning, index) => <Text key={index} className="text-foreground">
              {warning.code === 'customer_omitted'
                ? `The customer's ${warning.field} couldn't be sent to the store, so the order isn't linked to them.`
                : "The terminal's payment reference couldn't be kept; the payment is recorded without it."}
            </Text>)}
            {/* idempotency_mismatch isn't requeueable (the outbox's NOT_REQUEUEABLE): its sentence says not to send it again, and no Retry. */}
            {section.title === 'Needs attention' && order.syncStatus === 'rejected' && order.error?.code !== 'idempotency_mismatch'
              ? <Pressable accessibilityRole="button" disabled={retryingIds.has(order.id)} onPress={async () => {
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
            {knownWarnings(order.warnings).map((warning, index) => <View key={index} className="border-l-4 border-warning pl-2"><Text className="text-foreground">
              {warning.code === 'insufficient_stock'
                ? `Stock short by ${warning.quantity} for ${order.lines.find((line) => line.variantId === warning.variantId)?.name}`
                : warning.code === 'tax_rate_mismatch'
                ? `Tax at ${(warning.ratePpm / 10000).toLocaleString(undefined, { maximumFractionDigits: 4 })}%: store ${formatMoney({ amount: warning.serverMinor, currency: order.currency })} vs POS ${formatMoney({ amount: warning.expectedMinor, currency: order.currency })}`
                : warning.code === 'customer_ignored'
                ? `The online store didn't recognise the customer on this sale, so it was saved as a guest sale. Customer id: ${warning.customerId}.`
                : warning.code === 'figures_mismatch'
                ? `The online store worked out different figures for this sale. ${warning.fields.map(({ field, tillMinor, serverMinor }) => `${FIGURE_LABELS.get(field) ?? field}: till ${formatMoney({ amount: tillMinor, currency: order.currency })}, store ${formatMoney({ amount: serverMinor, currency: order.currency })}.`).join(' ')}`
                : warning.bridgeMinor !== undefined
                ? `Store calculated ${formatMoney({ amount: warning.serverMinor, currency: order.currency })}; a rounding line of ${warning.bridgeMinor > 0 ? '+' : ''}${formatMoney({ amount: warning.bridgeMinor, currency: order.currency })} brought it to ${formatMoney({ amount: warning.expectedMinor, currency: order.currency })}`
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
