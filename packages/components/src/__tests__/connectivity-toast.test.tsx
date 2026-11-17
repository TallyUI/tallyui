import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConnectivityToast } from '../shell/connectivity-toast';

const DESCRIPTION = 'Nothing to do — keep selling. Changes send automatically when the connection returns.';
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const toast = () => screen.queryByTestId('connectivity-toast');

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('ConnectivityToast', () => {
  it('shows nothing on mount', () => {
    render(<ConnectivityToast state="offline" />);
    advance(10_000);
    expect(toast()).toBeNull();
  });

  it('shows Device went offline once the change holds 5 s, then hides after 4 s', () => {
    const { rerender } = render(<ConnectivityToast state="online" />);
    rerender(<ConnectivityToast state="offline" />);
    advance(4_999);
    expect(toast()).toBeNull();
    advance(1);
    expect(toast()?.textContent).toContain('Device went offline');
    expect(toast()?.textContent).toContain(DESCRIPTION);
    advance(4_000);
    expect(toast()).toBeNull();
  });

  it('shows nothing for a flap inside the settle window', () => {
    const { rerender } = render(<ConnectivityToast state="online" />);
    rerender(<ConnectivityToast state="offline" />);
    advance(4_999);
    rerender(<ConnectivityToast state="online" />);
    advance(5_000);
    expect(toast()).toBeNull();
  });

  it('reads Website is unreachable when degraded', () => {
    const { rerender } = render(<ConnectivityToast state="online" />);
    rerender(<ConnectivityToast state="degraded" />);
    advance(5_000);
    expect(toast()?.textContent).toContain('Website is unreachable');
  });

  it('reads Connection restored, with no description, after an outage', () => {
    const { rerender } = render(<ConnectivityToast state="online" />);
    rerender(<ConnectivityToast state="offline" />);
    advance(5_000 + 4_000);
    rerender(<ConnectivityToast state="online" />);
    advance(5_000);
    expect(toast()?.textContent).toContain('Connection restored');
    expect(toast()?.textContent).not.toContain('keep selling');
  });

  it('Close hides it', () => {
    const { rerender } = render(<ConnectivityToast state="online" />);
    rerender(<ConnectivityToast state="offline" />);
    advance(5_000);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(toast()).toBeNull();
  });
});
