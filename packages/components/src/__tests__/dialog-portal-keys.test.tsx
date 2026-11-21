import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccessibilityInfo, Animated, TextInput } from 'react-native';
import { PortalHost } from '@tallyui/primitives';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';

type Open = { a: boolean; b: boolean };
let setOpen: React.Dispatch<React.SetStateAction<Open>> = () => {};

function Editor() {
  const [value, setValue] = React.useState('');
  return <TextInput testID="b-input" value={value} onChangeText={setValue} />;
}

function Harness() {
  const [open, set] = React.useState<Open>({ a: false, b: false });
  setOpen = set;
  return (
    <>
      <Dialog open={open.a} onOpenChange={(a) => set((prev) => ({ ...prev, a }))}>
        <DialogContent testID="dialog-a"><DialogTitle>A</DialogTitle></DialogContent>
      </Dialog>
      <Dialog open={open.b} onOpenChange={(b) => set((prev) => ({ ...prev, b }))}>
        <DialogContent testID="dialog-b"><DialogTitle>B</DialogTitle><Editor /></DialogContent>
      </Dialog>
      <PortalHost />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('a dialog opened while another animates out keeps its typed input when the other leaves', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  render(<Harness />);
  act(() => setOpen({ a: true, b: false }));
  await waitFor(() => expect(getComputedStyle(screen.getByTestId('dialog-a')).opacity).toBe('1'));
  // Hold A's exit, as dialog-centre-motion.test.tsx does, so B opens while A is still in the portal.
  const ends: Animated.EndCallback[] = [];
  vi.spyOn(Animated, 'parallel').mockImplementation(() => ({
    start: (cb: Animated.EndCallback) => { ends.push(cb); }, stop: () => {}, reset: () => {},
  }) as unknown as Animated.CompositeAnimation);
  act(() => setOpen({ a: false, b: true }));
  const input = screen.getByTestId('b-input');
  fireEvent.change(input, { target: { value: 'typed' } });
  expect(screen.getByTestId('dialog-a')).toBeTruthy();
  act(() => ends[0]?.({ finished: true }));
  expect(screen.queryByTestId('dialog-a')).toBeNull();
  expect((screen.getByTestId('b-input') as HTMLInputElement).value).toBe('typed');
  expect(screen.getByTestId('b-input')).toBe(input);
});
