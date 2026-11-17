import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccessibilityInfo, Animated } from 'react-native';
import { PortalHost } from '@tallyui/primitives';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { EASE, EASE_EXIT } from '../ui/dialog/motion';

function Harness({ open, side = 'right' }: { open: boolean; side?: 'center' | 'right' }) {
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
  rerender(<Harness open={false} />);
  expect(screen.getByTestId('sheet')).toBeTruthy();
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 0, duration: 200, easing: EASE_EXIT,
  }));
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 0, duration: 200, easing: EASE,
  }));
  await waitFor(() => expect(screen.queryByTestId('sheet')).toBeNull(), { timeout: 2000 });
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

it('a centred dialog is unchanged: no slide and no wait on close', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  vi.spyOn(Animated, 'timing');
  const { rerender } = render(<Harness open side="center" />);
  await act(async () => rerender(<Harness open={false} side="center" />));
  expect(screen.queryByTestId('sheet')).toBeNull();
  expect(Animated.timing).not.toHaveBeenCalled();
});
