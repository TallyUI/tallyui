import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import type { PairingError, PairingPhase, TillDisplayEntry } from '@tallyui/pos';
import { CustomerDisplaySettings, type CustomerDisplaySettingsProps } from '../settings';

afterEach(cleanup);

const entry = (displayId: string, name: string, link: TillDisplayEntry['link'], connected: boolean): TillDisplayEntry => ({
  display: { displayId, name, cashierId: 'c1', lastSeenAt: null, connected }, link,
});
const claim = (claimId: string, displayName: string, checkCode: string) => ({ claimId, displayName, checkCode, expiresAt: '2026-11-11T10:05:00Z' });
const codePhase = (claims: ReturnType<typeof claim>[] = []): PairingPhase => ({ phase: 'code', code: '482913', expiresAt: '2026-11-11T10:05:00Z', claims });

type Overrides = Partial<Omit<CustomerDisplaySettingsProps, 'pairing'>> & { phase?: PairingPhase; forgetError?: PairingError | null };
const element = ({ phase = { phase: 'idle' }, forgetError = null, ...props }: Overrides, handlers: Handlers) => (
  <>
    <CustomerDisplaySettings
      pairing={{ phase, forgetError }} displays={{ status: 'online', displays: [] }} formatTime={() => '10:05'}
      {...handlers} {...props}
    />
    <PortalHost />
  </>
);
type Handlers = ReturnType<typeof makeHandlers>;
const makeHandlers = () => ({
  onStartPairing: vi.fn(), onConfirm: vi.fn(), onDecline: vi.fn(), onCancelPairing: vi.fn(), onForget: vi.fn(),
});
const show = (overrides: Overrides = {}) => {
  const handlers = makeHandlers();
  const view = render(element(overrides, handlers));
  return { ...handlers, rerender: (next: Overrides) => view.rerender(element(next, handlers)) };
};
const text = (id: string) => screen.getByTestId(id).textContent;
const disabled = (id: string) => screen.getByTestId(id).getAttribute('aria-disabled');

