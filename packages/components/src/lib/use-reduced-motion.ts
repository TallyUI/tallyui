import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Reads prefers-reduced-motion on web and the OS setting on native; null means not known yet. */
export function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced) as
      { remove(): void } | undefined;
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
  return reduced;
}
