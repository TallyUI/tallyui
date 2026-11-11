// Ported from WCPOS v2 packages/scanner/src/serial-line-decoder.ts (monorepo 85ecbd43f).
import { stripBoundary, type WedgeSettings } from './wedge-detector';

/** Frames a text stream from a serial (USB-CDC / Bluetooth-SPP) scanner into
 * complete barcodes. Unlike the wedge detector there is no timing heuristic:
 * a serial scanner ends each scan with a terminator (CR, LF or CRLF), so a
 * line ends the moment a terminator arrives. */

const DEFAULT_TERMINATORS = ['\r', '\n'];

export interface SerialLineDecoderOptions {
  /** A completed line, configured prefix/suffix stripped, non-empty. */
  onScan: (code: string) => void;
  /** Chars that terminate a line. Defaults to CR and LF (handles CRLF too). */
  terminators?: string[];
  /** Read current prefix/suffix at emit time (same stripping as the wedge). */
  getSettings?: () => Pick<WedgeSettings, 'prefix' | 'suffix'>;
}

export interface SerialLineDecoder {
  /** Feed a chunk of decoded text (already TextDecoder'd from bytes). */
  push: (chunk: string) => void;
  /** Drop any buffered partial line (device disconnect). */
  reset: () => void;
}

const NO_BOUNDARY = { prefix: '', suffix: '' };

export function createSerialLineDecoder(options: SerialLineDecoderOptions): SerialLineDecoder {
  const terminators = new Set(options.terminators ?? DEFAULT_TERMINATORS);
  const getSettings = options.getSettings ?? (() => NO_BOUNDARY);
  let buffer = '';

  const emit = () => {
    if (buffer.length === 0) return;
    const line = buffer;
    buffer = '';
    const settings = getSettings();
    const code = stripBoundary(line.split(''), { threshold: 0, ...settings });
    if (code.length > 0) options.onScan(code);
  };

  const push = (chunk: string) => {
    for (const char of chunk) {
      // A terminator ends the current line; consecutive terminators (CRLF, or
      // blank lines) collapse because the buffer is empty.
      if (terminators.has(char)) emit();
      else buffer += char;
    }
  };

  return {
    push,
    reset: () => {
      buffer = '';
    },
  };
}
