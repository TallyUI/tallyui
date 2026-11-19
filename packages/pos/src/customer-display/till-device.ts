import { DisplaySignallingError, type DisplaySignalling, type SyncContext, type TillDevice } from '@tallyui/core';
import { quietly } from './snapshot-fallback';

/** Where the till keeps its device key (TallyUI#754): next to its device id, never replicated. */
export interface TillDeviceKeyStore {
  load(): Promise<string | null>;
  save(key: string): Promise<void>;
  clear(): Promise<void>;
}
export interface TillDeviceOptions {
  signalling: DisplaySignalling;
  /** The till's device id: an identifier, not a credential. */
  deviceId: string;
  keys: TillDeviceKeyStore;
  /** A key store failure on save or clear, for logs. Never throws into the handle. */
  onError?: (error: unknown) => void;
}
/** The till's credential for every till-side call; `createTillPairing` and `createTillDisplayService` share one. */
export interface TillDeviceHandle {
  /** The stored key with the device id, registering first when none is stored (one registration for concurrent callers). */
  device(ctx: SyncContext): Promise<TillDevice>;
  /** Clears the stored key after the server refused it, so the next `device` registers again. */
  refused(): Promise<void>;
}

/** The till side of the device key (ADR-085, TallyUI#754): it loads the key, or registers once and saves it. */
export function createTillDevice(options: TillDeviceOptions): TillDeviceHandle {
  const { signalling, deviceId, keys } = options;
  const report = (error: unknown) => quietly(() => options.onError?.(error));
  let loading: Promise<string> | null = null;
  const key = async (ctx: SyncContext): Promise<string> => {
    const stored = await keys.load();
    if (stored) return stored;
    const { deviceKey } = await signalling.registerDevice(ctx, deviceId);
    await keys.save(deviceKey).catch(report);
    return deviceKey;
  };
  return {
    async device(ctx) {
      loading ??= key(ctx).finally(() => { loading = null; });
      return { deviceId, deviceKey: await loading };
    },
    refused: () => keys.clear().catch(report),
  };
}

/**
 * Runs one till call with the till's device. On `device_refused` it clears the refused key, unless a concurrent call
 * already replaced it, and tries once more with a new registration; a refused registration is not retried.
 */
export async function withTillDevice<T>(handle: TillDeviceHandle, ctx: SyncContext, work: (device: TillDevice) => Promise<T>): Promise<T> {
  const device = await handle.device(ctx);
  try {
    return await work(device);
  } catch (error) {
    if (!(error instanceof DisplaySignallingError && error.code === 'device_refused')) throw error;
    if ((await handle.device(ctx)).deviceKey === device.deviceKey) await handle.refused();
    return work(await handle.device(ctx));
  }
}
