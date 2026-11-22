/**
 * A Web Bluetooth sink for `createEscPosTransport`. The app supplies the `BluetoothDevice` from
 * `navigator.bluetooth.requestDevice` (which needs a user gesture), with `BLUETOOTH_PRINT_SERVICES` in
 * `optionalServices` so the sink may reach them, and keeps it between jobs. The sink holds no vendor code (ADR-084
 * decision 2). It connects GATT if it is not connected and never disconnects: the app decides when to. The sink sets
 * no timeout on a write.
 */
import { PrintError } from '../types';
import type { EscPosSink } from './transport';

// Each print profile's GATT service and its write characteristic, in probe order. Source: WCPOS v2
// packages/printer/src/transport/ble-profiles.ts (found on a Netum NT-1809).
const PRINT_PROFILES = [
  ['000018f0-0000-1000-8000-00805f9b34fb', '00002af1-0000-1000-8000-00805f9b34fb'],
  ['0000ff00-0000-1000-8000-00805f9b34fb', '0000ff02-0000-1000-8000-00805f9b34fb'],
  ['49535343-fe7d-4ae5-8fa9-9fafd205e455', '49535343-8841-43f4-a8d4-ecbe34729bb3'],
  ['e7810a71-73ae-499d-8c15-faa9aef0c3f2', 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'],
] as const;

/** The print services the sink probes, in order. The app passes them to `requestDevice` as `optionalServices`. */
export const BLUETOOTH_PRINT_SERVICES: readonly string[] = PRINT_PROFILES.map(([service]) => service);

interface WebBluetoothCharacteristic {
  readonly properties: { readonly write: boolean; readonly writeWithoutResponse: boolean };
  writeValueWithResponse(value: Uint8Array<ArrayBuffer>): Promise<void>;
  writeValueWithoutResponse(value: Uint8Array<ArrayBuffer>): Promise<void>;
}

interface WebBluetoothGattService {
  getCharacteristic(characteristic: string): Promise<WebBluetoothCharacteristic>;
}

interface WebBluetoothGattServer {
  readonly connected: boolean;
  connect(): Promise<unknown>;
  getPrimaryService(service: string): Promise<WebBluetoothGattService>;
}

/** Shaped on the DOM `BluetoothDevice`; e2e/web/webbluetooth-sink.spec.ts checks these member names in Chromium. */
export interface WebBluetoothDevice {
  readonly name?: string | null;
  readonly gatt?: WebBluetoothGattServer | null;
}

export interface WebBluetoothSinkOptions {
  device: WebBluetoothDevice;
  /** Bytes per GATT write: a positive integer, default 20. */
  chunkSize?: number;
}

// v2's chunk size: 20 bytes is the payload of one write at BLE's default ATT MTU of 23 (3 bytes go to the header).
const BLE_CHUNK_SIZE = 20;
// v2's pause between chunks: a write without response is not acknowledged, so the pause keeps the sink from
// outrunning the printer.
const BLE_CHUNK_PAUSE_MS = 20;
// v2's settle after the last chunk: its response says the printer has the bytes, not that it has printed them, so
// the sink waits for the printer to drain before the next job.
const BLE_SETTLE_MS = 300;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The first known print profile's characteristic that takes writes; each probe that rejects moves on to the next. */
async function printCharacteristic(gatt: WebBluetoothGattServer) {
  for (const [service, characteristic] of PRINT_PROFILES) {
    try {
      const found = await (await gatt.getPrimaryService(service)).getCharacteristic(characteristic);
      if (found.properties.write) return found;
    } catch {
      // The device lacks this service or characteristic: try the next profile.
    }
  }
  return null;
}

export function createWebBluetoothSink({ device, chunkSize = BLE_CHUNK_SIZE }: WebBluetoothSinkOptions): EscPosSink {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError(`chunkSize must be a positive integer, not ${chunkSize}`);
  const name = () => device.name || 'Bluetooth printer';
  async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw new PrintError('failed', `${name()}: ${label} failed: ${error instanceof Error ? error.message : error}`, { cause: error });
    }
  }
  return {
    async write(bytes) {
      const { gatt } = device;
      if (!gatt) throw new PrintError('unsupported', `${name()} has no GATT server to print to`);
      // Read the link and probe on every write, so a write after the link drops reconnects and finds the service again.
      if (!gatt.connected) await step('connect', () => gatt.connect());
      const target = await printCharacteristic(gatt);
      if (!target) throw new PrintError('unsupported', `${name()}: no known print service was found; nothing was written`);
      for (let i = 0; i < bytes.length; i += chunkSize) {
        // slice, not subarray: each write gets its own ArrayBuffer-backed copy.
        const chunk = bytes.slice(i, i + chunkSize);
        const last = i + chunkSize >= bytes.length;
        const chunkLabel = `chunk ${i / chunkSize + 1}`;
        if (last || !target.properties.writeWithoutResponse) {
          await step(`writeValueWithResponse (${chunkLabel})`, () => target.writeValueWithResponse(chunk));
        } else {
          await step(`writeValueWithoutResponse (${chunkLabel})`, () => target.writeValueWithoutResponse(chunk));
        }
        await pause(last ? BLE_SETTLE_MS : BLE_CHUNK_PAUSE_MS);
      }
    },
  };
}
