// Port of WCPOS v2 `packages/core/src/screens/main/components/drawer-content/index.tsx` (the `rail`
// presentation) and `drawer-content/rail/index.tsx`, MIT, WCPOS.
import * as React from 'react';
import { View } from 'react-native';
import { cn } from '@tallyui/theme';
import { Text } from '../ui/text';
import { NavButton, splitGroups, type ShellNavItem } from './nav-item';

export interface NavRailProps {
  items: ShellNavItem[];
  activeId?: string;
  onNavigate: (id: string) => void;
  className?: string;
  testID?: string;
}

/**
 * The wide layout's permanent icon column. Its width is 16 spacing units, the `h-12 w-12` item
 * plus 2 units each side (64 at Regular), so it follows the scale step as v2's does. Icon-only:
 * the label shows to the right on hover or keyboard focus, v2's web tooltip.
 */
export function NavRail({ items, activeId, onNavigate, className, testID = 'nav-rail' }: NavRailProps) {
  const [hinted, setHinted] = React.useState<string | null>(null);
  const renderItem = (item: ShellNavItem) => (
    <View key={item.id} className="relative z-10">
      <NavButton
        item={item}
        active={item.id === activeId}
        onPress={() => onNavigate(item.id)}
        onHoverIn={() => setHinted(item.id)}
        onHoverOut={() => setHinted((id) => (id === item.id ? null : id))}
        onFocus={() => setHinted(item.id)}
        onBlur={() => setHinted((id) => (id === item.id ? null : id))}
      />
      {hinted === item.id && (
        <View
          testID={`nav-rail-label-${item.id}`}
          pointerEvents="none"
          className="absolute left-full top-2 z-50 ml-3 rounded-md border border-border bg-popover px-3 py-1.5 shadow-md"
        >
          <Text className="text-sm text-popover-foreground" numberOfLines={1}>{item.label}</Text>
        </View>
      )}
    </View>
  );
  const [top, bottom] = splitGroups(items);
  return (
    <View
      role="navigation"
      aria-label="Main"
      testID={testID}
      className={cn('z-10 w-16 items-center border-r border-border bg-card py-2', className)}
    >
      <View className="gap-2">{top.map(renderItem)}</View>
      {bottom.length > 0 && <View className="mt-auto gap-2">{bottom.map(renderItem)}</View>}
    </View>
  );
}
