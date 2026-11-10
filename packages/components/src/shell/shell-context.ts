import * as React from 'react';

/**
 * What a bar inside the shell reads: v2's `useBarMenu` (`packages/core/src/screens/main/components/
 * bar-controls/index.tsx`, MIT, WCPOS) gives the menu only below the wide boundary, where there is
 * a drawer to open; on wide the rail is always on screen.
 */
export interface ShellState {
  phone: boolean;
  openMenu?: () => void;
}

export const ShellContext = React.createContext<ShellState | null>(null);

/** The enclosing `AppShell`'s state, or `null` outside one. */
export function useShell(): ShellState | null {
  return React.useContext(ShellContext);
}
