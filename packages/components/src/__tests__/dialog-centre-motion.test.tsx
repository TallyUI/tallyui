import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccessibilityInfo, Animated } from 'react-native';
import { PortalHost } from '@tallyui/primitives';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from '../ui/alert-dialog';
import { EASE } from '../ui/dialog/motion';

function Harness({ open, alert = false }: { open: boolean; alert?: boolean }) {
  const Root = alert ? AlertDialog : Dialog;
  const Content = alert ? AlertDialogContent : DialogContent;
  const Title = alert ? AlertDialogTitle : DialogTitle;
  return (
    <>
      <Root open={open} onOpenChange={() => {}}>
        <Content testID="modal"><Title>Modal</Title></Content>
      </Root>
      <PortalHost />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("a centred dialog fades and scales in over 150ms with its scrim, on v2's ease", async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  vi.spyOn(Animated, 'timing');
  render(<Harness open />);
  await waitFor(() => {
    expect(vi.mocked(Animated.timing).mock.calls.filter(([, config]) =>
      config.toValue === 1 && config.duration === 150 && config.easing === EASE,
    )).toHaveLength(2);
  });
});

it('closing fades the dialog out over 150ms and the scrim over 200ms, and unmounts only after it', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  vi.spyOn(Animated, 'timing');
  const { rerender } = render(<Harness open />);
  await waitFor(() => {
    expect(vi.mocked(Animated.timing).mock.calls.filter(([, config]) =>
      config.toValue === 1 && config.duration === 150 && config.easing === EASE,
    )).toHaveLength(2);
  });
  let exitEnd: Animated.EndCallback | undefined;
  vi.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (cb: Animated.EndCallback) => { exitEnd = cb; },
    stop: () => {},
    reset: () => {},
  }) as unknown as Animated.CompositeAnimation);
  rerender(<Harness open={false} />);
  expect(screen.getByTestId('modal')).toBeTruthy();
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 0, duration: 150, easing: EASE,
  }));
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 0, duration: 200, easing: EASE,
  }));
  act(() => exitEnd?.({ finished: true }));
  expect(screen.queryByTestId('modal')).toBeNull();
});

it('under reduced motion a centred dialog opens in place and unmounts at once on close', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  vi.spyOn(Animated, 'timing');
  const { rerender } = render(<Harness open />);
  await waitFor(() => expect(getComputedStyle(screen.getByTestId('modal')).opacity).toBe('1'));
  act(() => rerender(<Harness open={false} />));
  expect(screen.queryByTestId('modal')).toBeNull();
  expect(Animated.timing).not.toHaveBeenCalled();
});

it('an alert dialog opens and closes with the same dialog motion', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  vi.spyOn(Animated, 'timing');
  const { rerender } = render(<Harness open alert />);
  await waitFor(() => {
    expect(vi.mocked(Animated.timing).mock.calls.filter(([, config]) =>
      config.toValue === 1 && config.duration === 150 && config.easing === EASE,
    )).toHaveLength(2);
  });
  let exitEnd: Animated.EndCallback | undefined;
  vi.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (cb: Animated.EndCallback) => { exitEnd = cb; },
    stop: () => {},
    reset: () => {},
  }) as unknown as Animated.CompositeAnimation);
  rerender(<Harness open={false} alert />);
  expect(screen.getByTestId('modal')).toBeTruthy();
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 0, duration: 150, easing: EASE,
  }));
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 0, duration: 200, easing: EASE,
  }));
  act(() => exitEnd?.({ finished: true }));
  expect(screen.queryByTestId('modal')).toBeNull();
});

it('under reduced motion an alert dialog unmounts at once on close', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  vi.spyOn(Animated, 'timing');
  const { rerender } = render(<Harness open alert />);
  await waitFor(() => expect(getComputedStyle(screen.getByTestId('modal')).opacity).toBe('1'));
  act(() => rerender(<Harness open={false} alert />));
  expect(screen.queryByTestId('modal')).toBeNull();
  expect(Animated.timing).not.toHaveBeenCalled();
});
