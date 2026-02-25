import { render, screen } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Presence, usePresence } from '../animated';

describe('Presence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children when present is true', () => {
    render(
      <Presence present={true}>
        <div data-testid="child">Hello</div>
      </Presence>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('hides children when present is false after exit duration', () => {
    render(
      <Presence present={false}>
        <div data-testid="child">Hello</div>
      </Presence>
    );
    // Initially isPresent starts as false (matches present prop), so nothing renders
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('keeps children mounted during exit transition', () => {
    const { rerender } = render(
      <Presence present={true}>
        <div data-testid="child">Hello</div>
      </Presence>
    );
    expect(screen.getByTestId('child')).toBeTruthy();

    // Switch to present=false — children should still be visible during exit duration
    rerender(
      <Presence present={false}>
        <div data-testid="child">Hello</div>
      </Presence>
    );

    // Children should still be mounted (exit animation in progress)
    expect(screen.getByTestId('child')).toBeTruthy();

    // After exit duration, children should unmount
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('always renders when forceMount is true', () => {
    render(
      <Presence present={false} forceMount>
        <div data-testid="child">Hello</div>
      </Presence>
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('passes present prop to render function children', () => {
    const renderFn = vi.fn(({ present }: { present: boolean }) => (
      <div data-testid="child">{present ? 'visible' : 'hidden'}</div>
    ));

    render(<Presence present={true}>{renderFn}</Presence>);

    expect(renderFn).toHaveBeenCalledWith({ present: true });
    expect(screen.getByTestId('child').textContent).toBe('visible');
  });

  it('passes present=false to render function when exiting', () => {
    const renderFn = vi.fn(({ present }: { present: boolean }) => (
      <div data-testid="child">{present ? 'visible' : 'hidden'}</div>
    ));

    const { rerender } = render(
      <Presence present={true}>{renderFn}</Presence>
    );

    rerender(<Presence present={false}>{renderFn}</Presence>);

    // During exit transition, render function gets present=false
    expect(screen.getByTestId('child').textContent).toBe('hidden');
  });
});

describe('usePresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns isPresent=true when present is true', () => {
    const { result } = renderHook(() => usePresence(true));
    expect(result.current.isPresent).toBe(true);
  });

  it('returns isPresent=false when present is false (after exit duration)', () => {
    const { result } = renderHook(() => usePresence(false));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.isPresent).toBe(false);
  });

  it('delays isPresent=false for exit duration', () => {
    const { result, rerender } = renderHook(
      ({ present }) => usePresence(present, 300),
      { initialProps: { present: true } }
    );

    expect(result.current.isPresent).toBe(true);

    // Switch to present=false
    rerender({ present: false });

    // Should still be present (exit animation in progress)
    expect(result.current.isPresent).toBe(true);

    // Advance partway — still present
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.isPresent).toBe(true);

    // Advance past exit duration — now unmounted
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.isPresent).toBe(false);
  });

  it('cancels exit timer if present becomes true again', () => {
    const { result, rerender } = renderHook(
      ({ present }) => usePresence(present, 300),
      { initialProps: { present: true } }
    );

    // Start exit
    rerender({ present: false });
    expect(result.current.isPresent).toBe(true);

    // Advance partway through exit
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.isPresent).toBe(true);

    // Re-enter before exit completes
    rerender({ present: true });

    // Advance well past original exit duration
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Should still be present — timer was cancelled
    expect(result.current.isPresent).toBe(true);
  });

  it('provides a ref callback', () => {
    const { result } = renderHook(() => usePresence(true));
    expect(typeof result.current.ref).toBe('function');
  });
});
