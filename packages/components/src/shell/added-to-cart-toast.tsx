// Port of WCPOS v2's added-to-cart toast (MIT, WCPOS): packages/core/src/screens/main/pos/hooks/added-to-cart-toast.ts,
// with the top-centre placement of apps/main/app/_layout.tsx:84. It is one toast that updates in place and never
// stacks: in v2 #2370 a stack of add toasts covered the top product row and took the cashier's taps.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { Toast, ToastClose, ToastTitle } from '../ui/toast';

// v2's ADDED_TO_CART_DURATION; each add restarts it.
const VISIBLE_MS = 4_000;

export interface AddedToCartEvent {
  /** A new value for each add, e.g. a counter; the same key twice is one add. */
  key: number | string;
  /** The product's name; the first add names it. */
  name?: string;
}

export interface AddedToCartToastProps {
  /** The latest add, or null before any. The app sets it where it adds a line, unless the add is silent. */
  added: AddedToCartEvent | null;
  testID?: string;
}

export function AddedToCartToast({ added, testID = 'added-to-cart-toast' }: AddedToCartToastProps) {
  const lastKey = useRef(added?.key);
  const [toast, setToast] = useState<{ shown: boolean; count: number; name?: string }>({ shown: false, count: 0 });

  useEffect(() => {
    if (added == null || added.key === lastKey.current) return;
    lastKey.current = added.key;
    setToast((prev) => ({ shown: true, count: prev.count + 1, name: prev.count === 0 ? added.name : prev.name }));
  }, [added]);

  useEffect(() => {
    if (!toast.shown) return;
    const timer = setTimeout(() => setToast({ shown: false, count: 0 }), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // The count line only shows from 2, so a single add never reads "1 item".
  const title = !toast.shown ? null
    : toast.count > 1 ? `${toast.count} items added to cart`
    : toast.name ? `${toast.name} added to cart` : 'Added to cart';

  useEffect(() => {
    if (title !== null && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(title);
  }, [title]);

  if (title === null) return null;
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-4 z-50 items-center px-4">
      <Toast testID={testID} accessibilityLiveRegion="polite" className="max-w-sm border-success">
        <View aria-hidden className="absolute inset-0 bg-success/15" />
        <View className="flex-1 gap-1">
          <ToastTitle>{title}</ToastTitle>
        </View>
        <ToastClose accessibilityLabel="Close" onPress={() => setToast({ shown: false, count: 0 })} />
      </Toast>
    </View>
  );
}
