import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface SettingsLayoutProps extends Omit<ViewProps, 'children'> {
  navSlot: ReactNode;
  contentSlot: ReactNode;
  headerSlot?: ReactNode;
  layout?: 'split' | 'stacked';
  breakpoint?: number;
  className?: string;
}

export function SettingsLayout({
  navSlot,
  contentSlot,
  headerSlot,
  layout: layoutProp,
  breakpoint = 768,
  className,
  ...viewProps
}: SettingsLayoutProps) {
  const { width } = useWindowDimensions();
  const layout = layoutProp ?? (width >= breakpoint ? 'split' : 'stacked');
  const [showNav, setShowNav] = useState(false);

  return (
    <View className={cn('flex-1 bg-bg', className)} {...viewProps}>
      {headerSlot && <View className="border-b border-border">{headerSlot}</View>}

      {layout === 'split' ? (
        <View className="flex-1 flex-row">
          <View className="w-64 border-r border-border">{navSlot}</View>
          <View className="flex-1">{contentSlot}</View>
        </View>
      ) : (
        <View className="flex-1">
          {showNav ? (
            <View className="flex-1">
              {navSlot}
              <Pressable onPress={() => setShowNav(false)} className="border-t border-border p-3">
                <Text className="text-center text-sm font-medium text-primary">Done</Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-1">
              <Pressable onPress={() => setShowNav(true)} className="border-b border-border px-4 py-2">
                <Text className="text-sm font-medium text-primary">Menu</Text>
              </Pressable>
              {contentSlot}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
