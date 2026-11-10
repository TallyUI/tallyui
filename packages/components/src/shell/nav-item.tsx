// Port of WCPOS v2 `packages/components/src/nav-item/index.tsx` (the `drawer` size), MIT, WCPOS.
import * as React from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
import { cn } from '@tallyui/theme';
import { Text } from '../ui/text';

export interface ShellNavItem {
  id: string;
  label: string;
  /** An icon element drawn in currentColor (`createSvgIcon`), 24 px. */
  icon: React.ReactNode;
  /** A count or short text on the icon's shoulder; nothing when undefined, 0 or ''. */
  badge?: number | string;
  /** `bottom` items sit in the group pinned to the end of the rail or drawer (v2's `marginTop: 'auto'`). */
  group?: 'top' | 'bottom';
}

/** The items in their two groups, in the order given: v2's top group and its bottom group. */
export function splitGroups(items: ShellNavItem[]): [ShellNavItem[], ShellNavItem[]] {
  return [items.filter((item) => item.group !== 'bottom'), items.filter((item) => item.group === 'bottom')];
}

type NavButtonProps = Omit<PressableProps, 'children'> & {
  item: ShellNavItem;
  active: boolean;
  /** The drawer's labelled row; the rail draws the icon-only square. */
  labelled?: boolean;
};

/** One nav entry: `h-12 rounded-lg` as v2's drawer size, lifted onto the primary tint when active. */
export const NavButton = React.forwardRef<View, NavButtonProps>(function NavButton(
  { item, active, labelled = false, className, ...props },
  ref,
) {
  const tint = active ? 'text-primary' : 'text-muted-foreground';
  return (
    <Pressable
      ref={ref}
      role="button"
      aria-current={active ? 'page' : undefined}
      accessibilityLabel={item.label}
      testID={`nav-item-${item.id}`}
      className={cn(
        'h-12 flex-row items-center rounded-lg web:transition-colors',
        labelled ? 'gap-3 px-3' : 'w-12 justify-center',
        active ? 'bg-primary/10' : 'web:hover:bg-accent active:bg-accent',
        'web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring',
        typeof className === 'string' ? className : undefined,
      )}
      {...props}
    >
      <View className={cn('h-6 w-6 items-center justify-center', tint)}>
        {item.icon}
        {item.badge !== undefined && item.badge !== 0 && item.badge !== '' && (
          <View
            testID={`nav-item-${item.id}-badge`}
            className="absolute -right-2 -top-1 h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1"
          >
            <Text className="text-2xs font-semibold text-destructive-foreground">{item.badge}</Text>
          </View>
        )}
      </View>
      {labelled && (
        <Text className={cn('flex-1 text-base', active ? 'font-semibold text-primary' : 'text-foreground')} numberOfLines={1}>
          {item.label}
        </Text>
      )}
    </Pressable>
  );
});
