import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AccessibilityInfo, Animated, Text } from 'react-native';
import { CartPanel } from '../cart/cart-panel';
import { EASE, EASE_EXIT } from '../lib/motion';

type Item = { id: string; quantity: number };
type Done = (result: { finished: boolean }) => void;
const fake = (cb?: Done) => { cb?.({ finished: true }); };
let start: (cb?: Done) => void = fake;
const animation = () => ({ start: (cb?: Done) => start(cb), stop() {}, reset() {} }) as unknown as Animated.CompositeAnimation;

function panel(items: Item[], identity = 'order-1', pulseKey: (item: Item) => number = (item) => item.quantity) {
  return <CartPanel items={items} pulseKey={pulseKey} identity={identity}
    renderItem={(item) => <Text>{item.id} x{item.quantity}</Text>} emptyState={<Text>Empty</Text>} />;
}
const called = (config: object) => expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(config));
const notCalled = (config: object) => expect(Animated.timing).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining(config));
// react-native-web keeps a View's onLayout on its node (useElementLayout); jsdom has no ResizeObserver to call it.
function layout(testID: string, height: number) {
  const node = screen.getByTestId(testID) as HTMLElement & { __reactLayoutHandler: (event: unknown) => void };
  act(() => node.__reactLayoutHandler({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height } } }));
}

describe('CartPanel motion', () => {
  beforeEach(() => {
    start = fake;
    vi.spyOn(Animated, 'timing').mockImplementation(animation);
    vi.spyOn(Animated, 'sequence').mockImplementation(animation);
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => vi.restoreAllMocks());

  it('no pulse on the first render', async () => {
    render(panel([{ id: 'a', quantity: 1 }]));
    await act(async () => {});
    notCalled({ toValue: 0.22 });
  });

  it('a new line pulses green: 0.22 over 120ms then 0 over 420ms on the shared ease', async () => {
    const { rerender } = render(panel([{ id: 'a', quantity: 1 }]));
    await act(async () => {});
    rerender(panel([{ id: 'a', quantity: 1 }, { id: 'b', quantity: 1 }]));
    called({ toValue: 0.22, duration: 120, easing: EASE });
    called({ toValue: 0, duration: 420, easing: EASE });
    expect(Animated.sequence).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('cart-row-b-added')).toBeTruthy();
  });

  it('a quantity change pulses the line', async () => {
    const { rerender } = render(panel([{ id: 'a', quantity: 1 }]));
    await act(async () => {});
    rerender(panel([{ id: 'a', quantity: 2 }]));
    called({ toValue: 0.22 });
  });

  it('a removed line tints red over 200ms on the exit ease, collapses, then goes', async () => {
    const { rerender } = render(panel([{ id: 'a', quantity: 1 }, { id: 'b', quantity: 1 }]));
    await act(async () => {});
    layout('cart-row-a', 40);
    const held: Done[] = [];
    start = (cb) => { if (cb) held.push(cb); };
    rerender(panel([{ id: 'b', quantity: 1 }]));
    called({ toValue: 0.3, duration: 200, easing: EASE_EXIT });
    expect(screen.getByTestId('cart-row-a')).toBeTruthy();
    expect(screen.getByText('a x1')).toBeTruthy();
    // The ghost stays where it was, before b.
    expect(screen.getByTestId('cart-row-a').compareDocumentPosition(screen.getByTestId('cart-row-b')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => held.shift()!({ finished: true }));
    called({ toValue: 0, duration: 200, easing: EASE, useNativeDriver: false });
    expect(screen.getByTestId('cart-row-a')).toBeTruthy();
    act(() => held.shift()!({ finished: true }));
    expect(screen.queryByTestId('cart-row-a')).toBeNull();
    expect(screen.getByTestId('cart-row-b')).toBeTruthy();
  });

  it('the last line leaving keeps the empty state back until it has gone', async () => {
    const { rerender } = render(panel([{ id: 'a', quantity: 1 }]));
    await act(async () => {});
    const held: Done[] = [];
    start = (cb) => { if (cb) held.push(cb); };
    rerender(panel([]));
    expect(screen.queryByText('Empty')).toBeNull();
    // No height measured: no collapse, the row goes once the tint lands.
    act(() => held.shift()!({ finished: true }));
    expect(screen.queryByTestId('cart-row-a')).toBeNull();
    expect(screen.getByText('Empty')).toBeTruthy();
  });

  it('under reduced motion nothing animates and a removed line goes at once', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { rerender } = render(panel([{ id: 'a', quantity: 1 }, { id: 'b', quantity: 1 }]));
    await act(async () => {});
    rerender(panel([{ id: 'a', quantity: 1 }, { id: 'b', quantity: 1 }, { id: 'c', quantity: 1 }]));
    rerender(panel([{ id: 'a', quantity: 2 }, { id: 'b', quantity: 1 }, { id: 'c', quantity: 1 }]));
    rerender(panel([{ id: 'a', quantity: 2 }, { id: 'c', quantity: 1 }]));
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(screen.queryByTestId('cart-row-b')).toBeNull();
  });

  it('while reduced motion is not known yet a removed line goes at once', () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(new Promise<boolean>(() => {}));
    const { rerender } = render(panel([{ id: 'a', quantity: 1 }, { id: 'b', quantity: 1 }]));
    rerender(panel([{ id: 'a', quantity: 1 }]));
    expect(screen.queryByTestId('cart-row-b')).toBeNull();
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it('switching orders does not pulse', async () => {
    const { rerender } = render(panel([{ id: 'a', quantity: 1 }], 'order-1'));
    await act(async () => {});
    rerender(panel([{ id: 'x', quantity: 1 }, { id: 'y', quantity: 3 }], 'order-2'));
    notCalled({ toValue: 0.22 });
    notCalled({ toValue: 0.3 });
    expect(screen.queryByTestId('cart-row-a')).toBeNull();
  });

  it('an order that was empty pulses its first lines', async () => {
    const { rerender } = render(panel([], 'order-1'));
    await act(async () => {});
    rerender(panel([{ id: 'x', quantity: 1 }], 'order-2'));
    called({ toValue: 0.22 });
  });

  it('a constant pulseKey pulses only new rows', async () => {
    const { rerender } = render(panel([{ id: 'a', quantity: 1 }], 'order-1', () => 0));
    await act(async () => {});
    rerender(panel([{ id: 'a', quantity: 2 }], 'order-1', () => 0));
    notCalled({ toValue: 0.22 });
    rerender(panel([{ id: 'a', quantity: 2 }, { id: 'b', quantity: 1 }], 'order-1', () => 0));
    called({ toValue: 0.22 });
  });
});
