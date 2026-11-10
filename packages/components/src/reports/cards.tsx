/**
 * The Sales room's cards over unit 10's figures. Port of WCPOS v2 `screens/main/reports/cards/`
 * (`card.tsx`, `primitives.tsx`, `orders.tsx`, `payments.tsx`, `top-products.tsx`,
 * `categories.tsx`, `taxes.tsx`, `refunds.tsx`); copy is v2's English (`core.json`). An unknown
 * figure (margin with no costed line, kept share of no sales) shows `—`, never 0.
 */
import type { JSX, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatMoney } from '@tallyui/core';
import type { SalesFigures } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Card } from '../ui/card';

export type SalesCardId = 'orders' | 'payments' | 'products' | 'categories' | 'taxes' | 'refunds';
export interface SalesCardsProps {
  figures: SalesFigures;
  currency: string;
  /** Opens the card's panel. */
  onOpenCard?: (card: SalesCardId) => void;
}

const SWATCHES = ['bg-primary', 'bg-info', 'bg-success', 'bg-warning', 'bg-destructive'];
const OTHER_SWATCH = 'bg-muted-foreground';
const LEGEND_ROWS = 5;
const TOP_PRODUCTS = 4;
const UNKNOWN = '—';
const percent = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

interface Share { label: string; value: number; text: string; note?: string; swatch: string }

function ReportCard({ id, name, figure, onOpen, children }: {
  id: SalesCardId; name: string; figure: string; onOpen?: (card: SalesCardId) => void; children: ReactNode;
}): JSX.Element {
  const head = (
    <View className="flex-row items-baseline justify-between gap-2">
      <Text className="text-sm text-muted-foreground">{name}</Text>
      <Text testID={`card-${id}-figure`} className="text-lg font-semibold text-foreground">{figure}</Text>
    </View>
  );
  return (
    <Card testID={`card-${id}`} className="min-w-72 flex-1 gap-3 p-4">
      {onOpen ? (
        <Pressable testID={`card-${id}-open`} accessibilityRole="button" accessibilityLabel={name} onPress={() => onOpen(id)}>
          {head}
        </Pressable>
      ) : head}
      {children}
    </Card>
  );
}

const Empty = ({ testID, children }: { testID: string; children: string }) => (
  <Text testID={testID} className="text-sm text-muted-foreground">{children}</Text>
);

function StatGrid({ stats }: { stats: { label: string; value: string; testID?: string }[] }): JSX.Element {
  return (
    <View className="flex-row flex-wrap gap-y-2">
      {stats.map((stat) => (
        <View key={stat.label} className="basis-1/3 gap-0.5">
          <Text className="text-xs text-muted-foreground">{stat.label}</Text>
          <Text testID={stat.testID} className="text-sm font-medium text-foreground">{stat.value}</Text>
        </View>
      ))}
    </View>
  );
}

function ProportionalBar({ shares }: { shares: Share[] }): JSX.Element {
  const positive = shares.filter((share) => share.value > 0);
  return (
    <View className="h-2 flex-row gap-0.5 overflow-hidden rounded-md">
      {positive.length ? positive.map((share, i) => (
        <View key={i} className={share.swatch} style={{ flex: share.value }} />
      )) : <View className="flex-1 bg-muted" />}
    </View>
  );
}

