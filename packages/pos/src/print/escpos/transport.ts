/**
 * A `PrintTransport` that writes ESC/POS bytes to a sink the app supplies (WebUSB, WebSerial, a TCP socket,
 * Bluetooth). It holds no device code; ADR-084 decision 2 keeps vendor SDKs out of the MIT packages. Run it
 * through `createPrintQueue`, like the system transport, so one printer prints one job at a time.
 */
import type { ReceiptTemplateOptions } from '../../receipt-template/template-data';
import type { PrinterProfile } from '../printer-profiles';
import { PrintError, type PrintJob, type PrintTransport } from '../types';
import { encodeEscPos } from './encode';

export interface EscPosSink {
  write(bytes: Uint8Array): Promise<void>;
}

export interface EscPosTransportOptions {
  sink: EscPosSink;
  profile: PrinterProfile;
  format?: Pick<ReceiptTemplateOptions, 'formatMoney' | 'formatDate' | 'paymentLabel'>;
}

export function createEscPosTransport({ sink, profile, format }: EscPosTransportOptions): PrintTransport {
  return {
    name: 'escpos',
    async print(job: PrintJob) {
      if (profile.language !== undefined && profile.language !== 'esc-pos') {
        throw new PrintError('unsupported', `Printer ${profile.name} speaks ${profile.language}, not ESC/POS`);
      }
      // The profile's documented defaults: 42 columns, cut on, drawer off, pin 2.
      const bytes = job.bytes ?? (job.receipt && encodeEscPos(job.receipt, {
        ...format,
        columns: profile.columns ?? 42,
        codePage: profile.codePage,
        cut: profile.autoCut ?? true,
        openDrawer: profile.autoOpenDrawer ?? false,
        drawerConnector: profile.drawerConnector ?? 'pin2',
      }));
      if (!bytes) throw new PrintError('unsupported', `ESC/POS prints bytes or a receipt; job ${job.id} has neither`);
      try {
        await sink.write(bytes);
      } catch (error) {
        throw new PrintError('failed', error instanceof Error ? error.message : String(error), { cause: error });
      }
    },
  };
}
