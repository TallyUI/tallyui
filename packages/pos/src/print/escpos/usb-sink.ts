/**
 * A WebUSB sink for `createEscPosTransport`. The app supplies the `USBDevice` from `navigator.usb.requestDevice` (which
 * needs a user gesture) or `navigator.usb.getDevices`, and keeps it between jobs. The sink holds no vendor code
 * (ADR-084 decision 2) and never closes the device: the app releases it when it is done. The sink sets no timeout on a
 * transfer.
 */
import { PrintError } from '../types';
import type { EscPosSink } from './transport';

interface WebUsbEndpoint { readonly endpointNumber: number; readonly direction: 'in' | 'out'; readonly type: 'bulk' | 'interrupt' | 'isochronous' }

/** Shaped on the DOM `USBDevice`; e2e/web/webusb-sink.spec.ts checks these member names in Chromium. */
export interface WebUsbDevice {
  readonly opened: boolean;
  readonly configuration?: {
    readonly interfaces: readonly {
      readonly interfaceNumber: number;
      readonly claimed: boolean;
      readonly alternate: { readonly interfaceClass: number; readonly endpoints: readonly WebUsbEndpoint[] };
    }[];
  } | null;
  readonly productName?: string | null;
  open(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  clearHalt(direction: 'in' | 'out', endpointNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array<ArrayBuffer>): Promise<{ status: 'ok' | 'stall' | 'babble'; bytesWritten: number }>;
}

export interface WebUsbSinkOptions {
  device: WebUsbDevice;
  /** Bytes per `transferOut`: a positive integer, default 4096. */
  chunkSize?: number;
}

// Keeps a single transfer bounded; it is not a pacing control (each transfer is awaited, so the device sets the pace).
const USB_CHUNK_SIZE = 4096;

// The USB printer class code (bInterfaceClass 7).
const USB_PRINTER_CLASS = 7;

/**
 * The interface to print to, and its bulk OUT endpoint's number: the first printer-class interface with a bulk OUT
 * endpoint, or, when there is none, the first interface of any class with a bulk OUT endpoint.
 */
function bulkOut(device: WebUsbDevice) {
  const candidates = (device.configuration?.interfaces ?? []).flatMap((usbInterface) => {
    const endpoint = usbInterface.alternate.endpoints.find(({ direction, type }) => direction === 'out' && type === 'bulk');
    return endpoint ? [{ usbInterface, endpointNumber: endpoint.endpointNumber }] : [];
  });
  return candidates.find(({ usbInterface }) => usbInterface.alternate.interfaceClass === USB_PRINTER_CLASS) ?? candidates[0] ?? null;
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
      if (device.configuration == null) await step('selectConfiguration(1)', () => device.selectConfiguration(1));
      const target = bulkOut(device);
      if (!target) throw new PrintError('unsupported', `${name()} has no bulk OUT endpoint to print to`);
      const { usbInterface: { interfaceNumber, claimed }, endpointNumber } = target;
      if (!claimed) await step(`claimInterface(${interfaceNumber})`, () => device.claimInterface(interfaceNumber));
      for (let i = 0; i < bytes.length; i += chunkSize) {
        // slice, not subarray: each transfer gets its own ArrayBuffer-backed copy.
        const chunk = bytes.slice(i, i + chunkSize);
        const result = await step(`transferOut(${endpointNumber})`, () => device.transferOut(endpointNumber, chunk));
        if (result.status === 'ok') continue;
        // A stalled endpoint stays halted until cleared, so clear it for the next job; this job still fails.
        if (result.status === 'stall') await device.clearHalt('out', endpointNumber).catch(() => undefined);
        throw new PrintError('failed', `${name()}: transferOut(${endpointNumber}) ended with status ${result.status}`);
      }
    },
  };
}
