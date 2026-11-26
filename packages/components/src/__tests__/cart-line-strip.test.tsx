import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccessibilityInfo, Animated, PanResponder, Text, View, type GestureResponderEvent,
  type PanResponderCallbacks, type PanResponderGestureState } from 'react-native';
import { CartLineStrip } from '../cart/cart-line-strip';
import { releaseOutcome } from '../cart/line-strip-geometry';
import { ARM, EASE_EXIT, PANEL_SLIDE_OUT, PEEK } from '../lib/motion';

type Done = (result: { finished: boolean }) => void;
const fake = (cb?: Done) => { cb?.({ finished: true }); };
let start: (cb?: Done) => void = fake;
let held: Done[] = [];
const animation = () => ({ start: (cb?: Done) => start(cb), stop() {}, reset() {} }) as unknown as Animated.CompositeAnimation;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
// react-native-web's useHover listens for pointerenter and pointerleave on the Pressable's node (modules/useHover/index.js).
const hover = (on: boolean) => fireEvent[on ? 'pointerEnter' : 'pointerLeave'](screen.getByTestId('cart-line-total'), { pointerType: 'mouse' });
const peeked = () => vi.mocked(Animated.spring).mock.calls.filter(([, config]) => config.toValue === -PEEK).length;
const springs = (config: object) => expect(Animated.spring).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining(config));

async function strip(onEdit = vi.fn(), onRemove = vi.fn(), rowWidth?: number) {
  render(<CartLineStrip name="Bag" onEdit={onEdit} onRemove={onRemove}>
    {(wrapTotal) => <View>{wrapTotal(<Text>€1.20</Text>)}</View>}</CartLineStrip>);
  await act(async () => {});
  // react-native-web keeps a View's onLayout on its node (useElementLayout); jsdom has no ResizeObserver to call it.
  const node = screen.getByTestId('cart-line-strip-actions') as HTMLElement & { __reactLayoutHandler: (event: unknown) => void };
  act(() => node.__reactLayoutHandler({ nativeEvent: { layout: { x: 0, y: 0, width: 160, height: 44 } } }));
  if (rowWidth !== undefined) {
    const row = screen.getByTestId('cart-line-row') as HTMLElement & { __reactLayoutHandler: (event: unknown) => void };
    act(() => row.__reactLayoutHandler({ nativeEvent: { layout: { x: 0, y: 0, width: rowWidth, height: 44 } } }));
  }
  return { onEdit, onRemove };
}

// The config CartLineStrip handed PanResponder.create, so a test can drive the row's drag directly.
let pan: PanResponderCallbacks;
const capturePan = () => {
  const real = PanResponder.create.bind(PanResponder);
  vi.spyOn(PanResponder, 'create').mockImplementation((config) => { pan = config; return real(config); });
};
const gesture = (dx: number, dy = 0, vx = 0) => ({ dx, dy, vx, vy: 0, stateID: 0, moveX: 0, moveY: 0, x0: 0, y0: 0,
  numberActiveTouches: 1, _accountsForMovesUpTo: 0 }) as PanResponderGestureState;
const event = {} as GestureResponderEvent;
/** Grant, move to `dx`, then release with `vx` (px/ms, as PanResponder reports it). */
const drag = (dx: number, vx = 0) => act(() => {
  pan.onPanResponderGrant!(event, gesture(0));
  pan.onPanResponderMove!(event, gesture(dx));
  pan.onPanResponderRelease!(event, gesture(dx, 0, vx));
});
const translate = () => (screen.getByTestId('cart-line-row').children[1] as HTMLElement).style.transform;

describe('releaseOutcome', () => {
  const at = (revealed: number, velocityX = 0, rowWidth = 400) => releaseOutcome({ revealed, velocityX, rowWidth, stripWidth: 160 });
  it('G1: short of half the strip goes home', () => expect(at(79)).toBe('home'));
  it('G2: past half the strip opens', () => expect(at(81)).toBe('open'));
  it('G3: just short of the remove point opens', () => expect(at(239)).toBe('open'));
  it('G4: at the remove point removes', () => expect(at(240)).toBe('remove'));
  it('G5: a fast flick past the open strip removes', () => expect(at(161, -800)).toBe('remove'));
  it('G6: a fast flick not past the open strip opens', () => expect(at(160, -800)).toBe('open'));
  it('G7: on a narrow row the band floor wins over 60 %', () => {
    expect(at(215, 0, 200)).toBe('open');
    expect(at(216, 0, 200)).toBe('remove');
  });
});

