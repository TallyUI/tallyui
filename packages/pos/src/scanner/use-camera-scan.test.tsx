import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ScannerProfileStore } from './device-scanner';
import type { ScanEvent } from './scan-events';
import { ScanHubProvider, useScanHub } from './scan-hub-context';
import { useCameraScan, type UseCameraScanOptions } from './use-camera-scan';

const profiles: ScannerProfileStore = { read: async () => [], save: async () => undefined };
const wrapper = ({ children }: { children: ReactNode }) => (
  <ScanHubProvider profiles={profiles} settings={{ prefix: '', suffix: '', minChars: 8 }}>{children}</ScanHubProvider>
);

/** Renders the hook inside a real provider, recording every hub event. */
function renderCameraScan(initial: UseCameraScanOptions = {}) {
  let time = 0;
  const events: ScanEvent[] = [];
  const view = renderHook((options: UseCameraScanOptions) => {
    const hub = useScanHub();
    return { scan: useCameraScan({ now: () => time, ...options }), hub };
  }, { wrapper, initialProps: initial });
  const subscription = view.result.current.hub.events$.subscribe((event) => events.push(event));
  return {
    events, ...view,
    offer: (code: string, symbology?: string) => act(() => view.result.current.scan.offer(code, symbology)),
    setTime: (at: number) => { time = at; },
    unsubscribe: () => subscription.unsubscribe(),
  };
}

describe('useCameraScan', () => {
  afterEach(() => { cleanup(); });

  it('emits an accepted decode as a camera event with its symbology', () => {
    const { events, offer, setTime } = renderCameraScan();
    setTime(42);
    offer('4006381333931', 'ean13');
    expect(events).toEqual([{ code: '4006381333931', symbology: 'ean13', source: { kind: 'camera' }, timestamp: 42 }]);
  });

  it('emits an item resting in view once', () => {
    const { events, offer, setTime } = renderCameraScan();
    for (const at of [0, 200, 400, 1000, 1500, 2200]) {
      setTime(at);
      offer('12345678');
    }
    expect(events).toHaveLength(1);
    setTime(3400);
    offer('12345678');
    expect(events).toHaveLength(2);
  });

  it('refuses a too-short code without starting its cooldown', () => {
    const onTooShort = vi.fn();
    const { events, offer, rerender } = renderCameraScan({ onTooShort, minChars: 10 });
    offer('123456789');
    expect(onTooShort).toHaveBeenCalledExactlyOnceWith('123456789');
    expect(events).toHaveLength(0);
    rerender({ onTooShort, minChars: 9 });
    offer('123456789');
    expect(events.map(({ code }) => code)).toEqual(['123456789']);
    expect(onTooShort).toHaveBeenCalledTimes(1);
  });

  it('drops decodes while inactive and keeps the cooldowns across a change', () => {
    const { events, offer, rerender, setTime } = renderCameraScan({ active: false });
    offer('12345678');
    expect(events).toHaveLength(0);
    rerender({ active: true });
    offer('12345678');
    expect(events).toHaveLength(1);
    rerender({ active: false });
    rerender({ active: true });
    setTime(500);
    offer('12345678');
    expect(events).toHaveLength(1);
  });

  it('counts accepted codes and keeps its object while the count is unchanged', () => {
    const { offer, result, setTime, rerender } = renderCameraScan();
    expect(result.current.scan.scanCount).toBe(0);
    offer('12345678');
    offer('87654321');
    expect(result.current.scan.scanCount).toBe(2);
    const before = result.current.scan;
    setTime(500);
    offer('12345678');
    rerender({});
    expect(result.current.scan.scanCount).toBe(2);
    expect(result.current.scan).toBe(before);
  });

  it('lets the same code through at once after reset', () => {
    const { events, offer, result } = renderCameraScan();
    offer('12345678');
    offer('12345678');
    expect(events).toHaveLength(1);
    act(() => result.current.scan.reset());
    offer('12345678');
    expect(events).toHaveLength(2);
  });
});
