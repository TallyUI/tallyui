import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface CheckoutLayoutProps extends Omit<ViewProps, 'children'> {
  summarySlot: ReactNode;
  paymentSlot: ReactNode;
  headerSlot?: ReactNode;
  layout?: 'split' | 'stacked';
  breakpoint?: number;
  className?: string;
}

export function CheckoutLayout({
  summarySlot,
  paymentSlot,
  headerSlot,
  layout: layoutProp,
  breakpoint = 768,
  className,
  ...viewProps
}: CheckoutLayoutProps) {
  const { width } = useWindowDimensions();
  const layout = layoutProp ?? (width >= breakpoint ? 'split' : 'stacked');

  return (
    <View className={cn('flex-1 bg-bg', className)} {...viewProps}>
      {headerSlot && <View className="border-b border-border">{headerSlot}</View>}

      {layout === 'split' ? (
        <View className="flex-1 flex-row">
          <View className="flex-1 border-r border-border">{summarySlot}</View>
          <View className="flex-1">{paymentSlot}</View>
        </View>
      ) : (
        <ScrollView className="flex-1">
          <View className="gap-4 p-4">
            {summarySlot}
            {paymentSlot}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
