import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { createScanHub } from './scan-events';
import { useBarcodeScanner } from './use-barcode-scanner';
import { useState, type ReactNode } from 'react';
import type { ScannerProfileStore } from './device-scanner';
import { ScanHubProvider, useScanHub } from './scan-hub-context';
import type { UseBarcodeScannerOptions } from './use-barcode-scanner';

vi.mock('./scan-hub-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scan-hub-context')>();
  return { ...actual, useScanHub: vi.fn(actual.useScanHub) };
});

const profiles: ScannerProfileStore = { read: async () => [], save: async () => undefined };
const wrapper = ({ children }: { children: ReactNode }) => (
  <ScanHubProvider profiles={profiles} settings={{ prefix: '', suffix: '', minChars: 8 }}>{children}</ScanHubProvider>
);
/** Renders the scanner inside a provider and returns its hub. */
function renderInHub(options: UseBarcodeScannerOptions) {
  return renderHook(() => {
    useBarcodeScanner(options);
    return useScanHub();
  }, { wrapper }).result.current;
}

function typeBurst(target: HTMLElement, code: string) {
  for (const key of code) {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    vi.advanceTimersByTime(5);
  }
}

describe('useBarcodeScanner', () => {
  const elements: HTMLElement[] = [];
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    for (const element of elements) element.remove();
    elements.length = 0;
    vi.useRealTimers();
  });

  it('calls onScan for a fast burst typed outside any input', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));
    typeBurst(document.body, '036000291450');
    expect(onScan).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onScan).toHaveBeenCalledExactlyOnceWith('036000291450');
    typeBurst(document.body, '036000291450');
    vi.advanceTimersByTime(200);
    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it('passes gapRule to the detector', () => {
    const onScan = vi.fn();
    const { rerender } = renderHook(({ gapRule }) => useBarcodeScanner({ onScan, gapRule, minChars: 6 }), {
      initialProps: { gapRule: undefined as UseBarcodeScannerOptions['gapRule'] },
    });
    typeBurst(document.body, '036000');
    vi.advanceTimersByTime(35);
    typeBurst(document.body, '291452');
    vi.advanceTimersByTime(200);
    expect(onScan).toHaveBeenCalledExactlyOnceWith('036000291452');
    rerender({ gapRule: 'every' });
    typeBurst(document.body, '036000');
    vi.advanceTimersByTime(35);
    typeBurst(document.body, '291452');
    vi.advanceTimersByTime(200);
    expect(onScan).toHaveBeenCalledTimes(2);
    expect(onScan).toHaveBeenNthCalledWith(2, '291452');
  });

  it('ignores keys typed into a focused input', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));
    for (const tag of ['input', 'textarea'] as const) {
      const input = document.createElement(tag);
      document.body.append(input);
      elements.push(input);
      input.focus();
      typeBurst(input, '036000291452');
      vi.advanceTimersByTime(200);
      expect(onScan).not.toHaveBeenCalled();
      input.blur();
      typeBurst(document.body, '036000291452');
      input.focus();
      typeBurst(input, '123');
      vi.advanceTimersByTime(200);
      expect(onScan).not.toHaveBeenCalled();
    }
  });

  it('scans a burst on a select or contentEditable element by default', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));
    const select = document.createElement('select');
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    document.body.append(select, div);
    elements.push(select, div);
    typeBurst(select, '036000291452');
    vi.advanceTimersByTime(200);
    expect(onScan).toHaveBeenCalledExactlyOnceWith('036000291452');
    typeBurst(div, '036000291452');
    vi.advanceTimersByTime(200);
    expect(onScan).toHaveBeenCalledTimes(2);
    expect(onScan).toHaveBeenNthCalledWith(2, '036000291452');
  });

  it("ignores keys typed into a select or contentEditable element under 'ignore-editable'", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, fieldPolicy: 'ignore-editable' }));
    const select = document.createElement('select');
    const div = document.createElement('div');
    const input = document.createElement('input');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    document.body.append(select, div, input);
    elements.push(select, div, input);
    for (const element of [select, div, input]) {
      typeBurst(element, '036000291452');
      vi.advanceTimersByTime(200);
      expect(onScan).not.toHaveBeenCalled();
    }
    typeBurst(document.body, '036000291452');
    vi.advanceTimersByTime(200);
    expect(onScan).toHaveBeenCalledExactlyOnceWith('036000291452');
  });

  it('applies a changed fieldPolicy on the next burst', () => {
    const onScan = vi.fn();
    const { rerender } = renderHook(({ fieldPolicy }) => useBarcodeScanner({ onScan, fieldPolicy }), {
      initialProps: { fieldPolicy: undefined as UseBarcodeScannerOptions['fieldPolicy'] },
    });
    const select = document.createElement('select');
    document.body.append(select);
    elements.push(select);
    typeBurst(select, '036000291452');
    vi.advanceTimersByTime(200);
    expect(onScan).toHaveBeenCalledExactlyOnceWith('036000291452');
    rerender({ fieldPolicy: 'ignore-editable' });
    typeBurst(select, '036000291452');
    vi.advanceTimersByTime(200);
    expect(onScan).toHaveBeenCalledExactlyOnceWith('036000291452');
  });

  it('drops a burst shorter than minChars', () => {
    const onScan = vi.fn();
    const { rerender } = renderHook(({ minChars }) => useBarcodeScanner({ onScan, minChars }), {
      initialProps: { minChars: undefined as number | undefined },
    });
    typeBurst(document.body, '1234567');
    vi.advanceTimersByTime(200);
    expect(onScan).not.toHaveBeenCalled();
    rerender({ minChars: 10 });
    typeBurst(document.body, '123456789');
    vi.advanceTimersByTime(200);
    expect(onScan).not.toHaveBeenCalled();
    typeBurst(document.body, '1234567890');
    vi.advanceTimersByTime(200);
    expect(onScan).toHaveBeenCalledExactlyOnceWith('1234567890');
  });

  it('passes a hub event to onScanEvent and then onScan', () => {
    const calls: string[] = [];
    const onScan = vi.fn(() => { calls.push('onScan'); });
    const onScanEvent = vi.fn(() => { calls.push('onScanEvent'); });
    const hub = renderInHub({ onScan, onScanEvent });
    const event = { code: '12345678', source: { kind: 'serial' as const }, timestamp: 0 };
    hub.emit(event);

    expect(onScan).toHaveBeenCalledExactlyOnceWith('12345678');
    expect(onScanEvent).toHaveBeenCalledExactlyOnceWith(event);
    expect(calls).toEqual(['onScanEvent', 'onScan']);
  });

  it('drops a wedge copy of a serial scan within the window', () => {
    const onScan = vi.fn();
    const hub = renderInHub({ onScan });
    hub.emit({ code: '036000291450', source: { kind: 'serial' }, timestamp: 0 });
    vi.advanceTimersByTime(100);
    typeBurst(document.body, '036000291450');
    vi.advanceTimersByTime(200);

    expect(onScan).toHaveBeenCalledExactlyOnceWith('036000291450');
  });

  it('ignores hub events while disabled', () => {
    const onScan = vi.fn();
    const hub = renderInHub({ onScan, enabled: false });
    hub.emit({ code: '12345678', source: { kind: 'serial' }, timestamp: 0 });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('reports a wedge scan timed from its first key', () => {
    const onScanEvent = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan: vi.fn(), onScanEvent }));
    const firstKeyAt = Date.now();
    typeBurst(document.body, '036000291450');
    vi.advanceTimersByTime(200);

    expect(onScanEvent).toHaveBeenCalledExactlyOnceWith({ code: '036000291450', source: { kind: 'wedge' }, timestamp: firstKeyAt });
  });

  it('drops the wedge copy of a device scan that arrived just after the burst began, however long the burst', () => {
    const onScan = vi.fn();
    const hub = renderInHub({ onScan, threshold: 50 });
    const code = '01234567890123456789';
    // A key every 30 ms: the burst ends 570 ms after its first key, so only first-key timing keeps it in the window.
    [...code].forEach((key, index) => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      vi.advanceTimersByTime(10);
      if (index === 0) hub.emit({ code, source: { kind: 'serial' }, timestamp: 0 });
      vi.advanceTimersByTime(20);
    });
    vi.advanceTimersByTime(200);

    expect(onScan).toHaveBeenCalledExactlyOnceWith(code);
  });

  it('stops passing hub events once disabled', () => {
    const onScan = vi.fn();
    const { result, rerender } = renderHook(({ enabled }) => {
      useBarcodeScanner({ onScan, enabled });
      return useScanHub();
    }, { wrapper, initialProps: { enabled: true } });
    rerender({ enabled: false });
    result.current.emit({ code: '12345678', source: { kind: 'serial' }, timestamp: 0 });

    expect(onScan).not.toHaveBeenCalled();
  });

  // A real provider's hub is fixed for its lifetime, and a new provider (a new key) remounts the hook as well, so a
  // hub change can only be shown by swapping what useScanHub returns.
  it('resubscribes when useScanHub returns a new hub', async () => {
    const onScan = vi.fn();
    const actual = await vi.importActual<typeof import('./scan-hub-context')>('./scan-hub-context');
    let current = createScanHub();
    vi.mocked(useScanHub).mockImplementation(() => current);
    try {
      const { rerender } = renderHook(() => useBarcodeScanner({ onScan }));
      const first = current;
      current = createScanHub();
      rerender();
      first.emit({ code: '11111111', source: { kind: 'serial' }, timestamp: 0 });
      current.emit({ code: '12345678', source: { kind: 'serial' }, timestamp: 0 });

      expect(onScan).toHaveBeenCalledExactlyOnceWith('12345678');
    } finally {
      vi.mocked(useScanHub).mockImplementation(actual.useScanHub);
    }
  });
});

