/**
 * The printing seam. Ported from WCPOS v2 `packages/printer/src/types.ts` (monorepo main): v2's
 * `PrinterTransport` has `printRaw(bytes)` and `printHtml(html)`; here one `print(job)` takes a job that
 * carries HTML, bytes or both, and each transport prints what it can.
 */
import type { ReceiptData } from '../receipt/types';

export type PrintJobKind = 'receipt' | 'report' | 'test';

export interface PrintJob {
  id: string;
  kind: PrintJobKind;
  /** Rendered HTML, for the system dialog (see `renderReceiptHtml`). */
  html?: string;
  /** Pre-encoded printer bytes (ESC/POS and the like), for a raw transport. */
  bytes?: Uint8Array;
  /** The receipt itself, for a transport that lays it out (`createEscPosTransport`). */
  receipt?: ReceiptData;
}

/** `unsupported`: this transport cannot print the job; `unavailable`: the platform has no way to print; `failed`: the print went wrong. */
export type PrintErrorCode = 'unsupported' | 'unavailable' | 'failed';

export class PrintError extends Error {
  readonly code: PrintErrorCode;
  constructor(code: PrintErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = 'PrintError';
  }
}

export function toPrintError(error: unknown): PrintError {
  if (error instanceof PrintError) return error;
  return new PrintError('failed', error instanceof Error ? error.message : String(error), { cause: error });
}

export interface PrintTransport {
  /** For logs, e.g. `system-print-web`. */
  readonly name: string;
  /** Resolves once the job is handed to the printer or dialog; rejects with a `PrintError`. */
  print(job: PrintJob): Promise<void>;
  disconnect?(): Promise<void>;
}
