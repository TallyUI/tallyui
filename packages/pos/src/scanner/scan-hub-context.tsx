// Ported from WCPOS v2 packages/core/src/screens/main/hooks/barcodes/scan-hub-context.tsx (monorepo 85ecbd43f).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import type { DeviceScanner, DeviceScannerErrorHandler, DeviceScannerSettings, DeviceScannerState,
  ScannerProfileStore } from './device-scanner';
import { createHidScanner, type HidLike } from './hid-scanner';
import { createScanHub, inertScanHub, type ScanHub } from './scan-events';
import { createSerialScanner, type SerialLike, type SerialScannerOptions } from './serial-scanner';

/** One device source's connect controls and live status (v2's UseSerialScanResult shape). */
export interface DeviceScanControl {
  available: boolean;
  /** Opens the browser chooser: call it inside a click gesture. */
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  connected: boolean;
  /** deviceKey of the scanner this source holds open, or null: tells which saved profile is live. */
  connectedDeviceKey: string | null;
}
export interface DeviceScanControls { serial: DeviceScanControl; hid: DeviceScanControl }

const inertControl: DeviceScanControl = {
  available: false,
  connect: async () => undefined,
  disconnect: async () => undefined,
  connected: false,
  connectedDeviceKey: null,
};
export const inertDeviceScanControls: DeviceScanControls = { serial: inertControl, hid: inertControl };

const ScanHubContext = createContext<ScanHub>(inertScanHub);
const DeviceScanControlsContext = createContext<DeviceScanControls>(inertDeviceScanControls);

export interface ScanHubProviderProps {
  children: ReactNode;
  /** Usually scannerProfileStore(db.collections.scanner_profiles). */
  profiles: ScannerProfileStore;
  /** Read at scan time: changing it does not reconnect. */
  settings: DeviceScannerSettings;
  /** Defaults to navigator.serial / navigator.hid where present (undefined elsewhere, e.g. native). */
  serial?: SerialLike;
  hid?: HidLike;
  onError?: DeviceScannerErrorHandler;
}

interface Controllers { serial: DeviceScanner; hid: DeviceScanner }

const DISCONNECTED: DeviceScannerState = { connected: false, connectedDeviceKey: null };
const noSubscription = () => () => undefined;
const browserNavigator = () =>
  (typeof navigator !== 'undefined' ? navigator : undefined) as { serial?: SerialLike; hid?: HidLike } | undefined;

function useDeviceScanControl(scanner: DeviceScanner | null): DeviceScanControl {
  const subscribe = useCallback(
    (listener: () => void) => (scanner ? scanner.subscribe(() => listener()) : noSubscription()),
    [scanner],
  );
  const getState = useCallback(() => (scanner ? scanner.getState() : DISCONNECTED), [scanner]);
  const state = useSyncExternalStore(subscribe, getState, getState);
  return useMemo(
    () => (scanner
      ? { available: scanner.available, connect: scanner.connect, disconnect: scanner.disconnect,
          connected: state.connected, connectedDeviceKey: state.connectedDeviceKey }
      : inertControl),
    [scanner, state],
  );
}

/** Owns the app-scoped scan hub and the direct (Web Serial, WebHID) scanner connections. Mounting it above
 * navigation keeps those connections alive between screens; on mount it silently reopens the saved scanners. */
export function ScanHubProvider({ children, ...props }: ScanHubProviderProps) {
  const latest = useRef(props);
  latest.current = props;
  const [hub] = useState(() => createScanHub());
  // Created in the mount effect, not at render, so StrictMode's mount, unmount and remount disposes the first pair
  // and replaces it, rather than leaving a disposed controller in use.
  const [controllers, setControllers] = useState<Controllers | null>(null);

  useEffect(() => {
    const nav = browserNavigator();
    // Every prop is read through the ref at call time, so a new prop never recreates a controller.
    const shared: Omit<SerialScannerOptions, 'serial'> = {
      profiles: {
        read: (types) => latest.current.profiles.read(types),
        save: (profile) => latest.current.profiles.save(profile),
      },
      getSettings: () => latest.current.settings,
      emit: hub.emit,
      onError: (error, info) => latest.current.onError?.(error, info),
    };
    const next: Controllers = {
      serial: createSerialScanner({ ...shared, serial: latest.current.serial ?? nav?.serial }),
      hid: createHidScanner({ ...shared, hid: latest.current.hid ?? nav?.hid }),
    };
    setControllers(next);
    void next.serial.reopenSaved();
    void next.hid.reopenSaved();
    return () => {
      void next.serial.dispose();
      void next.hid.dispose();
    };
  }, [hub]);

  const serial = useDeviceScanControl(controllers?.serial ?? null);
  const hid = useDeviceScanControl(controllers?.hid ?? null);
  const controls = useMemo<DeviceScanControls>(() => ({ serial, hid }), [serial, hid]);

  return (
    <ScanHubContext.Provider value={hub}>
      <DeviceScanControlsContext.Provider value={controls}>{children}</DeviceScanControlsContext.Provider>
    </ScanHubContext.Provider>
  );
}

/** The provider's hub, or inertScanHub with no provider. */
export function useScanHub(): ScanHub {
  return useContext(ScanHubContext);
}

/** The provider's controls, or inertDeviceScanControls with no provider. */
export function useDeviceScanControls(): DeviceScanControls {
  return useContext(DeviceScanControlsContext);
}
