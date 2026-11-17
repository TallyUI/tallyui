import { Easing } from 'react-native';

// WCPOS v2 packages/components/src/lib/motion.ts:6.
export const COUNT_SWELL = 90;
// WCPOS v2 packages/components/src/lib/motion.ts:7.
export const COUNT_FADE = 170;
// WCPOS v2 packages/components/src/lib/motion.ts:27.
export const EASE_POINTS = [0.2, 0.7, 0.2, 1] as const;
// WCPOS v2 packages/components/src/lib/motion.ts:28.
export const EASE = Easing.bezier(...EASE_POINTS);
