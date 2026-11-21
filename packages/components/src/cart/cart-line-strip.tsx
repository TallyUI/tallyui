// Ported from WCPOS v2 packages/core/src/screens/main/pos/cart/cells/line-strip.tsx (press to open, Remove flies the row off; no swipe or hover yet) and cells/edit-cart-item-button.tsx; MIT, WCPOS.
import { useRef, useState, type JSX, type ReactNode } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { Button, Text } from '../ui';
import { ARM, EASE_EXIT, PANEL_SLIDE_OUT } from '../lib/motion';
import { useReducedMotion } from '../lib/use-reduced-motion';

/** A cart row with v2's hidden strip under it: pressing the row's Total slides the row left onto a solid Edit and Remove. */
export function CartLineStrip({ name, onEdit, onRemove, children }: {
  name: string;
  onEdit: () => void;
  // A returned string is a refusal, and the row comes back.
  onRemove: () => string | null | void;
  children: (wrapTotal: (content: ReactNode) => ReactNode) => ReactNode;
}): JSX.Element {
  const reduced = useReducedMotion() !== false;
  const offset = useRef(new Animated.Value(0)).current;
  // The row is flying off or its removal is committing: nothing else may move it.
  const leaving = useRef(false);
  const [open, setOpen] = useState(false);
  const [rowWidth, setRowWidth] = useState<number>();
  const [stripWidth, setStripWidth] = useState(0);
  const settle = (next: boolean) => {
    if (leaving.current) return;
    setOpen(next);
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
  const wrapTotal = (content: ReactNode) => <Pressable testID="cart-line-total" accessibilityRole="button"
    accessibilityLabel={`Edit total of ${name}`} accessibilityState={{ expanded: open }} className="justify-center"
    onPress={() => settle(!open)}>{content}</Pressable>;
  const block = 'h-auto min-w-16 rounded-none px-5';
  return <View testID="cart-line-row" className="relative overflow-hidden" onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
    <View testID="cart-line-strip" className="absolute inset-y-0 right-0 flex-row items-stretch justify-end bg-destructive"
      style={rowWidth === undefined ? undefined : { width: rowWidth }} pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} aria-hidden={!open}>
      <View testID="cart-line-strip-actions" className="flex-row items-stretch" onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}>
        <Button variant="default" testID="cart-line-edit" accessibilityLabel={`Edit ${name}`} className={block}
          onPress={() => { if (leaving.current) return; settle(false); onEdit(); }}><Text>Edit</Text></Button>
        <Button variant="destructive" testID="cart-line-remove" accessibilityLabel={`Remove ${name}`} className={block}
          onPress={leave}><Text>Remove</Text></Button>
      </View>
    </View>
    <Animated.View className="bg-background" style={{ transform: [{ translateX: offset }] }}>{children(wrapTotal)}</Animated.View>
  </View>;
}
