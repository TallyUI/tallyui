import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { CartLineStrip } from '../cart/cart-line-strip';

const animation = () => ({ start() {}, stop() {}, reset() {} }) as unknown as Animated.CompositeAnimation;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const springs = (config: object) => expect(Animated.spring).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining(config));

async function strip(onEdit = vi.fn(), onRemove = vi.fn()) {
  render(<CartLineStrip name="Bag" onEdit={onEdit} onRemove={onRemove}>
    {(wrapTotal) => <View>{wrapTotal(<Text>€1.20</Text>)}</View>}</CartLineStrip>);
  await act(async () => {});
  // react-native-web keeps a View's onLayout on its node (useElementLayout); jsdom has no ResizeObserver to call it.
  const node = screen.getByTestId('cart-line-strip-actions') as HTMLElement & { __reactLayoutHandler: (event: unknown) => void };
  act(() => node.__reactLayoutHandler({ nativeEvent: { layout: { x: 0, y: 0, width: 160, height: 44 } } }));
  return { onEdit, onRemove };
}

describe('CartLineStrip', () => {
  beforeEach(() => {
    vi.spyOn(Animated, 'spring').mockImplementation(animation);
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('the Total opens the strip onto Edit and Remove, Remove removes, and the Total closes it', async () => {
    const { onRemove } = await strip();
    expect(screen.queryByRole('button', { name: 'Remove Bag' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Bag' })).toBeNull();
    click('Edit total of Bag');
    springs({ toValue: -160, overshootClamping: true });
    expect(screen.getByRole('button', { name: 'Remove Bag' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Bag' })).toBeTruthy();
    click('Remove Bag');
    expect(onRemove).toHaveBeenCalledTimes(1);
    click('Edit total of Bag');
    springs({ toValue: 0 });
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
});