function Legend({ shares }: { shares: Share[] }): JSX.Element {
  return (
    <View className="gap-1.5">
      {shares.map((share, i) => (
        <View key={i} className="flex-row items-center gap-2">
          <View className={cn('h-2.5 w-2.5 rounded-sm', share.swatch)} />
          <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>{share.label}</Text>
          {share.note && <Text className="text-xs text-muted-foreground">{share.note}</Text>}
          <Text className="text-sm font-medium text-foreground">{share.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** The first rows with their own swatch, the rest folded into Other. */
function shares<T>(rows: T[], toShare: (row: T) => Omit<Share, 'swatch'>, otherText: (rest: T[]) => string): Share[] {
  const head = rows.slice(0, LEGEND_ROWS).map((row, i) => ({ ...toShare(row), swatch: SWATCHES[i % SWATCHES.length] }));
  const rest = rows.slice(LEGEND_ROWS);
  if (!rest.length) return head;
  return [...head, { label: 'Other', value: rest.reduce((sum, row) => sum + toShare(row).value, 0), text: otherText(rest), swatch: OTHER_SWATCH }];
}

export function SalesCards({ figures, currency, onOpenCard }: SalesCardsProps): JSX.Element {
  const money = (minor: number) => formatMoney({ amount: minor, currency }) ?? '';
  const { totals, payments, products, categories, taxes, refunds } = figures;
  const { margin } = totals;
  const productNet = products.reduce((sum, row) => sum + row.netMinor, 0);
  const categoryNet = categories.reduce((sum, row) => sum + row.netMinor, 0);
  const paymentShares = shares(payments.rows, (row) => ({
    label: row.label || (row.method === 'unpaid' ? 'Unpaid' : row.method === 'unknown' ? 'Unknown' : row.method),
    value: row.amountMinor, text: money(row.amountMinor), note: `${row.orders} orders`,
  }), (rest) => money(rest.reduce((sum, row) => sum + row.amountMinor, 0)));
  const categoryShares = shares(categories, (row) => ({
    label: row.key === '' ? 'Uncategorised' : row.name, value: row.netMinor, text: money(row.netMinor), note: `${row.quantity} sold`,
  }), (rest) => money(rest.reduce((sum, row) => sum + row.netMinor, 0)));
  const taxShares = shares(taxes, (row) => ({
    label: row.label || 'Tax', value: row.taxMinor, text: money(row.taxMinor),
    note: row.netMinor === null ? undefined : `on ${money(row.netMinor)}`,
  }), (rest) => money(rest.reduce((sum, row) => sum + row.taxMinor, 0)));
  const card = { onOpen: onOpenCard };

  return (
    <View testID="sales-cards" className="flex-row flex-wrap gap-4">
      <ReportCard id="orders" name="Orders" figure={String(totals.orderCount)} {...card}>
        {totals.orderCount === 0 ? <Empty testID="card-orders-empty">No orders in this period</Empty> : (
          <View className="gap-2">
            <StatGrid stats={[
              { label: 'Average order', value: money(totals.averageMinor) },
              { label: 'Items Sold', value: String(totals.items) },
              { label: 'Items per order', value: (totals.items / totals.orderCount).toFixed(1) },
              { label: 'Discounts', value: money(totals.discountMinor) },
              { label: 'Margin %', value: margin.marginPct === null ? UNKNOWN : percent(margin.marginPct), testID: 'card-orders-margin' },
            ]} />
            {margin.missingLines > 0 && (
              <Text testID="card-orders-cost-missing" className="text-xs text-muted-foreground">
                {`Cost missing on ${margin.missingQuantity} of ${totals.items} items`}
              </Text>
            )}
          </View>
        )}
      </ReportCard>
      <ReportCard id="payments" name="Payments" figure={money(totals.grossMinor)} {...card}>
        {payments.rows.length === 0 ? <Empty testID="card-payments-empty">No payments in this period</Empty> : (
          <><ProportionalBar shares={paymentShares} /><Legend shares={paymentShares} /></>
        )}
      </ReportCard>
      <ReportCard id="products" name="Top products" figure={String(totals.items)} {...card}>
        {products.length === 0 ? <Empty testID="card-products-empty">No sales in this period</Empty> : (
          <View className="gap-2">
            {products.slice(0, TOP_PRODUCTS).map((row) => {
              const share = productNet > 0 ? Math.min(1, Math.max(0, row.netMinor / productNet)) : 0;
              return (
                <View key={row.key} className="gap-1">
                  <View className="flex-row justify-between gap-2">
                    <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>{row.name || 'Unknown'}</Text>
                    <Text className="text-sm font-medium text-foreground">{money(row.netMinor)}</Text>
                  </View>
                  <View className="h-1.5 overflow-hidden rounded-md bg-muted">
                    <View className="h-full bg-primary" style={{ width: `${share * 100}%` }} />
                  </View>
                  <Text className="text-xs text-muted-foreground">{`${percent(share)} · ${row.quantity} sold`}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ReportCard>
      <ReportCard id="categories" name="Categories" figure={money(categoryNet)} {...card}>
        {categories.length === 0 ? <Empty testID="card-categories-empty">No sales in this period</Empty> : (
          <><ProportionalBar shares={categoryShares} /><Legend shares={categoryShares} /></>
        )}
      </ReportCard>
      <ReportCard id="taxes" name="Taxes" figure={money(totals.taxMinor)} {...card}>
        {taxes.length === 0 ? <Empty testID="card-taxes-empty">None in this period</Empty> : (
          <>
            <ProportionalBar shares={taxShares} /><Legend shares={taxShares} />
            <StatGrid stats={[
              { label: 'Net', value: money(totals.netMinor) },
              { label: 'Tax', value: money(totals.taxMinor) },
              { label: 'Gross', value: money(totals.grossMinor) },
            ]} />
          </>
        )}
      </ReportCard>
      <ReportCard id="refunds" name="Refunds" figure={money(refunds.amountMinor)} {...card}>
        {refunds.count === 0 ? <Empty testID="card-refunds-none">None in this period</Empty> : (
          <StatGrid stats={[
            { label: 'Refunded', value: money(refunds.amountMinor) },
            { label: 'Orders', value: `${refunds.orders} of ${totals.orderCount}` },
            { label: 'Kept', testID: 'card-refunds-kept',
              value: totals.grossMinor === 0 ? UNKNOWN : percent((totals.grossMinor - refunds.amountMinor) / totals.grossMinor) },
          ]} />
        )}
      </ReportCard>
    </View>
  );
}
