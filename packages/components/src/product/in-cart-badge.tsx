import { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Text } from 'react-native';
import { cn } from '@tallyui/theme';
import { COUNT_FADE, COUNT_SWELL, EASE, useReducedMotion } from '../lib/motion';

export interface InCartBadgeProps {
  /** How many of the product the cart holds (e.g. from `cartQuantities`); nothing renders at 0. */
  count: number;
  /** Placement, e.g. `absolute right-2 top-2` for a tile's top-right corner. */
  className?: string;
  testID?: string;
  identity?: string;
}

/**
 * How many of a product are in the cart: a primary circle with the count, hidden while there are none.
 *
 * Ported from WCPOS v2 `InCartCount`, packages/core/src/screens/main/pos/products/rows/in-cart-count.tsx
 * (MIT, WCPOS), with v2's count beat from packages/components/src/badge/count-beat.tsx.
 */
export function InCartBadge({ count, className, testID, identity = '' }: InCartBadgeProps) {
  const text = count > 0 ? String(count) : null;
  const [seen, setSeen] = useState({ identity, text, value: count, wasText: text, added: false, beat: 0 });
  if (seen.identity !== identity) {
    setSeen({ identity, text, value: count, wasText: text, added: false, beat: 0 });
  } else if (seen.text !== text) {
    setSeen({ identity, text, value: count, wasText: seen.text, added: count > seen.value, beat: seen.beat + 1 });
  } else if (seen.value !== count) {
    setSeen({ ...seen, value: count });
  }
  const pop = useRef(new Animated.Value(1)).current;
  const change = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const { beat, added, wasText, identity: shownIdentity } = seen;
  useLayoutEffect(() => {
    if (beat === 0) {
      pop.setValue(1);
      change.setValue(1);
      return;
    }
    if (text === null) return;
    if (reduced) {
      pop.setValue(1);
      change.setValue(1);
      return;
    }
    const useNativeDriver = Platform.OS !== 'web';
    change.setValue(0);
    Animated.timing(change, { toValue: 1, duration: COUNT_FADE, easing: Easing.linear, useNativeDriver }).start();
    if (added) {
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.3, duration: COUNT_SWELL, easing: EASE, useNativeDriver }),
        Animated.spring(pop, { toValue: 1, stiffness: 380, damping: 11, mass: 0.6, useNativeDriver }),
      ]).start();
    }
  }, [beat, shownIdentity, text, added, reduced, pop, change]);
  const scaleX = pop.interpolate({ inputRange: [1, 2], outputRange: [1, 1.55], extrapolate: 'extend' });
  if (count <= 0) return null;
  return (
    <Animated.View testID={testID} accessibilityLabel={`${count} in cart`} style={{ transform: [{ scaleX }, { scaleY: pop }] }}
      className={cn('h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5', className)}>
      {!reduced && wasText !== null && wasText !== text ? (
        <Animated.View testID={testID ? `${testID}-was` : undefined} aria-hidden className="absolute inset-0 items-center justify-center"
          style={{ opacity: change.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' }) }}>
          <Text className="text-xs font-semibold tabular-nums text-primary-foreground">{wasText}</Text>
        </Animated.View>
      ) : null}
      <Animated.View style={{ opacity: change.interpolate({ inputRange: [0.3, 0.8], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ scale: pop.interpolate({ inputRange: [1, 2], outputRange: [1, 2.2], extrapolate: 'extend' }) }] }}>
        <Text className="text-xs font-semibold tabular-nums text-primary-foreground">{text}</Text>
      </Animated.View>
    </Animated.View>
  );
}
