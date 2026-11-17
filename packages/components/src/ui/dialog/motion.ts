import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { useReducedMotion } from '../../lib/use-reduced-motion';

// WCPOS v2 packages/components/src/lib/motion.ts:27.
export const EASE = Easing.bezier(0.2, 0.7, 0.2, 1);
// WCPOS v2 packages/components/src/lib/motion.ts:33.
export const EASE_EXIT = Easing.bezier(0.4, 0, 1, 1);
export type OverlayMotion = {
  enterMs: number; exitMs: number; scrimInMs: number; scrimOutMs: number; exitEasing: (value: number) => number;
};
// WCPOS v2 apps/main/global.css:174-181.
export const SHEET_MOTION: OverlayMotion = { enterMs: 250, exitMs: 200, scrimInMs: 150, scrimOutMs: 200, exitEasing: EASE_EXIT };
// WCPOS v2 apps/main/global.css:174-177.
export const DIALOG_MOTION: OverlayMotion = { enterMs: 150, exitMs: 150, scrimInMs: 150, scrimOutMs: 200, exitEasing: EASE };

export function useOverlayMotion(open: boolean, enabled: boolean, motion: OverlayMotion): {
  mounted: boolean; scrim: Animated.Value; panel: Animated.Value;
} {
  const scrim = useRef(new Animated.Value(0)).current;
  const panel = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);
  const reduced = useReducedMotion();
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (!enabled || reduced === null) return;
    if (reduced) {
      scrim.setValue(open ? 1 : 0);
      panel.setValue(open ? 1 : 0);
      return;
    }
    if (!mounted) return;
    const animation = Animated.parallel([
      Animated.timing(scrim, {
        toValue: open ? 1 : 0,
        duration: open ? motion.scrimInMs : motion.scrimOutMs,
        easing: EASE,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(panel, {
        toValue: open ? 1 : 0,
        duration: open ? motion.enterMs : motion.exitMs,
        easing: open ? EASE : motion.exitEasing,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    return () => animation.stop();
  }, [open, mounted, reduced, enabled, scrim, panel, motion]);

  return { mounted: enabled && reduced === false ? mounted || open : open, scrim, panel };
}
