/**
 * A small ESC/POS command builder. The command bytes follow WCPOS v2 (monorepo main): `escpos-text.ts`
 * opens every job with `ESC @` then `ESC M 0` (Font A, so the profile's column count holds whatever the
 * printer's memory switch says; v2 gotcha N39), and `render-escpos.ts` `writeCut` cuts with `GS V 0x41|0x42 0`
 * (feed to the cutter, then cut). Text goes through `foldText`, so no multibyte UTF-8 ever reaches the printer.
 * The `underline`, `invert`, `barcode` and `qrcode` bytes follow `@point-of-sale/receipt-printer-encoder` 4.0.1,
 * as read on 19 Nov 2026, except two TallyUI choices: the `GS h`, `GS w`, `GS H` order before a barcode, and
 * sending a computed check digit for a 12-digit EAN-13.
 */
import type { DrawerConnector } from '../../receipt-template/types';
import { foldText, resolveCodePage, type EscPosCodePage } from './code-page';

const ESC = 0x1b;
const GS = 0x1d;
const HRI = { none: 0, above: 1, below: 2, both: 3 } as const;
const QR_LEVEL = { l: 0x30, m: 0x31, q: 0x32, h: 0x33 } as const;
/** QR's numeric-mode capacity, the longest value any QR symbol can hold. */
const QR_MAX_LENGTH = 7089;

export interface EscPosBarcodeOptions {
  /** `GS h n`, dots. Default 60; rounded and clamped to 1-255. */
  height?: number;
  /** Module width 1-3; `GS w (width + 1)`. Default 2; rounded and clamped to 1-3. */
  width?: number;
  /** `GS H n`: where the human-readable digits print. Default 'none'. */
  hri?: 'none' | 'above' | 'below' | 'both';
}
export interface EscPosQrOptions {
  /** Default 2. */
  model?: 1 | 2;
  /** Module size; default 6; rounded and clamped to 1-8. */
  size?: number;
  /** Error correction; default 'm'. */
  errorLevel?: 'l' | 'm' | 'q' | 'h';
}

export interface EscPosBuilder {
  /** `ESC @` (reset), then `ESC M 0` (Font A). */
  init(): EscPosBuilder;
  /** `ESC t n`: select the builder's code page. */
  codePage(): EscPosBuilder;
  align(mode: 'left' | 'center' | 'right'): EscPosBuilder;
  bold(on: boolean): EscPosBuilder;
  /** `GS ! n`: character width and height multipliers, 1-8 each. */
  size(width: number, height: number): EscPosBuilder;
  /** Folded to the code page, one byte per character; `\n` is LF. */
  text(value: string): EscPosBuilder;
  /** `ESC d n`: print and feed n lines. */
  feed(lines: number): EscPosBuilder;
  cut(type?: 'full' | 'partial'): EscPosBuilder;
  /** `ESC p m 25 250`: a drawer kick, on 50 ms and off 500 ms; m 0 for pin 2, 1 for pin 5. */
  pulse(connector?: DrawerConnector): EscPosBuilder;
  /** `ESC - 1` on, `ESC - 0` off. */
  underline(on: boolean): EscPosBuilder;
  /** `GS B 1` on, `GS B 0` off (reverse print). */
  invert(on: boolean): EscPosBuilder;
  /** `GS h`, `GS w`, `GS H`, then `GS k 0x49 n data` (code128) or `GS k 0x02 d1…d13 NUL` (ean13); RangeError first. */
  barcode(value: string, symbology: 'code128' | 'ean13', options?: EscPosBarcodeOptions): EscPosBuilder;
  /** `GS ( k` model, size, error level, store (`31 50 30 data`) and print (`31 51 30`); RangeError first. */
  qrcode(value: string, options?: EscPosQrOptions): EscPosBuilder;
  bytes(): Uint8Array;
}

const fit = (n: number, max: number) => Math.min(max, Math.max(1, Math.round(n)));
const codes = (value: string) => Array.from(value, (char) => char.charCodeAt(0));

