// Ported from WCPOS v2 packages/scanner/src/hid-pos-decoder.ts (monorepo 85ecbd43f).
/** Decodes a HID Point-of-Sale (USB-IF usage page 0x8C) barcode input report,
 * shaped as:
 *
 *   [reportId?] [length] [data … (length ASCII bytes)] [symbologyId?]
 *
 * a one-byte length prefix, the decoded barcode as ASCII, then an optional
 * trailing symbology identifier. The whole barcode arrives in one report.
 *
 * Vendor variations exist (report-ID presence, symbology encoding, multi-report
 * long barcodes). `hasReportId` covers the common one; anything more exotic is
 * left for on-device tuning rather than guessed at here. */

export interface HidPosDecodeOptions {
  /** The device's report descriptor prefixes each report with a report ID. */
  hasReportId?: boolean;
}

export interface HidPosResult {
  code: string;
  symbology?: string;
}

// Common HID POS symbology identifiers → retail symbology strings. Unknown ids
// are left undefined.
const SYMBOLOGY_BY_ID: Record<number, string> = {
  0x02: 'code128',
  0x03: 'code39',
  0x0a: 'ean13',
  0x0b: 'ean8',
  0x0c: 'upc_a',
  0x0d: 'upc_e',
  0x11: 'qr',
  0x13: 'pdf417',
  0x15: 'datamatrix',
};

function toBytes(report: number[] | Uint8Array): number[] {
  return Array.from(report);
}

export function decodeHidPosReport(report: number[] | Uint8Array, options: HidPosDecodeOptions = {}): HidPosResult | null {
  let bytes = toBytes(report);
  if (options.hasReportId) bytes = bytes.slice(1);
  if (bytes.length < 2) return null;

  const length = bytes[0];
  if (length <= 0 || length > bytes.length - 1) return null;

  const dataBytes = bytes.slice(1, 1 + length);
  // Decoded data must be printable ASCII; a report of zeros or control bytes is
  // a keep-alive or non-barcode report, not a scan.
  if (!dataBytes.every((byte) => byte >= 0x20 && byte <= 0x7e)) return null;
  const code = String.fromCharCode(...dataBytes);

  const symbologyId = bytes[1 + length];
  const symbology = symbologyId !== undefined ? SYMBOLOGY_BY_ID[symbologyId] : undefined;

  return symbology ? { code, symbology } : { code };
}
