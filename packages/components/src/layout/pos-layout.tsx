import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';
import { InCartBadge } from '../product/in-cart-badge';
import { GiftIcon, ShoppingCartIcon } from '../ui';

export interface POSLayoutProps extends Omit<ViewProps, 'children'> {
  browseSlot: ReactNode;
  cartSlot: ReactNode;
  headerSlot?: ReactNode;
  layout?: 'split' | 'stacked';
  breakpoint?: number;
  className?: string;
  /** Where the stacked layout's tabs sit. 'bottom' is v2's phone tab bar (Products / Cart, icons, both panes kept
   *  mounted). Default 'top', today's tabs. */
  tabBar?: 'top' | 'bottom';
  /** The cart's item count, shown over the Cart tab's icon in the bottom bar; hidden at 0 or undefined. */
  cartCount?: number;
}

export function POSLayout({
  browseSlot,
  cartSlot,
  headerSlot,
  layout: layoutProp,
  breakpoint = 768,
  className,
  tabBar = 'top',
  cartCount,
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
      ) : tabBar === 'bottom' ? (
        // v2's phone tab bar (apps/main/components/pos-phone-tab-bar.tsx). Both panes stay mounted, as v2's
        // `lazy: false` keeps both tabs: the scan handler lives in Products and the cart keeps its state.
        <>
          <View className="flex-1">
            <View className={activeTab === 'browse' ? 'flex-1' : 'hidden'}>{browseSlot}</View>
            <View className={activeTab === 'cart' ? 'flex-1' : 'hidden'}>{cartSlot}</View>
          </View>
          <View testID="pos-tab-bar" className="border-t border-border bg-card">
            <View role="tablist" className="flex-row justify-around py-2">
              {(['browse', 'cart'] as const).map((tab) => {
                const active = activeTab === tab;
                const Icon = tab === 'browse' ? GiftIcon : ShoppingCartIcon;
                const tone = active ? 'text-primary' : 'text-muted-foreground';
                return (
                  <Pressable key={tab} role="tab" aria-selected={active} onPress={() => setActiveTab(tab)}
                    testID={tab === 'browse' ? 'pos-tab-products' : 'pos-tab-cart'} className="flex-1 items-center gap-1 py-2">
                    <View className="relative">
                      <Icon size={20} className={tone} />
                      {tab === 'cart' && cartCount !== undefined && cartCount > 0 ? (
                        <InCartBadge count={cartCount} testID="pos-tab-cart-count" className="absolute -top-2 left-3" />
                      ) : null}
                    </View>
                    <Text className={cn('text-xs', tone)}>{tab === 'browse' ? 'Products' : 'Cart'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      ) : (
        <>
          <View className="flex-row border-b border-border">
            <Pressable
              onPress={() => setActiveTab('browse')}
              className={cn('flex-1 py-3', activeTab === 'browse' && 'border-b-2 border-primary')}
            >
              <Text className={cn('text-center text-sm font-semibold', activeTab === 'browse' ? 'text-primary' : 'text-muted-foreground')}>
                Browse
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('cart')}
              className={cn('flex-1 py-3', activeTab === 'cart' && 'border-b-2 border-primary')}
            >
              <Text className={cn('text-center text-sm font-semibold', activeTab === 'cart' ? 'text-primary' : 'text-muted-foreground')}>
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