/** The `GS k` bytes for a barcode value. Throws a RangeError when it cannot be encoded. */
function barcodeSymbol(value: string, symbology: 'code128' | 'ean13'): number[] {
  if (symbology === 'ean13') {
    if (!/^\d{12,13}$/.test(value)) throw new RangeError('ean13: value must be 12 or 13 digits');
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
    const check = (10 - (sum % 10)) % 10;
    if (value.length === 13 && Number(value[12]) !== check) throw new RangeError('ean13: wrong check digit');
    return [GS, 0x6b, 0x02, ...codes(value.slice(0, 12) + check), 0];
  }
  if (!/^[\x20-\x7e]+$/.test(value)) throw new RangeError('code128: value must be non-empty printable ASCII');
  const selected = /^\{[ABC]/.test(value);
  if ((selected ? value.slice(2) : value).includes('{')) throw new RangeError('code128: { only in a leading {A, {B or {C');
  const data = selected ? value : '{B' + value;
  if (data.length > 255) throw new RangeError('code128: data longer than 255 bytes');
  return [GS, 0x6b, 0x49, data.length, ...codes(data)];
}

/** One byte per character (ISO-8859-1). Throws a RangeError when the value cannot be encoded. */
function qrData(value: string): number[] {
  if (value === '') throw new RangeError('qrcode: value is empty');
  const data = codes(value);
  if (data.some((code) => code > 0xff)) throw new RangeError('qrcode: character above 0xFF');
  if (data.length > QR_MAX_LENGTH) throw new RangeError(`qrcode: longer than ${QR_MAX_LENGTH} characters`);
  return data;
}

export function escpos(page: EscPosCodePage = resolveCodePage()): EscPosBuilder {
  const out: number[] = [];
  const clamp = (n: number) => Math.min(8, Math.max(1, Math.round(n))) - 1;
  const builder: EscPosBuilder = {
    init: () => push(ESC, 0x40, ESC, 0x4d, 0),
    codePage: () => push(ESC, 0x74, page.id),
    align: (mode) => push(ESC, 0x61, mode === 'left' ? 0 : mode === 'center' ? 1 : 2),
    bold: (on) => push(ESC, 0x45, on ? 1 : 0),
    size: (width, height) => push(GS, 0x21, (clamp(width) << 4) | clamp(height)),
    text: (value) => push(...Array.from(foldText(value, page), (char) =>
      char.charCodeAt(0) < 0x80 ? char.charCodeAt(0) : 0x80 + page.high.indexOf(char))),
    feed: (lines) => push(ESC, 0x64, Math.min(255, Math.max(0, lines))),
    cut: (type = 'partial') => push(GS, 0x56, type === 'full' ? 0x41 : 0x42, 0),
    pulse: (connector = 'pin2') => push(ESC, 0x70, connector === 'pin5' ? 1 : 0, 25, 250),
    underline: (on) => push(ESC, 0x2d, on ? 1 : 0),
    invert: (on) => push(GS, 0x42, on ? 1 : 0),
    barcode: (value, symbology, { height = 60, width = 2, hri = 'none' } = {}) => {
      const symbol = barcodeSymbol(value, symbology);
      return push(GS, 0x68, fit(height, 255), GS, 0x77, fit(width, 3) + 1, GS, 0x48, HRI[hri], ...symbol);
    },
    qrcode: (value, { model = 2, size = 6, errorLevel = 'm' } = {}) => {
      const data = qrData(value);
      const stored = data.length + 3;
      return push(
        GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, model === 1 ? 0x31 : 0x32, 0,
        GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, fit(size, 8),
        GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, QR_LEVEL[errorLevel],
        GS, 0x28, 0x6b, stored & 0xff, stored >> 8, 0x31, 0x50, 0x30, ...data,
        GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30,
      );
    },
    bytes: () => Uint8Array.from(out),
  };
  function push(...bytes: number[]): EscPosBuilder {
    for (const byte of bytes) out.push(byte);
    return builder;
  }
  return builder;
}