/** Dispatches a cancelable keydown, so a test can read defaultPrevented. */
function press(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Presses each key of `code` 5 ms apart, as a scanner does, and returns the events. */
function pressBurst(target: EventTarget, code: string): KeyboardEvent[] {
  return [...code].map((key) => {
    const event = press(target, key);
    vi.advanceTimersByTime(5);
    return event;
  });
}

function MoneyField({ onScan }: { onScan: (code: string) => void }) {
  const [v, setV] = useState('');
  useBarcodeScanner({ onScan, fieldPolicy: 'hold-money' });
  return <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} data-testid="m" />;
}

describe('fieldPolicy hold-money', () => {
  let input: HTMLInputElement;
  beforeEach(() => {
    vi.useFakeTimers();
    input = document.createElement('input');
    input.setAttribute('inputmode', 'decimal');
    document.body.append(input);
    input.focus();
  });
  afterEach(() => {
    cleanup();
    input.remove();
    vi.useRealTimers();
  });

  it('a scan into a money field is scanned and never reaches it', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, fieldPolicy: 'hold-money' }));
    const events = pressBurst(input, '036000291452');
    events.push(press(input, 'Enter'));
    vi.advanceTimersByTime(200);

    expect(onScan).toHaveBeenCalledExactlyOnceWith('036000291452');
    expect(input.value).toBe('');
    expect(events.every((event) => event.defaultPrevented)).toBe(true);
  });

  it('typing at human speed goes in at the caret', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, fieldPolicy: 'hold-money' }));
    const inputs = vi.fn();
    input.addEventListener('input', inputs);
    const events = ['1', '2', '.', '5'].map((key) => {
      const event = press(input, key);
      vi.advanceTimersByTime(100);
      return event;
    });

    expect(events.every((event) => event.defaultPrevented)).toBe(true);
    expect(input.value).toBe('12.5');
    expect(inputs).toHaveBeenCalledTimes(4);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('a short fast run goes in once the detector settles', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, fieldPolicy: 'hold-money' }));
    pressBurst(input, '12');
    vi.advanceTimersByTime(200);

    expect(input.value).toBe('12');
    expect(onScan).not.toHaveBeenCalled();
  });

  it('held keys replace the selection', () => {
    renderHook(() => useBarcodeScanner({ onScan: vi.fn(), fieldPolicy: 'hold-money' }));
    input.value = '1000';
    input.setSelectionRange(1, 3);
    press(input, '5');
    vi.advanceTimersByTime(100);

    expect(input.value).toBe('150');
    expect(input.selectionStart).toBe(2);
  });

  it('a named key flushes the held keys first and is not prevented', () => {
    renderHook(() => useBarcodeScanner({ onScan: vi.fn(), fieldPolicy: 'hold-money' }));
    press(input, '7');
    vi.advanceTimersByTime(2);
    let seen: string | undefined;
    input.addEventListener('keydown', () => { seen = input.value; }, { capture: true });
    const backspace = press(input, 'Backspace');

    expect(seen).toBe('7');
    expect(backspace.defaultPrevented).toBe(false);
  });

  it('a key elsewhere flushes the held keys into their field', () => {
    renderHook(() => useBarcodeScanner({ onScan: vi.fn(), fieldPolicy: 'hold-money' }));
    press(input, '9');
    vi.advanceTimersByTime(2);
    press(document.body, 'a');

    expect(input.value).toBe('9');
  });

  it('unmount flushes held keys', () => {
    const { unmount } = renderHook(() => useBarcodeScanner({ onScan: vi.fn(), fieldPolicy: 'hold-money' }));
    press(input, '3');
    unmount();

    expect(input.value).toBe('3');
  });

  it('a scan into another input still resets under hold-money', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, fieldPolicy: 'hold-money' }));
    const other = document.createElement('input');
    document.body.append(other);
    try {
      other.focus();
      const events = pressBurst(other, '036000291452');
      vi.advanceTimersByTime(200);

      expect(onScan).not.toHaveBeenCalled();
      expect(events.some((event) => event.defaultPrevented)).toBe(false);
    } finally {
      other.remove();
    }
  });

  it('other policies do not hold a money field', () => {
    for (const fieldPolicy of [undefined, 'ignore-editable'] as const) {
      const onScan = vi.fn();
      const { unmount } = renderHook(() => useBarcodeScanner({ onScan, fieldPolicy }));
      const events = pressBurst(input, '036000291452');
      vi.advanceTimersByTime(200);

      expect(onScan).not.toHaveBeenCalled();
      expect(events.some((event) => event.defaultPrevented)).toBe(false);
      expect(input.value).toBe('');
      unmount();
    }
  });

  it('a React-controlled money field sees the flushed value', () => {
    const { getByTestId } = render(<MoneyField onScan={vi.fn()} />);
    const money = getByTestId('m') as HTMLInputElement;
    money.focus();
    press(money, '4');
    act(() => { vi.advanceTimersByTime(100); });
    press(money, '2');
    act(() => { vi.advanceTimersByTime(100); });

    expect(money.value).toBe('42');
  });
});
