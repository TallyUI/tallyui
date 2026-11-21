import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccessibilityInfo, Animated, Text } from 'react-native';
import { POSLayout } from '../layout/pos-layout';

const slots = { browseSlot: <Text>Products</Text>, cartSlot: <Text>Cart</Text> };
const renderCheckout = () => <Text>Tender</Text>;

beforeEach(() => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  vi.spyOn(Animated, 'timing').mockImplementation(() => ({ start: vi.fn(), stop: vi.fn(), reset: vi.fn() }) as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('C1: split checkout enters with a 200ms fade held at opacity 0', async () => {
  const { rerender } = await act(async () => render(<POSLayout layout="split" {...slots} />));
  rerender(<POSLayout layout="split" {...slots} renderCheckout={renderCheckout} />);
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 1, duration: 200,
  }));
  expect(screen.getByTestId('pos-column-fade').style.opacity).toBe('0');
});

it('C2: split checkout does not fade on first mount', async () => {
  await act(async () => {
    render(<POSLayout layout="split" {...slots} renderCheckout={renderCheckout} />);
  });
  expect(Animated.timing).not.toHaveBeenCalled();
  expect(screen.getByTestId('pos-column-fade').style.opacity).not.toBe('0');
});

it('C3: split products enter with a 200ms fade when checkout closes', async () => {
  const { rerender } = await act(async () => render(
    <POSLayout layout="split" {...slots} renderCheckout={renderCheckout} />,
  ));
  rerender(<POSLayout layout="split" {...slots} />);
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 1, duration: 200,
  }));
});

it('C4: stacked checkout does not fade', async () => {
  const { rerender } = await act(async () => render(<POSLayout layout="stacked" {...slots} />));
  rerender(<POSLayout layout="stacked" {...slots} renderCheckout={renderCheckout} />);
  expect(Animated.timing).not.toHaveBeenCalled();
});

it('C5: reduced motion swaps split checkout at once', async () => {
  vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const { rerender } = await act(async () => render(<POSLayout layout="split" {...slots} />));
  rerender(<POSLayout layout="split" {...slots} renderCheckout={renderCheckout} />);
  expect(Animated.timing).not.toHaveBeenCalled();
  expect(screen.getByText('Tender')).toBeDefined();
  expect(screen.getByTestId('pos-column-fade').style.opacity).not.toBe('0');
});

it('C6: a fade cut short by a layout change does not leave the column faded', async () => {
  const { rerender } = await act(async () => render(<POSLayout layout="split" {...slots} />));
  rerender(<POSLayout layout="split" {...slots} renderCheckout={renderCheckout} />);
  expect(screen.getByTestId('pos-column-fade').style.opacity).toBe('0');
  rerender(<POSLayout layout="stacked" {...slots} renderCheckout={renderCheckout} />);
  rerender(<POSLayout layout="split" {...slots} renderCheckout={renderCheckout} />);
  expect(screen.getByTestId('pos-column-fade').style.opacity).not.toBe('0');
});

it('C7: a new columnKey fades the split column', async () => {
  const { rerender } = await act(async () => render(
    <POSLayout layout="split" {...slots} renderCheckout={renderCheckout} columnKey="tender" />,
  ));
  expect(Animated.timing).not.toHaveBeenCalled();
  rerender(<POSLayout layout="split" {...slots} renderCheckout={renderCheckout} columnKey="receipt:1" />);
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 1, duration: 200,
  }));
  expect(screen.getByTestId('pos-column-fade').style.opacity).toBe('0');
});

it('C8: an unchanged columnKey does not fade', async () => {
  const { rerender } = await act(async () => render(
    <POSLayout layout="split" {...slots} renderCheckout={renderCheckout} columnKey="receipt:1" />,
  ));
  rerender(<POSLayout layout="split" {...slots} renderCheckout={renderCheckout} columnKey="receipt:1" />);
  expect(Animated.timing).not.toHaveBeenCalled();
});

it('C9: stacked ignores a new columnKey', async () => {
  const { rerender } = await act(async () => render(
    <POSLayout layout="stacked" {...slots} renderCheckout={renderCheckout} columnKey="tender" />,
  ));
  expect(Animated.timing).not.toHaveBeenCalled();
  rerender(<POSLayout layout="stacked" {...slots} renderCheckout={renderCheckout} columnKey="receipt:1" />);
  expect(Animated.timing).not.toHaveBeenCalled();
});
