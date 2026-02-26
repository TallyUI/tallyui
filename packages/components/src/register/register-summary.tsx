import type { ReactNode } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface TransactionSummary {
  method: string;
  count: number;
  total: number;
}

export interface RegisterSummaryProps extends Omit<ViewProps, 'children'> {
  expectedCash: number;
  actualCash: number;
  transactions: TransactionSummary[];
  headerSlot?: ReactNode;
  footerSlot?: ReactNode;
  className?: string;
}

export function RegisterSummary({
  expectedCash,
  actualCash,
  transactions,
  headerSlot,
  footerSlot,
  className,
  ...viewProps
}: RegisterSummaryProps) {
  const discrepancy = actualCash - expectedCash;

  return (
    <View className={cn('gap-4 rounded-lg border border-border bg-surface p-4', className)} {...viewProps}>
      {headerSlot}

      <View className="gap-2">
        <Text className="text-xs font-semibold text-muted">Cash Drawer</Text>
        <View className="flex-row justify-between">
          <Text className="text-sm text-foreground">Expected</Text>
          <Text className="text-sm text-foreground">{expectedCash.toFixed(2)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-sm text-foreground">Actual</Text>
          <Text className="text-sm text-foreground">{actualCash.toFixed(2)}</Text>
        </View>
        <View className="flex-row justify-between border-t border-border pt-1">
          <Text className="text-sm font-semibold text-foreground">Discrepancy</Text>
          <Text className={cn('text-sm font-semibold', discrepancy === 0 ? 'text-success' : 'text-danger')}>
            {discrepancy >= 0 ? '' : '-'}{Math.abs(discrepancy).toFixed(2)}
          </Text>
        </View>
      </View>

      {transactions.length > 0 && (
        <View className="gap-2">
          <Text className="text-xs font-semibold text-muted">Transactions</Text>
          {transactions.map((t) => (
            <View key={t.method} className="flex-row items-center justify-between">
              <View className="gap-0.5">
                <Text className="text-sm text-foreground">{t.method}</Text>
                <Text className="text-xs text-muted">{t.count} transactions</Text>
              </View>
              <Text className="text-sm font-semibold text-foreground">{t.total.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}

      {footerSlot}
    </View>
  );
}
