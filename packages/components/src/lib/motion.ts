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
export const PLUS_WIDTH = 48; // WCPOS v2 packages/core/src/screens/main/pos/cart/tab-window.ts:3.
export const NEW_TAB_WIDTH = 112; // WCPOS v2 packages/core/src/screens/main/pos/cart/tab-window.ts:5: the + cell unfolded into "+ New".
// WCPOS v2 packages/core/src/screens/main/pos/cart/cells/line-strip.tsx:49 (PEEK): how far a hovered row's Total peeks.
export const PEEK = 16;
// WCPOS v2 packages/core/src/screens/main/pos/cart/cells/line-strip.tsx:54 (PEEK_SPRING): the peek's underdamped bounce.
export const PEEK_SPRING = { mass: 1, stiffness: 380, damping: 12 };
// WCPOS v2 packages/components/src/lib/motion.ts:16.
export const BEAT = 220;
// WCPOS v2 packages/components/src/lib/motion.ts:19.
export const PANE = 280;
// WCPOS v2 packages/components/src/lib/motion.ts:30.
export const EASE_BEAT = Easing.bezier(0.2, 0.9, 0.3, 1.1);
// WCPOS v2 packages/components/src/lib/motion.ts:245-253 (BEATS.oldTiles): tiles leaving, 10ms apart, eight at most.
export const OLD_TILES = { duration: 140, step: 10, cap: 8 };
// WCPOS v2 packages/components/src/lib/motion.ts:255-263 (BEATS.newTiles): tiles landing, 22ms apart, eight at most.
export const NEW_TILES = { duration: BEAT, step: 22, cap: 8 };
// WCPOS v2 packages/core/src/screens/main/pos/products/deal-stack.tsx:119: a dealt tile is whole by 80% of its travel.
export const FADE_IN_BY = 0.8;
// WCPOS v2 packages/core/src/screens/main/pos/products/deal-stack.tsx:120.
export const SCALE_FROM = 0.92;
// WCPOS v2 packages/core/src/screens/main/pos/products/deal-stack.tsx:123: how long a deal waits for a frame.
export const MEASURE_GRACE = 120;
