/**
 * A WebUSB sink for `createEscPosTransport`. The app supplies the `USBDevice` from `navigator.usb.requestDevice` (which
 * needs a user gesture) or `navigator.usb.getDevices`, and keeps it between jobs. The sink holds no vendor code
 * (ADR-084 decision 2) and never closes the device: the app releases it when it is done.
 */
import { PrintError } from '../types';
import type { EscPosSink } from './transport';

interface WebUsbEndpoint { readonly endpointNumber: number; readonly direction: 'in' | 'out'; readonly type: 'bulk' | 'interrupt' | 'isochronous' }

/** The members of the DOM `USBDevice` this sink reads or calls; a real `USBDevice` is assignable to it. */
export interface WebUsbDevice {
  readonly opened: boolean;
  readonly configuration: {
    readonly interfaces: readonly {
      readonly interfaceNumber: number;
      readonly claimed: boolean;
      readonly alternate: { readonly endpoints: readonly WebUsbEndpoint[] };
    }[];
  } | null;
  readonly productName?: string;
  open(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<{ status: 'ok' | 'stall' | 'babble'; bytesWritten: number }>;
}

export interface WebUsbSinkOptions {
  device: WebUsbDevice;
  /** Bytes per `transferOut`. Default `USB_CHUNK_SIZE`. */
  chunkSize?: number;
}

// Keeps a single transfer bounded; it is not a pacing control (each transfer is awaited, so the device sets the pace).
const USB_CHUNK_SIZE = 4096;

/** The first interface with a bulk OUT endpoint, and that endpoint's number. */
function bulkOut(device: WebUsbDevice) {
  for (const usbInterface of device.configuration?.interfaces ?? []) {
    const endpoint = usbInterface.alternate.endpoints.find(({ direction, type }) => direction === 'out' && type === 'bulk');
    if (endpoint) return { usbInterface, endpointNumber: endpoint.endpointNumber };
  }
  return null;
}

export function createWebUsbSink({ device, chunkSize = USB_CHUNK_SIZE }: WebUsbSinkOptions): EscPosSink {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError(`chunkSize must be a positive integer, not ${chunkSize}`);
  const name = () => device.productName || 'USB printer';
  async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw new PrintError('failed', `${name()}: ${label} failed: ${error instanceof Error ? error.message : error}`, { cause: error });
    }
  }
  return {
    async write(bytes) {
      // Read the device's state on every write, so a write after the app reopens the device works.
      if (!device.opened) await step('open', () => device.open());
      if (!device.configuration) await step('selectConfiguration(1)', () => device.selectConfiguration(1));
      const target = bulkOut(device);
      if (!target) throw new PrintError('unsupported', `${name()} has no bulk OUT endpoint to print to`);
      const { usbInterface: { interfaceNumber, claimed }, endpointNumber } = target;
      if (!claimed) await step(`claimInterface(${interfaceNumber})`, () => device.claimInterface(interfaceNumber));
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        const result = await step(`transferOut(${endpointNumber})`, () => device.transferOut(endpointNumber, chunk));
        if (result.status !== 'ok') throw new PrintError('failed', `${name()}: transferOut(${endpointNumber}) ended with status ${result.status}`);
      }
    },
  };
}
