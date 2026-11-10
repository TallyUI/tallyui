// Port of WCPOS v2 `apps/main/app/(app)/(drawer)/_layout.tsx` (the permanent rail on wide, the front
// drawer on phones) and the layout boundary of `packages/components/src/lib/device.ts`, MIT, WCPOS.
import * as React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { cn } from '@tallyui/theme';
import type { ShellNavItem } from './nav-item';
import { NavDrawer } from './nav-drawer';
import { NavRail } from './nav-rail';
import { ShellContext, type ShellState } from './shell-context';

/**
 * v2's one layout boundary (owner, 2026-10-02): a window at least 768 wide AND 480 tall gets the
 * rail; anything smaller, a phone on its side included (844 x 390), gets the drawer. There is no
 * layout in between.
 */
const WIDE_MIN_WIDTH = 768;
const WIDE_MIN_HEIGHT = 480;

export interface AppShellProps {
  navItems: ShellNavItem[];
  activeId?: string;
  /** Routing is the app's: it maps the pressed item's id to its own route. */
  onNavigate: (id: string) => void;
  /** Drawn above the page (a `RegisterBar`); its menu button opens the drawer on phones. */
  registerBar?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  testID?: string;
}

/** The POS frame: the nav rail beside the page on wide windows, a slide-over drawer on phones. */
export function AppShell({
  navItems,
  activeId,
  onNavigate,
  registerBar,
  children,
  className,
  testID = 'app-shell',
}: AppShellProps) {
  const { width, height } = useWindowDimensions();
  const phone = width < WIDE_MIN_WIDTH || height < WIDE_MIN_HEIGHT;
  const [menuOpen, setMenuOpen] = React.useState(false);
  // Widening past the boundary swaps the drawer for the rail; it must not reopen on the next shrink.
  if (!phone && menuOpen) setMenuOpen(false);
  const openMenu = React.useCallback(() => setMenuOpen(true), []);
  const shell = React.useMemo<ShellState>(() => ({ phone, openMenu: phone ? openMenu : undefined }), [phone, openMenu]);
  const page = (
    <View className="min-w-0 flex-1">
      {registerBar}
      <View className="flex-1">{children}</View>
    </View>
  );
  return (
    <ShellContext.Provider value={shell}>
      <View testID={testID} className={cn('flex-1 bg-background', !phone && 'flex-row', className)}>
        {!phone && <NavRail items={navItems} activeId={activeId} onNavigate={onNavigate} />}
        {page}
        {phone && (
          <NavDrawer
            open={menuOpen}
            onOpenChange={setMenuOpen}
            items={navItems}
            activeId={activeId}
            onNavigate={onNavigate}
          />
        )}
      </View>
    </ShellContext.Provider>
  );
}
