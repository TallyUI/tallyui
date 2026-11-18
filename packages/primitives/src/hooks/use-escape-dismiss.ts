import * as React from 'react';
import { Platform } from 'react-native';
import { isTopLayer, pushLayer, removeLayer } from '../layer-stack';

// Web only: while `active`, this content is a layer in layer-stack.ts, and Escape
// on the document closes it when it is the top layer (one Escape, one layer).
// `onEscapeKeyDown` runs first and may call preventDefault() to keep it open.
export function useEscapeDismiss(
  active: boolean,
  close: () => void,
  onEscapeKeyDown?: (event: KeyboardEvent) => void
): void {
  const id = React.useId();
  const closeRef = React.useRef(close);
  const onEscapeKeyDownRef = React.useRef(onEscapeKeyDown);
  closeRef.current = close;
  onEscapeKeyDownRef.current = onEscapeKeyDown;

  React.useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof document === 'undefined') return;
    pushLayer(id);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTopLayer(id)) return;
      onEscapeKeyDownRef.current?.(event);
      if (!event.defaultPrevented) closeRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      removeLayer(id);
    };
  }, [active, id]);
}
