import { useState, useCallback, useEffect, useRef } from 'react';
import type { PresenceState } from './types';

/**
 * Manages presence state for animated mount/unmount transitions.
 *
 * When `present` changes from true to false, `isPresent` stays true
 * for `exitDuration` ms to allow exit animations to complete.
 */
function usePresence(present: boolean, exitDuration = 150): PresenceState {
  const [isPresent, setIsPresent] = useState(present);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeRef = useRef<any>(null);

  const ref = useCallback((node: any) => {
    nodeRef.current = node;
  }, []);

  useEffect(() => {
    if (present) {
      // Entering: immediately mount
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsPresent(true);
    } else {
      // Exiting: delay unmount for exit animation
      timerRef.current = setTimeout(() => {
        setIsPresent(false);
      }, exitDuration);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [present, exitDuration]);

  return { isPresent, ref };
}

export { usePresence };
