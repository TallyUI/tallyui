import type { ReactNode } from 'react';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { scannerDeviceKey } from './device-identity';
import type { DeviceScannerSettings, ScannerProfileStore } from './device-scanner';
import type { HidLike } from './hid-scanner';
import type { HidDeviceLike, HidInputReportEventLike } from './hid-scanner';
import { inertScanHub, type ScanHub } from './scan-events';
import type { ScanEvent } from './scan-events';
import {
  inertDeviceScanControls, ScanHubProvider, useDeviceScanControls, useScanHub, type ScanHubProviderProps,
} from './scan-hub-context';
import type { ScannerProfile } from './scanner-profiles';
import type { SerialLike, SerialPortLike } from './serial-scanner';

const settings: DeviceScannerSettings = { prefix: '', suffix: '', minChars: 8 };

/** A USB-CDC port whose `readable` is a real ReadableStream, as in serial-scanner.test.ts. */
function fakePort(): SerialPortLike {
  const stream = new ReadableStream<Uint8Array>();
  let open = false;
  return {
    open: vi.fn(async () => { open = true; }),
    close: vi.fn(async () => { open = false; }),
    get readable() { return open ? stream : null; },
    getInfo: () => ({ usbVendorId: 0x05e0, usbProductId: 0x1200 }),
  };
}

function setup(port?: SerialPortLike) {
  const rows = new Map<string, ScannerProfile>();
  const profiles: ScannerProfileStore = {
    read: async (types) => [...rows.values()].filter((row) => types.includes(row.connectionType)),
    save: async (profile) => { rows.set(profile.deviceKey, profile); },
  };
  const serial = {
    getPorts: vi.fn(async () => []),
    requestPort: vi.fn(async () => {
      if (!port) throw new DOMException('No port selected by the user.', 'NotFoundError');
      return port;
    }),
  } satisfies SerialLike;
  const hid = { getDevices: vi.fn(async () => []), requestDevice: vi.fn(async () => []) } satisfies HidLike;
  const props: Omit<ScanHubProviderProps, 'children'> = { profiles, settings, serial, hid, onError: vi.fn() };
  const wrapper = ({ children }: { children: ReactNode }) => <ScanHubProvider {...props}>{children}</ScanHubProvider>;
  return { serial, hid, props, wrapper };
}

describe('ScanHubProvider', () => {
  afterEach(() => { cleanup(); });

  it('falls back to the inert hub and controls with no provider', async () => {
    const { result } = renderHook(() => ({ hub: useScanHub(), controls: useDeviceScanControls() }));

    expect(result.current.hub).toBe(inertScanHub);
    expect(result.current.controls).toBe(inertDeviceScanControls);
    await expect(result.current.controls.serial.connect()).resolves.toBeUndefined();
  });

  it('reopens saved scanners on mount and disposes the controllers on unmount', async () => {
    const { serial, hid, wrapper } = setup();
    const { result, unmount } = renderHook(() => useDeviceScanControls(), { wrapper });

    await waitFor(() => expect(result.current.serial.available).toBe(true));
    expect(result.current.hid.available).toBe(true);
    await waitFor(() => expect(hid.getDevices).toHaveBeenCalledTimes(1));
    expect(serial.getPorts).toHaveBeenCalledTimes(1);

    const captured = result.current;
    unmount();
    await captured.serial.connect();
    expect(serial.requestPort).not.toHaveBeenCalled();
  });

  it('re-renders the controls with the live connection status', async () => {
    const port = fakePort();
    const { wrapper } = setup(port);
    const { result } = renderHook(() => useDeviceScanControls(), { wrapper });
    await waitFor(() => expect(result.current.serial.available).toBe(true));

    await act(() => result.current.serial.connect());
    expect(result.current.serial.connected).toBe(true);
    expect(result.current.serial.connectedDeviceKey)
      .toBe(scannerDeviceKey({ connectionType: 'usb-serial', vendorId: 0x05e0, productId: 0x1200 }));
    expect(result.current.hid.connected).toBe(false);

    await act(() => result.current.serial.disconnect());
    expect(result.current.serial.connected).toBe(false);
    expect(result.current.serial.connectedDeviceKey).toBeNull();
  });

  it('keeps a live controller through StrictMode\'s double mount', async () => {
    const { serial, wrapper } = setup();
    // StrictMode at the root: RTL's option. A <StrictMode> inside the wrapper did not double-run the mount effect.
    const { result } = renderHook(() => useDeviceScanControls(), { wrapper, reactStrictMode: true });
    await waitFor(() => expect(result.current.serial.available).toBe(true));

    await act(() => result.current.serial.connect());
    expect(serial.requestPort).toHaveBeenCalledTimes(1);
  });

  it('keeps one hub and one controller pair when the settings change', async () => {
    const { serial, props } = setup();
    const hubs: ScanHub[] = [];
    function Probe() {
      hubs.push(useScanHub());
      return null;
    }
    const { rerender } = render(<ScanHubProvider {...props}><Probe /></ScanHubProvider>);
    await waitFor(() => expect(serial.getPorts).toHaveBeenCalledTimes(1));
    rerender(<ScanHubProvider {...props} settings={{ ...settings, minChars: 4 }}><Probe /></ScanHubProvider>);

    expect(hubs.length).toBeGreaterThan(1);
    expect(hubs[0]).not.toBe(inertScanHub);
    for (const hub of hubs) expect(hub).toBe(hubs[0]);
    expect(serial.getPorts).toHaveBeenCalledTimes(1);
  });
});

