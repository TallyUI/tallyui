import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccessibilityInfo, Animated, Dimensions } from 'react-native';
import { PortalHost } from '@tallyui/primitives';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { EASE, EASE_EXIT } from '../ui/dialog/motion';

function Harness({ open, side = 'right' }: { open: boolean; side?: 'center' | 'left' | 'right' }) {
  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent side={side} testID="sheet"><DialogTitle>Sheet</DialogTitle></DialogContent>
      </Dialog>
      <PortalHost />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("a side sheet slides in over 250ms and fades its scrim in over 150ms, on v2's ease", async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  vi.spyOn(Animated, 'timing');
  render(<Harness open />);
  await waitFor(() => {
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      toValue: 1, duration: 250, easing: EASE,
    }));
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      toValue: 1, duration: 150, easing: EASE,
    }));
  });
});

it("closing slides the sheet out over 200ms on v2's exit ease, and unmounts only after it", async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  vi.spyOn(Animated, 'timing');
  const { rerender } = render(<Harness open />);
  await waitFor(() => {
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      toValue: 1, duration: 250, easing: EASE,
    }));
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      toValue: 1, duration: 150, easing: EASE,
    }));
  });
  let exitEnd: Animated.EndCallback | undefined;
  vi.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (cb: Animated.EndCallback) => { exitEnd = cb; },
    stop: () => {},
    reset: () => {},
  }) as unknown as Animated.CompositeAnimation);
  rerender(<Harness open={false} />);
  expect(screen.getByTestId('sheet')).toBeTruthy();
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 0, duration: 200, easing: EASE_EXIT,
  }));
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 0, duration: 200, easing: EASE,
  }));
  act(() => exitEnd?.({ finished: true }));
  expect(screen.queryByTestId('sheet')).toBeNull();
});

it('under reduced motion the sheet opens in place and unmounts at once on close', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  vi.spyOn(Animated, 'timing');
  const { rerender } = render(<Harness open />);
  await waitFor(() => expect(getComputedStyle(screen.getByTestId('sheet')).transform).toBe('translateX(0px)'));
  act(() => rerender(<Harness open={false} />));
  expect(screen.queryByTestId('sheet')).toBeNull();
  expect(Animated.timing).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 250 }));
  expect(Animated.timing).not.toHaveBeenCalled();
});

/** Holds every enter animation at its first frame. */
function holdEnter() {
  vi.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: () => {},
    stop: () => {},
    reset: () => {},
  }) as unknown as Animated.CompositeAnimation);
}

it('held at its first frame, a left sheet sits off the left edge and a right sheet off the right edge', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  // jsdom's window is 0 wide, so give the sheet a width to start off-screen by.
  vi.spyOn(Dimensions, 'get').mockReturnValue({ width: 400, height: 800, scale: 1, fontScale: 1 });
  holdEnter();
  render(<Harness open side="left" />);
  await waitFor(() => expect(Animated.parallel).toHaveBeenCalled());
  expect(getComputedStyle(screen.getByTestId('sheet')).transform).toMatch(/translateX\(-\d/);
  cleanup();
  render(<Harness open side="right" />);
  await waitFor(() => expect(Animated.parallel).toHaveBeenCalledTimes(2));
  expect(getComputedStyle(screen.getByTestId('sheet')).transform).toMatch(/translateX\(\d/);
});

it("a left sheet slides in over 250ms on v2's ease", async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  vi.spyOn(Animated, 'timing');
  render(<Harness open side="left" />);
  await waitFor(() => {
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      toValue: 1, duration: 250, easing: EASE,
    }));
  });
});

it('under reduced motion a left sheet opens in place', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  render(<Harness open side="left" />);
  await waitFor(() => expect(getComputedStyle(screen.getByTestId('sheet')).transform).toBe('translateX(0px)'));
});
