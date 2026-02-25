import * as React from 'react';
import { usePresence } from './use-presence';
import type { PresenceProps } from './types';

/**
 * Manages mount/unmount transitions for children.
 * Keeps children mounted during exit animations.
 */
function Presence({ present, forceMount, children }: PresenceProps) {
  const { isPresent } = usePresence(present);

  const shouldRender = forceMount || isPresent;

  if (!shouldRender) {
    return null;
  }

  if (typeof children === 'function') {
    return <>{children({ present })}</>;
  }

  return <>{children}</>;
}

Presence.displayName = 'AnimatedPresence';

export { Presence };
