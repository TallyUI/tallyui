// Ported from WCPOS v2 packages/core/src/screens/main/pos/products/use-serial-scan.web.ts (monorepo 85ecbd43f), as a framework-agnostic controller.
/** Web Serial (USB-CDC / Bluetooth-SPP) barcode source. Reads the port's byte stream, frames it into barcodes with
 * the shared serial-line decoder, dedups via the scan session, and emits `serial` ScanEvents. */
import { isChooserCancel } from './chooser-cancel';
import { normalizeUuid, scannerDeviceKey, type ScannerIdentity } from './device-identity';
import { createDeviceScannerStateCell, type DeviceScanner, type DeviceScannerErrorHandler, type DeviceScannerSettings,
  type ScannerProfileStore } from './device-scanner';
import type { ScanEvent } from './scan-events';
import { createScanSession } from './scan-session';
import { createSerialLineDecoder } from './serial-line-decoder';

export const DEFAULT_SERIAL_BAUD_RATE = 9600;

// Chromium's chooser only lists unmapped Bluetooth RFCOMM ports whose service class is the standard Serial Port
// Profile (0x1101); any other UUID must be named in `allowedBluetoothServiceClassIds` or the device is silently absent
// (https://developer.chrome.com/blog/serial-over-bluetooth). Scanners with a vendor-specific RFCOMM service go here as
// we learn their UUIDs; saved profiles' UUIDs are added at request time. Known limitation: a FIRST-TIME scanner with a
// vendor UUID not yet in this list cannot appear in the chooser at all; manual UUID entry is planned for setup.
export const STANDARD_SPP_SERVICE_CLASS_ID = '00001101-0000-1000-8000-00805f9b34fb';
const KNOWN_SCANNER_BLUETOOTH_SERVICE_CLASS_IDS: string[] = [STANDARD_SPP_SERVICE_CLASS_ID];

// Minimal Web Serial typings (not in the TS DOM lib).
/** bluetoothServiceClassId: the service class UUID of a Bluetooth RFCOMM port (no USB ids on those). */
export interface SerialPortInfoLike { usbVendorId?: number; usbProductId?: number; bluetoothServiceClassId?: string }
export interface SerialPortLike {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  getInfo: () => SerialPortInfoLike;
}
export interface SerialLike {
  requestPort: (options?: { allowedBluetoothServiceClassIds?: string[] }) => Promise<SerialPortLike>;
  getPorts: () => Promise<SerialPortLike[]>;
}

/** A Web Serial port is either a USB-CDC device (USB ids, no service class) or a Bluetooth RFCOMM port (service
 * class, no USB ids). One place decides which, so the connect path and the silent-reconnect path can never disagree
 * about a port's identity: they used to, and the Bluetooth branch compared UUIDs case-sensitively on read while
 * writing them lowercased. */
export function serialPortIdentity(info: SerialPortInfoLike): ScannerIdentity | null {
  if (info.usbVendorId !== undefined && info.usbProductId !== undefined) {
    return { connectionType: 'usb-serial', vendorId: info.usbVendorId, productId: info.usbProductId };
  }
  if (info.bluetoothServiceClassId !== undefined) {
    return { connectionType: 'bluetooth-spp', serviceUuid: info.bluetoothServiceClassId };
  }
  return null;
}

export interface SerialScannerOptions {
  /** navigator.serial, or undefined where Web Serial is absent (then available is false and every call is a no-op). */
  serial: SerialLike | undefined;
  profiles: ScannerProfileStore;
  getSettings: () => DeviceScannerSettings;
  emit: (event: ScanEvent) => void;
  onError?: DeviceScannerErrorHandler;
  now?: () => number;
}

const DISCONNECTED = { connected: false, connectedDeviceKey: null } as const;

