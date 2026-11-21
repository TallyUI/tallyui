import { Easing } from 'react-native';

// WCPOS v2 packages/components/src/lib/motion.ts:6.
export const COUNT_SWELL = 90;
// WCPOS v2 packages/components/src/lib/motion.ts:7.
export const COUNT_FADE = 170;
// WCPOS v2 packages/components/src/lib/motion.ts:12.
export const POPOVER_FADE = 200;
// WCPOS v2 packages/components/src/lib/motion.ts:18.
export const PANEL_SLIDE_OUT = 200;
// WCPOS v2 packages/components/src/lib/motion.ts:33-34.
export const EASE_EXIT = Easing.bezier(0.4, 0, 1, 1);
// WCPOS v2 packages/core/src/screens/main/pos/cart/cells/line-strip.tsx:64-69: a pressed Remove waits this long before the row flies.
export const ARM = 120;
// WCPOS v2 packages/components/src/lib/motion.ts:27.
export const EASE_POINTS = [0.2, 0.7, 0.2, 1] as const;
// WCPOS v2 packages/components/src/lib/motion.ts:28.
export const EASE = Easing.bezier(...EASE_POINTS);
// WCPOS v2 packages/components/src/lib/motion.ts:9.
export const CROSSFADE = 200;
// Reanimated 4.7.1 withTiming's default easing (src/animation/timing.ts:91), which v2's accordion chevron uses.
export const TIMING_EASE = Easing.inOut(Easing.quad);
