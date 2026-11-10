import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useBarcodeScanner } from './use-barcode-scanner';

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
});
