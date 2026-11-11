import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { createScanHub } from './scan-events';
import { useBarcodeScanner } from './use-barcode-scanner';
import type { ReactNode } from 'react';
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
