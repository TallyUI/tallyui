import { useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { Animated, Platform, View } from 'react-native';
import { EASE, EASE_EXIT, PANEL_SLIDE_OUT } from '../lib/motion';
import { useReducedMotion } from '../lib/use-reduced-motion';

/**
 * A cart row's add and remove feedback: a tint laid over the row, of which only the opacity animates.
 * An add lights green and settles back; a removal tints red, then the row's height closes to nothing.
 *
 * Ported from WCPOS v2 `PulseTableRow`, packages/components/src/table/pulse-row.tsx (MIT, WCPOS):
 * timings 58-67, pulseAdd 161-179, pulseRemove 187-221, onLayout 237-243, overlays 247-254.
 */
export function CartRowMotion({ beat, leaving, onLeft, still, testID, children }: {
  beat: number;
  leaving: boolean;
  onLeft: () => void;
  /** Reduced motion, or not known yet: nothing animates. */
  still: boolean;
  testID?: string;
  children: ReactNode;
}): JSX.Element {
  const added = useRef(new Animated.Value(0)).current;
  const removed = useRef(new Animated.Value(0)).current;
  const height = useRef(new Animated.Value(0)).current;
  const measured = useRef(0);
  const [closing, setClosing] = useState(false);
  const left = useRef(onLeft);
  left.current = onLeft;
  const useNativeDriver = Platform.OS !== 'web';
  useLayoutEffect(() => {
    if (beat === 0 || still) return;
    Animated.sequence([
      Animated.timing(added, { toValue: 0.22, duration: 120, easing: EASE, useNativeDriver }),
      Animated.timing(added, { toValue: 0, duration: 420, easing: EASE, useNativeDriver }),
    ]).start();
  }, [beat, still, added, useNativeDriver]);
  useEffect(() => {
    if (!leaving) return;
    Animated.timing(removed, { toValue: 0.3, duration: PANEL_SLIDE_OUT, easing: EASE_EXIT, useNativeDriver }).start(({ finished }) => {
      if (!finished) return;
      if (measured.current <= 0) return left.current();
      height.setValue(measured.current);
      setClosing(true);
      Animated.timing(height, { toValue: 0, duration: PANEL_SLIDE_OUT, easing: EASE, useNativeDriver: false })
        .start((end) => end.finished && left.current());
    });
    // A row that came back before it left gets its own height and no red.
    return () => {
      removed.stopAnimation();
      height.stopAnimation();
      removed.setValue(0);
      setClosing(false);
    };
  }, [leaving, removed, height, useNativeDriver]);
  return (
    <Animated.View testID={testID} style={closing ? { height, overflow: 'hidden' } : undefined}
      onLayout={(event) => { if (!leaving) measured.current = event.nativeEvent.layout.height; }}>
      {children}
      <Animated.View pointerEvents="none" aria-hidden testID={testID && `${testID}-added`}
        className="absolute inset-0 bg-success" style={{ opacity: added }} />
      <Animated.View pointerEvents="none" aria-hidden testID={testID && `${testID}-removed`}
        className="absolute inset-0 bg-destructive" style={{ opacity: removed }} />
    </Animated.View>
  );
}

interface Row { key: string; pulse: string | number; beat: number; leaving: boolean }

function same(a: Row[], b: Row[]): boolean {
  return a.length === b.length && a.every((row, i) =>
    row.key === b[i].key && row.pulse === b[i].pulse && row.beat === b[i].beat && row.leaving === b[i].leaving);
}

/**
 * Rows that pulse when they arrive or their `pulseKey` changes, and leave as a tinted, collapsing ghost.
 * A change of `identity` (another order) rebaselines without a pulse, unless the list it replaces was empty.
 * WCPOS v2 packages/core/src/screens/main/pos/hooks/utils.ts:61-77 and cart/table.tsx:221-265.
 */
export function MotionRows<T>({ items, keyOf, pulseKey, identity, renderItem, empty = null }: {
  items: T[];
  keyOf: (item: T, index: number) => string;
  pulseKey: (item: T) => string | number;
  identity?: string;
  renderItem: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
}): JSX.Element {
  const still = useReducedMotion() !== false;
  const current = items.map((item, index) => ({ item, index, key: keyOf(item, index), pulse: pulseKey(item) }));
  const [seen, setSeen] = useState(() => ({ identity, rows: current.map(({ key, pulse }): Row => ({ key, pulse, beat: 0, leaving: false })) }));
  const nodes = useRef(new Map<string, ReactNode>());
  let rows: Row[];
  if (seen.identity !== identity) {
    const fresh = !seen.rows.some((row) => !row.leaving);
    rows = current.map(({ key, pulse }) => ({ key, pulse, beat: fresh ? 1 : 0, leaving: false }));
  } else {
    const before = new Map(seen.rows.map((row) => [row.key, row]));
    rows = current.map(({ key, pulse }) => {
      const was = before.get(key);
      const beat = !was ? 1 : was.leaving || was.pulse !== pulse ? was.beat + 1 : was.beat;
      return { key, pulse, beat, leaving: false };
    });
    const kept = new Set(rows.map((row) => row.key));
    if (!still) {
      seen.rows.forEach((row, i) => {
        if (kept.has(row.key)) return;
        // The ghost stays where it was: right after the row that preceded it, or first.
        rows.splice(i === 0 ? 0 : rows.findIndex((other) => other.key === seen.rows[i - 1].key) + 1, 0, { ...row, leaving: true });
      });
    }
  }
  if (seen.identity !== identity || !same(seen.rows, rows)) setSeen({ identity, rows });
  const rendered = new Map(current.map(({ item, index, key }) => [key, renderItem(item, index)]));
  useLayoutEffect(() => {
    for (const [key, node] of rendered) nodes.current.set(key, node);
    for (const key of nodes.current.keys()) if (!rendered.has(key) && !rows.some((row) => row.key === key)) nodes.current.delete(key);
  });
  if (!rows.length) return <>{empty}</>;
  return <>{rows.map((row) => (
    <CartRowMotion key={row.key} testID={`cart-row-${row.key}`} beat={row.beat} leaving={row.leaving} still={still}
      onLeft={() => setSeen((s) => ({ ...s, rows: s.rows.filter((other) => other.key !== row.key || !other.leaving) }))}>
      {row.leaving
        ? <View pointerEvents="none" aria-hidden>{nodes.current.get(row.key)}</View>
        : rendered.get(row.key)}
    </CartRowMotion>
  ))}</>;
}