describe('CustomerDisplaySettings', () => {
  it('lists the displays with their states; Forget asks first, and only the dialog Forget forgets', () => {
    const { onForget } = show({ displays: { status: 'online', displays: [
      entry('d1', 'Counter', 'open', true), entry('d2', 'Window', 'connecting', true),
      entry('d3', 'Bar', 'closed', true), entry('d4', 'Patio', 'closed', false),
    ] } });
    expect(text('display-d1')).toContain('CounterConnected');
    expect(text('display-state-d2')).toBe('Connecting…');
    expect(text('display-state-d3')).toBe('Waiting for the display');
    expect(text('display-state-d4')).toBe('Offline');
    for (const id of ['d1', 'd2', 'd3', 'd4']) expect(text(`forget-${id}`)).toBe('Forget');
    expect(screen.queryByText('No displays paired yet.')).toBeNull();

    fireEvent.click(screen.getByTestId('forget-d2'));
    expect(onForget).not.toHaveBeenCalled();
    expect(screen.getByText('Forget Window?')).toBeTruthy();
    expect(screen.getByText('It will need a new code to pair again.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('forget-cancel-d2'));
    expect(onForget).not.toHaveBeenCalled();
    expect(screen.queryByText('Forget Window?')).toBeNull();

    fireEvent.click(screen.getByTestId('forget-d2'));
    fireEvent.click(screen.getByTestId('forget-confirm-d2'));
    expect(onForget).toHaveBeenCalledTimes(1);
    expect(onForget).toHaveBeenCalledWith('d2');
    expect(screen.queryByText('Forget Window?')).toBeNull();
  });

  it('shows the empty line with no displays', () => {
    show();
    expect(screen.getByText('No displays paired yet.')).toBeTruthy();
  });

  it.each([
    ['forbidden', 'Sign in as a cashier who can pair customer displays.'],
    ['limit', 'Too many pairing attempts. Try again in a few minutes.'],
    ['expired', 'The code expired. Start again for a new code.'],
    ['not_found', 'That display is no longer waiting. Ask it to enter the code again.'],
    ['network', "Can't reach the store. Check the connection and try again."],
    ['server', "The store couldn't finish that. Try again."],
  ] as const)('idle with %s shows its message, and the button starts pairing', (error, message) => {
    const { onStartPairing } = show({ phase: { phase: 'idle', error } });
    expect(text('pairing-error')).toBe(message);
    fireEvent.click(screen.getByTestId('pairing-start'));
    expect(onStartPairing).toHaveBeenCalledTimes(1);
  });

  it('idle with no error shows no message; minting disables the button with a loader', () => {
    const { onStartPairing, rerender } = show();
    expect(screen.queryByTestId('pairing-error')).toBeNull();
    expect(disabled('pairing-start')).toBeNull();
    rerender({ phase: { phase: 'minting' } });
    expect(disabled('pairing-start')).toBe('true');
    expect(screen.getByTestId('pairing-start').querySelector('[role="progressbar"]')).not.toBeNull();
    fireEvent.click(screen.getByTestId('pairing-start'));
    expect(onStartPairing).not.toHaveBeenCalled();
  });

  it('code shows the code and its expiry from formatTime, waits for a display, and Cancel cancels', () => {
    const formatTime = vi.fn(() => '10:05 AM');
    const { onCancelPairing } = show({ phase: codePhase(), formatTime });
    expect(text('pairing-code')).toBe('482913');
    expect(formatTime).toHaveBeenCalledWith('2026-11-11T10:05:00Z');
    expect(screen.getByText('Enter this code on the display. Expires at 10:05 AM.')).toBeTruthy();
    expect(screen.getByText('Waiting for a display…')).toBeTruthy();
    expect(screen.queryByTestId('pairing-start')).toBeNull();
    fireEvent.click(screen.getByTestId('pairing-cancel'));
    expect(onCancelPairing).toHaveBeenCalledTimes(1);
  });

  it('a claim row shows its name and check code; Confirm and Decline call back with its id', () => {
    const { onConfirm, onDecline } = show({ phase: codePhase([claim('k1', 'Counter', '4821'), claim('k2', 'Window', '9034')]) });
    expect(screen.queryByText('Waiting for a display…')).toBeNull();
    expect(screen.getByText('Confirm only if the display shows the same check code.')).toBeTruthy();
    expect(text('claim-k1')).toContain('Counter wants to pair. Check code4821');
    expect(text('check-k1')).toBe('4821');
    expect(text('check-k2')).toBe('9034');
    fireEvent.click(screen.getByTestId('confirm-k2'));
    expect(onConfirm).toHaveBeenCalledWith('k2');
    fireEvent.click(screen.getByTestId('decline-k1'));
    expect(onDecline).toHaveBeenCalledWith('k1');
  });

  it('confirming keeps the claims on screen with their buttons disabled', () => {
    const { onConfirm, onDecline, rerender } = show({ phase: codePhase([claim('k1', 'Counter', '4821'), claim('k2', 'Window', '9034')]) });
    rerender({ phase: { phase: 'confirming', claimId: 'k1' } });
    expect(text('check-k1')).toBe('4821');
    for (const id of ['confirm-k1', 'decline-k1', 'confirm-k2', 'decline-k2']) expect(disabled(id)).toBe('true');
    fireEvent.click(screen.getByTestId('confirm-k2'));
    fireEvent.click(screen.getByTestId('decline-k1'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    rerender({ phase: { phase: 'idle' } });
    expect(screen.queryByTestId('claim-k1')).toBeNull();
    expect(text('pairing-start')).toBe('Pair a display');
  });

  it('forgetError shows its message under the list', () => {
    show({ forgetError: 'not_found', displays: { status: 'online', displays: [entry('d1', 'Counter', 'open', true)] } });
    expect(text('forget-error')).toBe('That display is no longer waiting. Ask it to enter the code again.');
  });

  it.each([
    ['offline', "Can't reach the store. Open displays keep showing the sale; new connections wait."],
    ['paused', 'Sign in as a cashier who can pair customer displays.'],
  ] as const)('the %s status shows its line', (status, line) => {
    show({ displays: { status, displays: [] } });
    expect(text('customer-display-status')).toBe(line);
  });

  it.each(['online', 'closed'] as const)('the %s status shows no line', (status) => {
    show({ displays: { status, displays: [] } });
    expect(screen.queryByTestId('customer-display-status')).toBeNull();
  });
});
