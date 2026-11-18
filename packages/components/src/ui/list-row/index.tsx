import * as React from 'react';
import { Pressable, View, type PressableProps, type Role } from 'react-native';
import { cn, POINTER_FLOORS } from '@tallyui/theme';
import { currentRowMark } from '../../lib/current-row';
import { usePointer } from '../../scale/use-pointer';
import { useScale } from '../../scale/scale-provider';

type ListRowSize = 'default' | 'sm';

type ListRowProps = Omit<PressableProps, 'children' | 'role'> & {
  /** Unset, a row with an action is a `button`; one without is no control at all. */
  role?: Role;
  /**
   * Set on a list whose rows can be the current one (open orders, a short choice). `true`
   * paints the row `bg-muted` with the primary bar on its left edge; `false` keeps the bar's
   * room, so the rows' content lines up either way. Unset: a plain list, no bar.
   */
  selected?: boolean;
  /** Before the body: an avatar, a thumb, a check. */
  leading?: React.ReactNode;
  /** After the body: an amount, a badge, a chevron. */
  trailing?: React.ReactNode;
  /** `default` (56) for a two-line data row; `sm` (44) for a one-line row or a dense list. */
  size?: ListRowSize;
  className?: string;
  /** The body column's own layout (a `gap-1` between its lines). */
  bodyClassName?: string;
  children?: React.ReactNode;
};

/** Roles whose `selected` is announced as checked, not selected. */
const CHECKED_ROLES = new Set(['radio', 'checkbox', 'menuitemradio', 'menuitemcheckbox']);

/**
 * WCPOS v2's ListRow: one flush row of a list, a hairline under it, `leading`, body and `trailing`.
 * A later slice adds v2's shared pressable surface.
 * TallyUI difference: `sm` is a `minHeight` style number (the `--spacing-row` token, floored at the pointer
 * floor, as v2's own figure) rather than v2's `min-h-row` class, because `scale.css` is opt-in.
 */
function ListRow({
  role,
  accessibilityRole,
  selected,
  leading,
  trailing,
  size,
  className,
  bodyClassName,
  children,
  disabled,
  style,
  ...props
}: ListRowProps) {
  const pointer = usePointer();
  const row = Math.max(useScale().variables['--spacing-row'], POINTER_FLOORS[pointer]);
  const resolved = role ?? accessibilityRole ?? (props.onPress ? 'button' : undefined);
  const checked = resolved !== undefined && CHECKED_ROLES.has(resolved);
  const rowStyle: PressableProps['style'] =
    size !== 'sm' ? style
    : typeof style === 'function' ? (state) => [{ minHeight: row }, style(state)]
    : [{ minHeight: row }, style];
  return (
    <Pressable
      role={resolved as Role | undefined}
      // A row without an action is no tab stop (react-native-web ignores `focusable`).
      tabIndex={props.onPress || props.onLongPress || role || accessibilityRole ? undefined : -1}
      // React Native maps both onto the state a native screen reader announces.
      aria-selected={checked ? undefined : selected}
      aria-checked={checked ? selected : undefined}
      {...props}
      style={rowStyle}
      disabled={!!disabled}
      className={cn(
        'border-border flex-row items-center gap-3 border-b px-3 py-2',
        size === 'sm' ? undefined : 'min-h-14',
        'active:bg-accent',
        pointer === 'fine' && 'web:hover:bg-accent',
        disabled && 'opacity-45 web:pointer-events-none',
        currentRowMark(selected),
        // The bar's 2 comes out of the row's 12, so the content stays on the same line.
        selected !== undefined && 'pl-2.5',
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
export type { ListRowProps, ListRowSize };