describe('CartLineStrip', () => {
  beforeEach(() => {
    start = fake;
    held = [];
    vi.spyOn(Animated, 'spring').mockImplementation(animation);
    vi.spyOn(Animated, 'timing').mockImplementation(animation);
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('the Total opens the strip onto Edit and Remove, Remove removes, and the removed row takes no more presses', async () => {
    const { onRemove } = await strip();
    expect(screen.queryByRole('button', { name: 'Remove Bag' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Bag' })).toBeNull();
    click('Edit total of Bag');
    springs({ toValue: -160, overshootClamping: true });
    expect(screen.getByRole('button', { name: 'Remove Bag' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Bag' })).toBeTruthy();
    click('Remove Bag');
    expect(onRemove).toHaveBeenCalledTimes(1);
    const count = vi.mocked(Animated.spring).mock.calls.length;
    click('Edit total of Bag');
    expect(Animated.spring).toHaveBeenCalledTimes(count);
  });

  it('Edit calls onEdit and closes the strip', async () => {
    const { onEdit } = await strip();
    click('Edit total of Bag');
    click('Edit Bag');
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Remove Bag' })).toBeNull();
  });

  it('with reduced motion, opening sets the offset without a spring', async () => {
    vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    await strip();
    click('Edit total of Bag');
    expect(screen.getByRole('button', { name: 'Remove Bag' })).toBeTruthy();
    expect(Animated.spring).not.toHaveBeenCalled();
  });

  it('an unmeasured row removes at once', async () => {
    const { onRemove } = await strip();
    click('Edit total of Bag');
    click('Remove Bag');
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it('reduced motion removes a measured row at once', async () => {
    vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const { onRemove } = await strip(undefined, undefined, 300);
    click('Edit total of Bag');
    click('Remove Bag');
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it('unknown motion removes a measured row at once', async () => {
    vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValue(new Promise<boolean>(() => {}));
    const { onRemove } = await strip(undefined, undefined, 300);
    click('Edit total of Bag');
    click('Remove Bag');
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it('the row flies, then removes', async () => {
    const { onRemove } = await strip(undefined, undefined, 300);
    start = (cb) => { if (cb) held.push(cb); };
    click('Edit total of Bag');
    click('Remove Bag');
    expect(Animated.timing).toHaveBeenCalledTimes(1);
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      toValue: -300, duration: PANEL_SLIDE_OUT, delay: ARM, easing: EASE_EXIT,
    }));
    expect(onRemove).not.toHaveBeenCalled();
    act(() => held.shift()!({ finished: true }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('a double press during the flight removes once', async () => {
    const { onRemove } = await strip(undefined, undefined, 300);
    start = (cb) => { if (cb) held.push(cb); };
    click('Edit total of Bag');
    click('Remove Bag');
    click('Remove Bag');
    expect(Animated.timing).toHaveBeenCalledTimes(1);
    act(() => held.shift()!({ finished: true }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('a double press with reduced motion removes once', async () => {
    vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const { onRemove } = await strip(undefined, undefined, 300);
    click('Edit total of Bag');
    click('Remove Bag');
    click('Remove Bag');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('an interrupted flight brings the row home and does not remove', async () => {
    const { onRemove } = await strip(undefined, undefined, 300);
    start = (cb) => { if (cb) held.push(cb); };
    click('Edit total of Bag');
    click('Remove Bag');
    act(() => held.shift()!({ finished: false }));
    expect(onRemove).not.toHaveBeenCalled();
    springs({ toValue: 0 });
    click('Edit total of Bag');
    click('Remove Bag');
    expect(Animated.timing).toHaveBeenCalledTimes(2);
  });

  it('a refused removal brings the row home', async () => {
    const { onRemove } = await strip(undefined, vi.fn(() => 'Held'), 300);
    start = (cb) => { if (cb) held.push(cb); };
    click('Edit total of Bag');
    click('Remove Bag');
    act(() => held.shift()!({ finished: true }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    springs({ toValue: 0 });
    click('Edit total of Bag');
    click('Remove Bag');
    expect(Animated.timing).toHaveBeenCalledTimes(2);
  });

  it('during the flight, the Total and Edit do nothing', async () => {
    const { onEdit } = await strip(undefined, undefined, 300);
    start = (cb) => { if (cb) held.push(cb); };
    click('Edit total of Bag');
    click('Remove Bag');
    const count = vi.mocked(Animated.spring).mock.calls.length;
    click('Edit total of Bag');
    expect(Animated.spring).toHaveBeenCalledTimes(count);
    click('Edit Bag');
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('H1: hovering the Total peeks the row, and hovering out brings it back', async () => {
    await strip();
    hover(true);
    springs({ toValue: -PEEK });
    hover(false);
    springs({ toValue: 0 });
  });

  it('H2: with reduced motion, hover springs nothing and the row stays at rest', async () => {
    vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    await strip();
    hover(true);
    hover(false);
    expect(Animated.spring).not.toHaveBeenCalled();
    // The row's second child is the body that slides (react-native-web writes { translateX: 0 } as translateX(0px), StyleSheet/preprocess.js).
    expect((screen.getByTestId('cart-line-row').children[1] as HTMLElement).style.transform).toBe('translateX(0px)');
  });

  it('H3: an open strip does not peek, and hovering out does not close it', async () => {
    await strip();
    click('Edit total of Bag');
    hover(true);
    expect(peeked()).toBe(0);
    hover(false);
    springs({ toValue: -160 });
    expect(screen.getByRole('button', { name: 'Remove Bag' })).toBeTruthy();
  });

  it('H4: a leaving row ignores hover', async () => {
    await strip(undefined, undefined, 300);
    start = (cb) => { if (cb) held.push(cb); };
    click('Edit total of Bag');
    click('Remove Bag');
    const count = vi.mocked(Animated.spring).mock.calls.length;
    hover(true);
    hover(false);
    expect(Animated.spring).toHaveBeenCalledTimes(count);
  });

  it('the row claims only a horizontal move, and only once it is measured', async () => {
    capturePan();
    await strip();
    expect(pan.onMoveShouldSetPanResponder!(event, gesture(-20, 2))).toBe(false);
    const row = screen.getByTestId('cart-line-row') as HTMLElement & { __reactLayoutHandler: (event: unknown) => void };
    act(() => row.__reactLayoutHandler({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 44 } } }));
    expect(pan.onMoveShouldSetPanResponder!(event, gesture(4, 0))).toBe(false);
    expect(pan.onMoveShouldSetPanResponder!(event, gesture(-20, -30))).toBe(false);
    expect(pan.onMoveShouldSetPanResponder!(event, gesture(-20, 2))).toBe(true);
    expect(pan.onStartShouldSetPanResponder).toBeUndefined();
    expect(pan.onStartShouldSetPanResponderCapture).toBeUndefined();
    expect(pan.onMoveShouldSetPanResponderCapture).toBeUndefined();
  });

  it('D1: a drag past half the strip opens it', async () => {
    capturePan();
    const { onRemove } = await strip(undefined, undefined, 400);
    drag(-100);
    springs({ toValue: -160 });
    expect(screen.getByRole('button', { name: 'Remove Bag' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Bag' })).toBeTruthy();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('D2: a drag short of half the strip goes home', async () => {
    capturePan();
    const { onRemove } = await strip(undefined, undefined, 400);
    drag(-60);
    springs({ toValue: 0 });
    expect(screen.queryByRole('button', { name: 'Remove Bag' })).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('D3: a drag past the remove point flies the row off, then removes', async () => {
    capturePan();
    const { onRemove } = await strip(undefined, undefined, 400);
    start = (cb) => { if (cb) held.push(cb); };
    drag(-250);
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: -400 }));
    expect(onRemove).not.toHaveBeenCalled();
    act(() => held.shift()!({ finished: true }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('D4: a fast flick past the open strip removes', async () => {
    capturePan();
    const { onRemove } = await strip(undefined, undefined, 400);
    drag(-170, -0.9);
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: -400 }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('D5: dragging an open strip back past half closes it', async () => {
    capturePan();
    await strip(undefined, undefined, 400);
    click('Edit total of Bag');
    drag(100);
    springs({ toValue: 0 });
    expect(screen.queryByRole('button', { name: 'Remove Bag' })).toBeNull();
  });

  it('D6: a rightwards drag never moves the row right of rest', async () => {
    capturePan();
    await strip(undefined, undefined, 400);
    drag(-60);
    // The spring mock's first argument is the row's offset; the body's interpolation alone would hide a positive one.
    const offset = vi.mocked(Animated.spring).mock.calls.at(-1)![0] as Animated.Value & { __getValue: () => number };
    act(() => {
      pan.onPanResponderGrant!(event, gesture(0));
      pan.onPanResponderMove!(event, gesture(50));
    });
    expect(offset.__getValue()).toBe(0);
    expect(translate()).toBe('translateX(0px)');
  });

  it('D7: with reduced motion, the drag still follows and the release snaps', async () => {
    vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    capturePan();
    const { onRemove } = await strip(undefined, undefined, 400);
    drag(-100);
    expect(screen.getByRole('button', { name: 'Remove Bag' })).toBeTruthy();
    expect(translate()).toBe('translateX(-160px)');
    click('Edit total of Bag');
    expect(screen.queryByRole('button', { name: 'Remove Bag' })).toBeNull();
    drag(-250);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(Animated.spring).not.toHaveBeenCalled();
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it('D8: a terminated drag settles back and does not remove', async () => {
    capturePan();
    const { onRemove } = await strip(undefined, undefined, 400);
    act(() => {
      pan.onPanResponderGrant!(event, gesture(0));
      pan.onPanResponderMove!(event, gesture(-100));
      pan.onPanResponderTerminate!(event, gesture(-100));
    });
    springs({ toValue: 0 });
    expect(onRemove).not.toHaveBeenCalled();
  });
});
