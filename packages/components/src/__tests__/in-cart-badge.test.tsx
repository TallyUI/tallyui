import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AccessibilityInfo, Animated } from 'react-native';
import { EASE } from '../lib/motion';
import { InCartBadge } from '../product/in-cart-badge';

describe('InCartBadge', () => {
  beforeEach(() => {
    vi.spyOn(Animated, 'timing');
    vi.spyOn(Animated, 'spring');
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => vi.restoreAllMocks());

  it("plays v2's count beat on an add: swell 1.3 over 90ms on the shared ease, then the spring", async () => {
    const { rerender } = render(<InCartBadge count={1} testID="badge" />);
    await act(async () => {});
    rerender(<InCartBadge count={2} testID="badge" />);
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1.3, duration: 90, easing: EASE }));
    expect(Animated.spring).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, stiffness: 380, damping: 11, mass: 0.6 }));
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: 170 }));
    expect(screen.getByTestId('badge-was').textContent).toBe('1');
  });

  it('the first add lands too', async () => {
    const { rerender } = render(<InCartBadge count={0} testID="badge" />);
    await act(async () => {});
    rerender(<InCartBadge count={1} testID="badge" />);
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1.3 }));
  });

  it('a removal cross-fades the number without the swell', async () => {
    const { rerender } = render(<InCartBadge count={2} testID="badge" />);
    await act(async () => {});
    rerender(<InCartBadge count={1} testID="badge" />);
    expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: 170 }));
    expect(Animated.timing).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1.3 }));
    expect(Animated.spring).not.toHaveBeenCalled();
  });

  it('nothing moves when the identity changes', async () => {
    const { rerender } = render(<InCartBadge count={1} identity="a" testID="badge" />);
    await act(async () => {});
    rerender(<InCartBadge count={2} identity="b" testID="badge" />);
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(Animated.spring).not.toHaveBeenCalled();
    expect(screen.queryByTestId('badge-was')).toBeNull();
  });

  it('under reduced motion the new count shows at once and nothing animates', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { rerender } = render(<InCartBadge count={1} testID="badge" />);
    await act(async () => {});
    rerender(<InCartBadge count={2} testID="badge" />);
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(Animated.spring).not.toHaveBeenCalled();
    expect(screen.queryByTestId('badge-was')).toBeNull();
    expect(screen.getByTestId('badge').textContent).toBe('2');
  });

  it('while reduced motion is not known yet nothing animates', () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(new Promise<boolean>(() => {}));
    const { rerender } = render(<InCartBadge count={1} testID="badge" />);
    rerender(<InCartBadge count={2} testID="badge" />);
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(Animated.spring).not.toHaveBeenCalled();
    expect(screen.queryByTestId('badge-was')).toBeNull();
    expect(screen.getByTestId('badge').textContent).toBe('2');
  });

  it('renders nothing at 0', async () => {
    render(<InCartBadge count={0} testID="badge" />);
    await act(async () => {});
    expect(screen.queryByTestId('badge')).toBeNull();
  });
});
