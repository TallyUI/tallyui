/**
 * A small ESC/POS command builder. The command bytes follow WCPOS v2 (monorepo main): `escpos-text.ts`
 * opens every job with `ESC @` then `ESC M 0` (Font A, so the profile's column count holds whatever the
 * printer's memory switch says; v2 gotcha N39), and `render-escpos.ts` `writeCut` cuts with `GS V 0x41|0x42 0`
 * (feed to the cutter, then cut). Text goes through `foldText`, so no multibyte UTF-8 ever reaches the printer.
 */
import type { DrawerConnector } from '../../receipt-template/types';
import { foldText, resolveCodePage, type EscPosCodePage } from './code-page';

const ESC = 0x1b;
const GS = 0x1d;

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
  bytes(): Uint8Array;
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
    bytes: () => Uint8Array.from(out),
  };
  function push(...bytes: number[]): EscPosBuilder {
    for (const byte of bytes) out.push(byte);
    return builder;
  }
  return builder;
}
