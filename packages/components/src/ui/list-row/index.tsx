import * as React from 'react';
import { Pressable, View, type PressableProps, type Role } from 'react-native';
import { cn } from '@tallyui/theme';
import { usePointer } from '../../scale/use-pointer';

type ListRowProps = Omit<PressableProps, 'children' | 'role'> & {
  /** Unset, a row with an action is a `button`; one without is no control at all. */
  role?: Role;
  /** Before the body: an avatar, a thumb, a check. */
  leading?: React.ReactNode;
  /** After the body: an amount, a badge, a chevron. */
  trailing?: React.ReactNode;
  className?: string;
  /** The body column's own layout (a `gap-1` between its lines). */
  bodyClassName?: string;
  children?: React.ReactNode;
};

/**
 * WCPOS v2's ListRow: one flush row of a list, a hairline under it, `leading`, body and `trailing`.
 * Later slices add `size`, the `selected` mark and v2's shared pressable surface.
 */
function ListRow({
  role,
  accessibilityRole,
  leading,
  trailing,
  className,
  bodyClassName,
  children,
  disabled,
  ...props
}: ListRowProps) {
  const pointer = usePointer();
  return (
    <Pressable
      role={(role ?? accessibilityRole ?? (props.onPress ? 'button' : undefined)) as Role | undefined}
      // A row without an action is no tab stop (react-native-web ignores `focusable`).
      tabIndex={props.onPress || props.onLongPress || role || accessibilityRole ? undefined : -1}
      {...props}
      disabled={!!disabled}
      className={cn(
        'border-border flex-row items-center gap-3 border-b px-3 py-2 min-h-14',
        'active:bg-accent',
        pointer === 'fine' && 'web:hover:bg-accent',
        disabled && 'opacity-45 web:pointer-events-none',
        className,
      )}
    >
      {leading}
      <View className={cn('min-w-0 flex-1', bodyClassName)}>{children}</View>
      {trailing}
    </Pressable>
  );
}

export { ListRow };
export type { ListRowProps };
