/** Types and helpers shared by the framework-agnostic device-scanner controllers (Web Serial, WebHID). A controller
 * takes its dependencies as arguments, so a host binds it to its own state. */
import type { ScannerConnectionType } from './device-identity';
import { readScannerProfiles, saveScannerProfile, type ScannerProfile, type ScannerProfileCollection } from './scanner-profiles';

/** What the controller needs from profile storage. The RxDB collection adapts to it with
 * scannerProfileStore(); tests and the browser proof pass an in-memory one. */
export interface ScannerProfileStore {
  read: (types: readonly ScannerConnectionType[]) => Promise<ScannerProfile[]>;
  save: (profile: ScannerProfile) => Promise<void>;
}

export function scannerProfileStore(collection: ScannerProfileCollection): ScannerProfileStore {
  return {
    read: (types) => readScannerProfiles(collection, types),
    save: (profile) => saveScannerProfile(collection, profile),
  };
}

export interface DeviceScannerSettings { prefix: string; suffix: string; minChars: number }
export interface DeviceScannerState { connected: boolean; connectedDeviceKey: string | null }
export type DeviceScannerErrorPhase = 'connect' | 'reopen';
/** cancelled is isChooserCancel(error): the cashier closed the chooser. */
export type DeviceScannerErrorHandler = (error: unknown, info: { phase: DeviceScannerErrorPhase; cancelled: boolean }) => void;

/** A tiny observable state cell: get, set (notifies only on change, by value), subscribe (returns unsubscribe). */
export interface DeviceScannerStateCell {
  get: () => DeviceScannerState;
  set: (next: DeviceScannerState) => void;
  subscribe: (listener: (state: DeviceScannerState) => void) => () => void;
}

export function createDeviceScannerStateCell(): DeviceScannerStateCell {
  let state: DeviceScannerState = { connected: false, connectedDeviceKey: null };
  const listeners = new Set<(state: DeviceScannerState) => void>();
  return {
    get: () => state,
    set: (next) => {
      if (next.connected === state.connected && next.connectedDeviceKey === state.connectedDeviceKey) return;
      state = { connected: next.connected, connectedDeviceKey: next.connectedDeviceKey };
      for (const listener of [...listeners]) listener(state);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** The controller surface part 5's hook binds to, shared by the serial and HID controllers. */
export interface DeviceScanner {
  readonly available: boolean;
  /** Opens the browser chooser: call it inside a user gesture. Never rejects; failures go to onError. */
  connect: () => Promise<void>;
  /** Silently reopens the one granted device that matches a saved profile. Never rejects; failures go to onError. */
  reopenSaved: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** disconnect, and every later call is a no-op (host teardown). */
  dispose: () => Promise<void>;
  getState: () => DeviceScannerState;
  subscribe: (listener: (state: DeviceScannerState) => void) => () => void;
}
