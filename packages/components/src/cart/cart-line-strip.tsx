// Ported from WCPOS v2 packages/core/src/screens/main/pos/cart/cells/line-strip.tsx (press to open, Remove flies the row off; the Total peeks on hover; drag to open or fling off by v2's release rule (line-strip.geometry.ts); no remove-point haptic or Edit swallow) and cells/edit-cart-item-button.tsx; MIT, WCPOS.
import { useRef, useState, type JSX, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, Pressable, View } from 'react-native';
import { Button, Text } from '../ui';
import { ARM, EASE_EXIT, PANEL_SLIDE_OUT, PEEK, PEEK_SPRING } from '../lib/motion';
import { useReducedMotion } from '../lib/use-reduced-motion';
import { releaseOutcome } from './line-strip-geometry';
// A release this long after the last move is not a flick: PanResponder's vx is the last move's speed and survives a pause (react-native-web PanResponder index.js:234-235).
const STILL_MS = 50;

/** A cart row with v2's hidden strip under it: pressing the row's Total slides the row left onto a solid Remove, with Edit beside it when `onEdit` is given. */
export function CartLineStrip({ name, onEdit, onRemove, children }: {
  name: string;
  onEdit?: () => void;
  // A returned string is a refusal, and the row comes back.
  onRemove: () => string | null | void;
  children: (wrapTotal: (content: ReactNode) => ReactNode) => ReactNode;
}): JSX.Element {
  const reduced = useReducedMotion() !== false;
  const offset = useRef(new Animated.Value(0)).current;
  // The row is flying off or its removal is committing: nothing else may move it.
  const leaving = useRef(false);
  const [open, setOpen] = useState(false);
  // `open` at event time: react-native-web binds a Pressable's hover-out listener at hover-in and keeps that closure (modules/useHover).
  const opened = useRef(false);
  const [rowWidth, setRowWidth] = useState<number>();
  const [stripWidth, setStripWidth] = useState(0);
  const settle = (next: boolean) => {
    if (leaving.current) return;
    setOpen(next);
    opened.current = next;
    const target = next ? -stripWidth : 0;
    if (reduced) offset.setValue(target);
    else Animated.spring(offset, { toValue: target, overshootClamping: true, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  const commit = () => { if (typeof onRemove() === 'string') { leaving.current = false; settle(false); } };
  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (reduced || !rowWidth) return commit();
    Animated.timing(offset, { toValue: -rowWidth, duration: PANEL_SLIDE_OUT, delay: ARM, easing: EASE_EXIT,
      useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      if (finished) return commit();
      leaving.current = false;
      settle(false);
    });
  };
  // The pan handlers are created once: they read the widths, the drag's base and the latest settle and leave through this ref.
  const drag = useRef({ row: 0, strip: 0, base: 0, claimed: 0, settle, leave });
  Object.assign(drag.current, { row: rowWidth ?? 0, strip: stripWidth, settle, leave });
  const clamp = (x: number) => Math.min(0, Math.max(-drag.current.row, x));
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy }) => !leaving.current && drag.current.row > 0
      && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) && (drag.current.claimed = dx, true),
    onPanResponderGrant: () => {
      const { claimed } = drag.current;
      // PanResponder zeroes dx at grant (react-native Libraries/Interaction/PanResponder.js onResponderGrant; react-native-web vendor PanResponder index.js:330), so the claimed distance joins the base.
      drag.current.base = (opened.current ? -drag.current.strip : 0) + claimed;
      drag.current.claimed = 0;
      // The row's real place: the callback is synchronous on the JS driver (web). On the native driver it can land after the first moves, so a row
      // grabbed mid-spring can jump once by the distance between the spring's target and its real place; the immediate base above is where it starts until then.
      offset.stopAnimation((value) => { drag.current.base = value + claimed; });
    },
    onPanResponderMove: (_, { dx }) => offset.setValue(clamp(drag.current.base + dx)),
    onPanResponderRelease: (event, { dx, vx, _accountsForMovesUpTo }) => {
      drag.current.claimed = 0;
      const { row, strip, base } = drag.current;
      // gestureState.vx is px per ms, dx over DOM timeStamp ms (react-native-web dist/vendor/react-native/PanResponder/index.js:235); v2's rule takes px/s.
      // react-native's GestureResponderEvent type leaves out touchHistory, which PanResponder itself reads (react-native-web PanResponder index.js:306).
      const still = (event as unknown as { touchHistory: { mostRecentTimeStamp: number } }).touchHistory.mostRecentTimeStamp - _accountsForMovesUpTo > STILL_MS;
      const outcome = releaseOutcome({ revealed: -clamp(base + dx), velocityX: still ? 0 : vx * 1000, rowWidth: row, stripWidth: strip });
      if (outcome === 'remove') drag.current.leave();
      else drag.current.settle(outcome === 'open');
    },
    onPanResponderTerminate: () => { drag.current.claimed = 0; drag.current.settle(opened.current); },
  })).current;
  // v2's peek: only a closed, staying row, and only with reduced motion known to be off.
  const peek = (on: boolean) => {
    if (opened.current || leaving.current || reduced) return;
    if (on) Animated.spring(offset, { ...PEEK_SPRING, toValue: -PEEK, useNativeDriver: Platform.OS !== 'web' }).start();
    else settle(false);
  };
  // A peek retargeted mid-close keeps the spring's velocity (SpringAnimation.start), so the bounce could swing past 0 and bare the strip's red at the left: never right of rest.
  const shown = useRef(offset.interpolate({ inputRange: [-1, 0], outputRange: [-1, 0], extrapolateRight: 'clamp' })).current;
  const wrapTotal = (content: ReactNode) => <Pressable testID="cart-line-total" accessibilityRole="button"
    accessibilityLabel={`Edit total of ${name}`} accessibilityState={{ expanded: open }} className="justify-center"
    onPress={() => settle(!open)} onHoverIn={() => peek(true)} onHoverOut={() => peek(false)}>{content}
    {/* v2's HOVER_REACH: past the bounce, so the Total never slides out from under a resting pointer; closed only, or it would take Edit's presses. */}
    {open ? null : <View className="absolute inset-y-0 left-0" style={{ right: -PEEK * 2 }} />}</Pressable>;
  const block = 'h-auto min-w-16 rounded-none px-5';
  return <View testID="cart-line-row" className="relative overflow-hidden" onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
    <View testID="cart-line-strip" className="absolute inset-y-0 right-0 flex-row items-stretch justify-end bg-destructive"
      style={rowWidth === undefined ? undefined : { width: rowWidth }} pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} aria-hidden={!open}>
      <View testID="cart-line-strip-actions" className="flex-row items-stretch" onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}>
        {onEdit ? <Button variant="default" testID="cart-line-edit" accessibilityLabel={`Edit ${name}`} className={block}
          onPress={() => { if (leaving.current) return; settle(false); onEdit(); }}><Text>Edit</Text></Button> : null}
        <Button variant="destructive" testID="cart-line-remove" accessibilityLabel={`Remove ${name}`} className={block}
          onPress={leave}><Text>Remove</Text></Button>
      </View>
    </View>
    <Animated.View {...pan.panHandlers} className="bg-background" style={{ transform: [{ translateX: shown }] }}>{children(wrapTotal)}</Animated.View>
  </View>;
}
