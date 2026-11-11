// Ported from WCPOS v2 packages/core/src/screens/main/pos/products/use-hid-scan.web.ts (monorepo 85ecbd43f), as a framework-agnostic controller.
/** WebHID (USB HID POS, usage page 0x8C) barcode source. Each input report carries a complete decoded barcode;
 * decode it, dedup via the scan session, and emit `hid-pos` ScanEvents. */
import { isChooserCancel } from './chooser-cancel';
import { scannerDeviceKey } from './device-identity';
import { createDeviceScannerStateCell, type DeviceScanner, type DeviceScannerErrorHandler, type DeviceScannerSettings,
  type ScannerProfileStore } from './device-scanner';
import { decodeHidPosReport } from './hid-pos-decoder';
import type { ScanEvent } from './scan-events';
import { createScanSession } from './scan-session';

/** USB HID Point-of-Sale usage page: the structured barcode-scanner mode. */
export const HID_POS_USAGE_PAGE = 0x8c;

// Minimal WebHID typings (not in the TS DOM lib).
export interface HidInputReportEventLike { data: DataView; reportId: number }
export interface HidDeviceLike {
  productName?: string;
  vendorId: number;
  productId: number;
  collections?: { usagePage?: number }[];
  open: () => Promise<void>;
  close: () => Promise<void>;
  addEventListener: (type: 'inputreport', listener: (event: HidInputReportEventLike) => void) => void;
  removeEventListener: (type: 'inputreport', listener: (event: HidInputReportEventLike) => void) => void;
}
export interface HidLike {
  requestDevice: (options: { filters: { usagePage?: number }[] }) => Promise<HidDeviceLike[]>;
  getDevices: () => Promise<HidDeviceLike[]>;
}

export interface HidScannerOptions {
  /** navigator.hid, or undefined where WebHID is absent (then available is false and every call is a no-op). */
  hid: HidLike | undefined;
  profiles: ScannerProfileStore;
  /** prefix and suffix are unused by HID-POS (a report is already one framed code); minChars is the gate. */
  getSettings: () => DeviceScannerSettings;
  emit: (event: ScanEvent) => void;
  onError?: DeviceScannerErrorHandler;
  now?: () => number;
}

const DISCONNECTED = { connected: false, connectedDeviceKey: null } as const;

const hidDeviceKey = (device: HidDeviceLike) =>
  scannerDeviceKey({ connectionType: 'hid-pos', vendorId: device.vendorId, productId: device.productId });

function dataViewToBytes(view: DataView): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < view.byteLength; i += 1) bytes.push(view.getUint8(i));
  return bytes;
}

export function createHidScanner(options: HidScannerOptions): DeviceScanner {
  const { hid, profiles, getSettings, emit, onError } = options;
  const now = options.now ?? Date.now;
  const state = createDeviceScannerStateCell();

  let activeDevice: HidDeviceLike | null = null;
  let activeListener: ((event: HidInputReportEventLike) => void) | null = null;
  let attachRequest = 0;
  let lifecycleQueue: Promise<void> = Promise.resolve();
  let disposed = false;
  let disposing: Promise<void> | null = null;

  const session = createScanSession({
    onAccept: (code, symbology) => {
      if (code.length < getSettings().minChars) return;
      emit({ code, ...(symbology !== undefined ? { symbology } : {}), source: { kind: 'hid-pos' }, timestamp: now() });
    },
  });

  const teardown = async () => {
    const device = activeDevice;
    const listener = activeListener;
    activeDevice = null;
    activeListener = null;
    state.set(DISCONNECTED);
    if (!device) return;
    // Remove the listener before closing, so a report racing the close is never delivered.
    if (listener) device.removeEventListener('inputreport', listener);
    await device.close().catch(() => undefined);
  };

  const isStale = (request: number) => disposed || request !== attachRequest;

  const attachDevice = async (device: HidDeviceLike, save: boolean) => {
    const request = ++attachRequest;
    let attached = false;
    const pending = lifecycleQueue.then(async () => {
      if (isStale(request)) return;
      await teardown();
      if (isStale(request)) return;
      await device.open();
      if (isStale(request)) {
        await device.close().catch(() => undefined);
        return;
      }
      const listener = (event: HidInputReportEventLike) => {
        // WebHID delivers event.data as the report body *without* the report id (it is carried separately as
        // event.reportId), so decode it directly: prepending it would read a report id of zero as the length.
        const decoded = decodeHidPosReport(dataViewToBytes(event.data));
        if (decoded) session.offer(decoded.code, decoded.symbology);
      };
      device.addEventListener('inputreport', listener);
      activeDevice = device;
      activeListener = listener;
      session.reset();
      state.set({ connected: true, connectedDeviceKey: hidDeviceKey(device) });
      attached = true;
    });
    lifecycleQueue = pending.catch(() => undefined);
    await pending;
    if (!attached || !save) return;
    // Upsert on the canonical key: re-connecting an already-registered scanner refreshes it instead of adding a
    // second row. An absent product name stays empty rather than an invented English label.
    await profiles.save({
      deviceKey: hidDeviceKey(device), name: '', connectionType: 'hid-pos', deviceName: device.productName || '',
      vendorId: device.vendorId, productId: device.productId, createdAt: new Date(now()).toISOString(),
    });
  };

  const connect = async () => {
    if (!hid || disposed) return;
    try {
      const devices = await hid.requestDevice({ filters: [{ usagePage: HID_POS_USAGE_PAGE }] });
      if (devices[0]) await attachDevice(devices[0], true);
    } catch (error) {
      // Closing the browser's device chooser is a cancel, not a fault.
      onError?.(error, { phase: 'connect', cancelled: isChooserCancel(error) });
    }
  };

  // Silently re-open an already-granted HID device matching a saved hid-pos profile (the browser remembers granted
  // devices across reloads). An HID key always carries vendor and product, so the first match is taken.
  const reopenSaved = async () => {
    if (!hid || disposed) return;
    try {
      const [devices, saved] = await Promise.all([hid.getDevices(), profiles.read(['hid-pos'])]);
      if (disposed) return;
      const savedKeys = new Set(saved.map((profile) => profile.deviceKey));
      const match = devices.find((device) => savedKeys.has(hidDeviceKey(device)));
      if (match) await attachDevice(match, false);
    } catch (error) {
      // A silent best-effort reopen (another tab may hold the device).
      onError?.(error, { phase: 'reopen', cancelled: false });
    }
  };

  const queueTeardown = async () => {
    attachRequest += 1;
    const pending = lifecycleQueue.then(teardown);
    lifecycleQueue = pending.catch(() => undefined);
    await pending;
    state.set(DISCONNECTED);
  };

  return {
    available: !!hid, connect, reopenSaved,
    disconnect: () => (disposed ? Promise.resolve() : queueTeardown()),
    dispose: () => {
      if (!disposing) {
        // Release the device and its listener on host teardown (logout, unmount).
        disposed = true;
        disposing = queueTeardown();
      }
      return disposing;
    },
    getState: state.get, subscribe: state.subscribe,
  };
}
