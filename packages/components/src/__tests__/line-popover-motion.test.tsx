import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccessibilityInfo, Animated } from 'react-native';
import { PortalHost } from '@tallyui/primitives';
import { LinePopover } from '../sale/line-popover';
import { EASE } from '../ui/dialog/motion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openQuantity(reduced = false) {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);
  vi.spyOn(Animated, 'timing');
  const onApply = vi.fn(() => null);
  await act(async () => {
    render(<><LinePopover kind="quantity" lineName="Shirt" currency="EUR" value={1} onApply={onApply} /><PortalHost /></>);
  });
  fireEvent.click(screen.getByTestId('quantity-popover-trigger'));
  return onApply;
}

it('F1: opens with a 200ms fade on v2 ease', async () => {
  await openQuantity();
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 1, duration: 200, easing: EASE,
  }));
});

it('F2: Cancel holds the popover until its 200ms exit fade finishes', async () => {
  await openQuantity();
  let exitEnd: Animated.EndCallback | undefined;
  vi.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (cb: Animated.EndCallback) => { exitEnd = cb; },
    stop: () => {},
    reset: () => {},
  }) as unknown as Animated.CompositeAnimation);
  fireEvent.click(screen.getByTestId('quantity-popover-cancel'));
  expect(screen.getByTestId('quantity-popover')).toBeTruthy();
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 0, duration: 200, easing: EASE,
  }));
  act(() => exitEnd?.({ finished: true }));
  expect(screen.queryByTestId('quantity-popover')).toBeNull();
});

it('F3: ignores keyboard input after Cancel while the exit is held', async () => {
  const onApply = await openQuantity();
  let exitEnd: Animated.EndCallback | undefined;
  vi.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (cb: Animated.EndCallback) => { exitEnd = cb; },
    stop: () => {},
    reset: () => {},
  }) as unknown as Animated.CompositeAnimation);
  fireEvent.click(screen.getByTestId('quantity-popover-cancel'));
  const before = screen.getByTestId('quantity-popover-value').textContent;
  fireEvent.keyDown(document, { key: '7' });
  expect(screen.getByTestId('quantity-popover-value').textContent).toBe(before);
  expect(onApply).not.toHaveBeenCalled();
  act(() => exitEnd?.({ finished: true }));
});

it('F4: reduced motion unmounts immediately on Cancel', async () => {
  await openQuantity(true);
  fireEvent.click(screen.getByTestId('quantity-popover-cancel'));
  expect(screen.queryByTestId('quantity-popover')).toBeNull();
});

it('F5: during a held exit the keypad takes no pointer events and its overlay is gone', async () => {
  await openQuantity();
  expect(screen.getByTestId('quantity-popover-overlay')).toBeTruthy();
  expect(getComputedStyle(screen.getByTestId('quantity-popover')).pointerEvents).not.toBe('none');
  let exitEnd: Animated.EndCallback | undefined;
  vi.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (cb: Animated.EndCallback) => { exitEnd = cb; },
    stop: () => {},
    reset: () => {},
  }) as unknown as Animated.CompositeAnimation);
  fireEvent.click(screen.getByTestId('quantity-popover-cancel'));
  expect(getComputedStyle(screen.getByTestId('quantity-popover')).pointerEvents).toBe('none');
  expect(screen.queryByTestId('quantity-popover-overlay')).toBeNull();
  act(() => exitEnd?.({ finished: true }));
  expect(screen.queryByTestId('quantity-popover')).toBeNull();
});