export function createSerialScanner(options: SerialScannerOptions): DeviceScanner {
  const { serial, profiles, getSettings, emit, onError } = options;
  const now = options.now ?? Date.now;
  const state = createDeviceScannerStateCell();

  let activePort: SerialPortLike | null = null;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let closing = false;
  let attachRequest = 0;
  let lifecycleQueue: Promise<void> = Promise.resolve();
  let disposed = false;
  let disposing: Promise<void> | null = null;

  const session = createScanSession({
    onAccept: (code) => {
      if (code.length < getSettings().minChars) return;
      emit({ code, source: { kind: 'serial' }, timestamp: now() });
    },
  });
  const decoder = createSerialLineDecoder({
    getSettings: () => ({ prefix: getSettings().prefix, suffix: getSettings().suffix }),
    onScan: (code) => session.offer(code),
  });

  const readLoop = async (port: SerialPortLike) => {
    const textDecoder = new TextDecoder();
    try {
      while (port.readable && !closing) {
        const reader = port.readable.getReader();
        activeReader = reader;
        try {
          for (let result = await reader.read(); !result.done; result = await reader.read()) {
            decoder.push(textDecoder.decode(result.value, { stream: true }));
          }
        } catch {
          // A read error usually means the port was cancelled/closed.
          break;
        } finally {
          reader.releaseLock();
          if (activeReader === reader) activeReader = null;
        }
        break;
      }
    } finally {
      // Only the loop that owns the active port clears the state: a replaced port's loop unwinds late.
      if (activePort === port) state.set(DISCONNECTED);
    }
  };

  const teardown = async () => {
    const reader = activeReader;
    const port = activePort;
    activeReader = null;
    activePort = null;
    state.set(DISCONNECTED);
    closing = true;
    try {
      // Cancel the reader before closing the port: an abort signal alone did not release a pending reader.read().
      await reader?.cancel().catch(() => undefined);
      if (port) await port.close().catch(() => undefined);
    } finally {
      closing = false;
    }
  };

  const isStale = (request: number) => disposed || request !== attachRequest;

  const attachPort = async (port: SerialPortLike, save: boolean) => {
    const request = ++attachRequest;
    let attached = false;
    const pending = lifecycleQueue.then(async () => {
      if (isStale(request)) return;
      await teardown();
      if (isStale(request)) return;
      await port.open({ baudRate: DEFAULT_SERIAL_BAUD_RATE });
      if (isStale(request)) {
        await port.close().catch(() => undefined);
        return;
      }
      activePort = port;
      const openedIdentity = serialPortIdentity(port.getInfo());
      state.set({ connected: true, connectedDeviceKey: openedIdentity ? scannerDeviceKey(openedIdentity) : null });
      decoder.reset();
      session.reset();
      // The read loop runs for the port's lifetime.
      void readLoop(port).catch(() => undefined);
      attached = true;
    });
    lifecycleQueue = pending.catch(() => undefined);
    await pending;
    if (!attached || !save) return;
    const info = port.getInfo();
    const identity = serialPortIdentity(info);
    if (!identity) return;
    // deviceKey is the primary key, so a re-registration of the same scanner is an upsert rather than a duplicate
    // row: no read-then-insert dup check, and no race between two rapid Connect presses. Web Serial reports no product
    // name for either transport, so deviceName stays empty: an invented English label would freeze one language into
    // the document and shadow the type label the row derives from connectionType. Undefined keys are left out.
    const { usbVendorId: vendorId, usbProductId: productId, bluetoothServiceClassId: serviceUuid } = info;
    await profiles.save({
      deviceKey: scannerDeviceKey(identity), name: '', connectionType: identity.connectionType, deviceName: '',
      ...(vendorId !== undefined ? { vendorId } : {}), ...(productId !== undefined ? { productId } : {}),
      ...(serviceUuid ? { serviceUuid: normalizeUuid(serviceUuid) } : {}), createdAt: new Date(now()).toISOString(),
    });
  };

  const connect = async () => {
    if (!serial || disposed) return;
    try {
      // A saved scanner may use a vendor-specific RFCOMM service class; include saved UUIDs so it stays in the chooser.
      const saved = await profiles.read(['bluetooth-spp']);
      const allowedBluetoothServiceClassIds = Array.from(new Set([
        ...KNOWN_SCANNER_BLUETOOTH_SERVICE_CLASS_IDS,
        ...saved.map((profile) => profile.serviceUuid)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ]));
      const port = await serial.requestPort({ allowedBluetoothServiceClassIds });
      await attachPort(port, true);
    } catch (error) {
      // Closing the browser's port chooser throws NotFoundError: a cancel, not a fault.
      onError?.(error, { phase: 'connect', cancelled: isChooserCancel(error) });
    }
  };

  // Silently re-open an already-granted port matching a saved profile (the browser remembers grants across reloads).
  const reopenSaved = async () => {
    if (!serial || disposed) return;
    try {
      const [ports, saved] = await Promise.all([serial.getPorts(), profiles.read(['usb-serial', 'bluetooth-spp'])]);
      if (disposed) return;
      // Accepted contract: a key identifies a service or model, not a physical unit (the same ceiling as vid:pid
      // for two identical USB scanners). One unambiguous match reconnects silently; ambiguity waits for a chooser pick.
      const savedKeys = new Set(saved.map((profile) => profile.deviceKey));
      const matches = ports.filter((port) => {
        const identity = serialPortIdentity(port.getInfo());
        return identity !== null && savedKeys.has(scannerDeviceKey(identity));
      });
      if (matches.length === 1) await attachPort(matches[0], false);
    } catch (error) {
      // A silent best-effort reopen (another tab may hold the port).
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
    available: !!serial, connect, reopenSaved,
    disconnect: () => (disposed ? Promise.resolve() : queueTeardown()),
    dispose: () => {
      if (!disposing) {
        // Release the port and read loop on host teardown (logout, unmount).
        disposed = true;
        disposing = queueTeardown();
      }
      return disposing;
    },
    getState: state.get, subscribe: state.subscribe,
  };
}