/** A granted HID-POS device with a saved profile, so the provider's own controller reopens it on mount. */
function hidSetup() {
  const listeners = new Set<(event: HidInputReportEventLike) => void>();
  const device = {
    vendorId: 0x05e0, productId: 0x1300, open: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
    addEventListener: (_type: 'inputreport', listener: (event: HidInputReportEventLike) => void) => { listeners.add(listener); },
    removeEventListener: (_type: 'inputreport', listener: (event: HidInputReportEventLike) => void) => { listeners.delete(listener); },
  } satisfies HidDeviceLike;
  // [length, ...ASCII], as hid-scanner.test.ts builds it.
  const fire = (code: string) => {
    const data = new DataView(Uint8Array.from([code.length, ...[...code].map((char) => char.charCodeAt(0))]).buffer);
    for (const listener of [...listeners]) listener({ data, reportId: 0 });
  };
  const profile: ScannerProfile = {
    deviceKey: scannerDeviceKey({ connectionType: 'hid-pos', vendorId: 0x05e0, productId: 0x1300 }),
    connectionType: 'hid-pos', deviceName: '', vendorId: 0x05e0, productId: 0x1300,
  };
  const profiles: ScannerProfileStore = {
    read: async (types) => (types.includes('hid-pos') ? [profile] : []), save: async () => undefined,
  };
  const hid: HidLike = { getDevices: async () => [device], requestDevice: async () => [] };
  return { device, fire, listeners, props: { profiles, settings, hid } };
}

describe('ScanHubProvider: wiring', () => {
  afterEach(() => { cleanup(); });

  it('routes a scan from its own HID controller into the hub and disposes it on unmount', async () => {
    const { device, fire, listeners, props } = hidSetup();
    const { result, unmount } = renderHook(() => ({ hub: useScanHub(), controls: useDeviceScanControls() }), {
      wrapper: ({ children }) => <ScanHubProvider {...props}>{children}</ScanHubProvider>,
    });
    await waitFor(() => expect(result.current.controls.hid.connected).toBe(true));
    const received: ScanEvent[] = [];
    const subscription = result.current.hub.events$.subscribe((event) => received.push(event));
    fire('12345678');
    subscription.unsubscribe();
    expect(received).toMatchObject([{ code: '12345678', source: { kind: 'hid-pos' } }]);

    unmount();
    await waitFor(() => expect(device.close).toHaveBeenCalledTimes(1));
    expect(listeners.size).toBe(0);
  });

  it('defaults serial and hid to navigator.serial and navigator.hid', async () => {
    const { serial, hid, props } = setup();
    Object.defineProperty(navigator, 'serial', { value: serial, configurable: true });
    Object.defineProperty(navigator, 'hid', { value: hid, configurable: true });
    try {
      const { result } = renderHook(() => useDeviceScanControls(), {
        wrapper: ({ children }) => <ScanHubProvider {...props} serial={undefined} hid={undefined}>{children}</ScanHubProvider>,
      });
      await waitFor(() => expect(result.current.serial.available).toBe(true));
      expect(result.current.hid.available).toBe(true);
    } finally {
      Reflect.deleteProperty(navigator, 'serial');
      Reflect.deleteProperty(navigator, 'hid');
    }
  });

  it('reports hid unavailable with neither a hid prop nor navigator.hid', async () => {
    const { props } = setup();
    expect('hid' in navigator).toBe(false);
    const { result } = renderHook(() => useDeviceScanControls(), {
      wrapper: ({ children }) => <ScanHubProvider {...props} hid={undefined}>{children}</ScanHubProvider>,
    });
    await waitFor(() => expect(result.current.serial.available).toBe(true));
    expect(result.current.hid.available).toBe(false);
  });

  it('sends a device error to the latest onError', async () => {
    const { props } = setup();
    const second = vi.fn();
    let controls = inertDeviceScanControls;
    function Probe() {
      controls = useDeviceScanControls();
      return null;
    }
    const { rerender } = render(<ScanHubProvider {...props}><Probe /></ScanHubProvider>);
    await waitFor(() => expect(controls.serial.available).toBe(true));
    rerender(<ScanHubProvider {...props} onError={second}><Probe /></ScanHubProvider>);

    await act(() => controls.serial.connect());
    expect(second).toHaveBeenCalledExactlyOnceWith(expect.any(DOMException), { phase: 'connect', cancelled: true });
    expect(props.onError).not.toHaveBeenCalled();
  });
});
