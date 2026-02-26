import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface POSLayoutProps extends Omit<ViewProps, 'children'> {
  browseSlot: ReactNode;
  cartSlot: ReactNode;
  headerSlot?: ReactNode;
  layout?: 'split' | 'stacked';
  breakpoint?: number;
  className?: string;
}

export function POSLayout({
  browseSlot,
  cartSlot,
  headerSlot,
  layout: layoutProp,
  breakpoint = 768,
  className,
  ...viewProps
}: POSLayoutProps) {
  const { width } = useWindowDimensions();
  const layout = layoutProp ?? (width >= breakpoint ? 'split' : 'stacked');
  const [activeTab, setActiveTab] = useState<'browse' | 'cart'>('browse');

  return (
    <View className={cn('flex-1 bg-bg', className)} {...viewProps}>
      {headerSlot && <View className="border-b border-border">{headerSlot}</View>}

      {layout === 'split' ? (
        <View className="flex-1 flex-row">
          <View className="flex-[3]">{browseSlot}</View>
          <View className="flex-[2] border-l border-border">{cartSlot}</View>
        </View>
      ) : (
        <>
          <View className="flex-row border-b border-border">
            <Pressable
              onPress={() => setActiveTab('browse')}
              className={cn('flex-1 py-3', activeTab === 'browse' && 'border-b-2 border-primary')}
            >
              <Text className={cn('text-center text-sm font-semibold', activeTab === 'browse' ? 'text-primary' : 'text-muted')}>
                Browse
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('cart')}
              className={cn('flex-1 py-3', activeTab === 'cart' && 'border-b-2 border-primary')}
            >
              <Text className={cn('text-center text-sm font-semibold', activeTab === 'cart' ? 'text-primary' : 'text-muted')}>
                Cart
              </Text>
            </Pressable>
          </View>
          <View className="flex-1">
            {activeTab === 'browse' ? browseSlot : cartSlot}
          </View>
        </>
      )}
    </View>
  );
}
