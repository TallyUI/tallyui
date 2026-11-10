// Port of WCPOS v2 `packages/core/src/screens/main/components/drawer-content/index.tsx` (the `front`
// presentation) and the drawer options of `apps/main/app/(app)/(drawer)/_layout.tsx`, MIT, WCPOS.
import * as React from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { NavButton, splitGroups, type ShellNavItem } from './nav-item';

/** v2's phone drawer width, a literal there too (`drawerStyle.width: phone ? 200 : railWidth`). */
const DRAWER_WIDTH = 200;
const SLIDE_MS = 200;
const FOCUSABLE = 'button, [href], input, [tabindex]:not([tabindex="-1"])';

export interface NavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ShellNavItem[];
  activeId?: string;
  onNavigate: (id: string) => void;
  /** Drawn above the items (a store name or logo). */
  header?: React.ReactNode;
  testID?: string;
}

/** Keeps Tab inside `panel`, moves focus in on open and hands it back on close (web only). */
function useFocusTrap(panel: React.RefObject<View | null>, active: boolean, onEscape: () => void) {
  const escape = React.useRef(onEscape);
  escape.current = onEscape;
  React.useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = panel.current as unknown as HTMLElement | null;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    focusables()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        escape.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const inside = root?.contains(document.activeElement) ?? false;
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [active, panel]);
}

/**
 * The phone's navigation: a 200-wide panel that slides over the screen from the left, v2's
 * `drawerType: 'front'`, with a backdrop that closes it. Pressing the current page only closes it.
 */
export function NavDrawer({ open, onOpenChange, items, activeId, onNavigate, header, testID = 'nav-drawer' }: NavDrawerProps) {
  const [mounted, setMounted] = React.useState(open);
  const offset = React.useRef(new Animated.Value(open ? 0 : -DRAWER_WIDTH)).current;
  const panel = React.useRef<View>(null);
  if (open && !mounted) setMounted(true);

  React.useEffect(() => {
    if (!mounted) return;
    const animation = Animated.timing(offset, {
      toValue: open ? 0 : -DRAWER_WIDTH,
      duration: SLIDE_MS,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    return () => animation.stop();
  }, [open, mounted, offset]);

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  useFocusTrap(panel, open && mounted, close);

  if (!mounted) return null;
  const [top, bottom] = splitGroups(items);
  const renderItem = (item: ShellNavItem) => (
    <NavButton
      key={item.id}
      item={item}
      labelled
      active={item.id === activeId}
      onPress={() => {
        if (item.id !== activeId) onNavigate(item.id);
        close();
      }}
    />
  );
  return (
    <View testID={testID} className="absolute inset-0 z-50" pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View
        className="absolute inset-0"
        style={{ opacity: offset.interpolate({ inputRange: [-DRAWER_WIDTH, 0], outputRange: [0, 1] }) }}
      >
        <Pressable
          testID={`${testID}-backdrop`}
          accessibilityLabel="Close menu"
          className="flex-1 bg-black/50"
          onPress={close}
        />
      </Animated.View>
      <Animated.View
        ref={panel}
        role="dialog"
        aria-modal
        aria-label="Menu"
        testID={`${testID}-panel`}
        className="absolute bottom-0 left-0 top-0 border-r border-border bg-card shadow-lg"
        style={{ width: DRAWER_WIDTH, transform: [{ translateX: offset }] }}
      >
        {header}
        <View role="navigation" aria-label="Main" className="flex-1 p-2">
          <View>{top.map(renderItem)}</View>
          {bottom.length > 0 && <View className="mt-auto">{bottom.map(renderItem)}</View>}
        </View>
      </Animated.View>
    </View>
  );
}
