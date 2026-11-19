// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeThermalTemplate as entryEncode, renderEscpos as entryRender } from '../../index';
import { parseXml } from '../../receipt-template/parse-xml';
import { encodeThermalTemplate, renderEscpos, type RenderEscposOptions } from '../index';
import { resolveCodePage, type EscPosCodePage } from './code-page';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const fixture = readFileSync(new URL('./__fixtures__/thermal-every-node.xml', import.meta.url), 'utf8');
const render = (xml: string, options?: RenderEscposOptions) => renderEscpos(parseXml(xml), options);
/** Readable byte sequences: numbers as given, ASCII strings as their codes. */
const seq = (...parts: (number | string)[]): number[] =>
  parts.flatMap((part) => typeof part === 'number' ? [part] : Array.from(part, (char) => char.charCodeAt(0)));
const find = (bytes: Uint8Array, needle: number[], from = 0): number => {
  for (let i = from; i + needle.length <= bytes.length; i++) if (needle.every((b, j) => bytes[i + j] === b)) return i;
  return -1;
};
const count = (bytes: Uint8Array, needle: number[]): number => {
  let n = 0;
  for (let i = find(bytes, needle); i >= 0; i = find(bytes, needle, i + 1)) n++;
  return n;
};
const tail = (bytes: Uint8Array, n: number) => Array.from(bytes.slice(bytes.length - n));
const hex = (byte: number | undefined) => (byte ?? 0).toString(16).padStart(2, '0');

/**
 * Design Q8 "Strip rule": skips every command 13b may emit (and ESC 2/3/!/d, which it must not but may skip),
 * LF ends a line, printable ASCII is itself, 0x80-0xFF is the page's character; anything else throws.
 * Split on LF with the final (always empty) element dropped.
 */
function strip(bytes: Uint8Array, page: EscPosCodePage = resolveCodePage()): string[] {
  let text = '';
  for (let i = 0; i < bytes.length;) {
    const [b, c, m] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    if (b === ESC && (c === 0x40 || c === 0x32)) i += 2;
    else if (b === ESC && [0x4d, 0x74, 0x61, 0x45, 0x2d, 0x21, 0x33, 0x64].includes(c)) i += 3;
    else if (b === ESC && c === 0x70) i += 5;
    else if (b === GS && [0x21, 0x42, 0x68, 0x77, 0x48].includes(c)) i += 3;
    else if (b === GS && c === 0x56 && (m === 0x41 || m === 0x42)) i += 4;
    else if (b === GS && c === 0x6b && m <= 0x06) {
      const nul = bytes.indexOf(0, i + 3);
      if (nul < 0) throw new Error(`GS k function A without NUL at ${i}`);
      i = nul + 1;
    } else if (b === GS && c === 0x6b && m >= 0x41) i += 4 + bytes[i + 3];
    else if (b === GS && c === 0x28 && m === 0x6b) i += 5 + bytes[i + 3] + 256 * bytes[i + 4];
    else if (b === ESC || b === GS) throw new Error(`unknown command ${hex(b)} ${hex(c)} at ${i}`);
    else if (b === LF) { text += '\n'; i++; }
    else if (b >= 0x20 && b <= 0x7e) { text += String.fromCharCode(b); i++; }
    else if (b >= 0x80) { text += page.high[b - 0x80]; i++; }
    else throw new Error(`control byte ${hex(b)} at ${i}`);
  }
  const lines = text.split('\n');
  lines.pop();
  return lines;
}

/** Design Q8's expected lines; `·` marks a trailing space. */
const golden = (block: string) => block.split('\n').slice(1, -1).map((line) => line.replace(/·/g, ' '));
const GOLDEN_32 = golden(`
  Corner Cafe
     12 High Street, Leeds
--------------------------------
Plain bold, under, inv end
  Oat milk, extra hot, no foam,
  in a takeaway cup
                      Right side
Order                      #1001
--------------------------------
Flat White
  2 x 3.50                  7.00
  Loyalty discount··············
  for regular···················
  customers                -1.00
. . . . . . . . . . . . . . . .·
Total                       6.00
════════════════════════════════
Cash  tendered             10.00


Note one
Note two
          Thanks again
         4006381333932
          012345678905



`);
const GOLDEN_48 = golden(`
      Corner Cafe
             12 High Street, Leeds
------------------------------------------------
Plain bold, under, inv end
  Oat milk, extra hot, no foam, in a takeaway
  cup
                                      Right side
Order                                      #1001
------------------------------------------------
Flat White
  2 x 3.50                                  7.00
  Loyalty discount for regular··················
  customers                                -1.00
. . . . . . . . . . . . . . . . . . . . . . . .·
Total                                       6.00
════════════════════════════════════════════════
Cash  tendered                             10.00


Note one
Note two
                  Thanks again
                 4006381333932
                  012345678905



`);

describe('renderEscpos: the every-node fixture (design Q8)', () => {
  const at32 = () => render(fixture, { columns: 32 });

  it('G1 strips to the 32-column golden', () => {
    expect(GOLDEN_32).toHaveLength(28);
    expect(strip(at32())).toEqual(GOLDEN_32);
  });

  it('G2 strips to the 48-column golden', () => {
    expect(GOLDEN_48).toHaveLength(27);
    expect(strip(render(fixture, { columns: 48 }))).toEqual(GOLDEN_48);
  });

  it("G3 defaults columns to the template's paper-width (48)", () => {
    expect(render(fixture)).toEqual(render(fixture, { columns: 48 }));
  });

  it('B1 starts with init, Font A and cp437', () => {
    expect(Array.from(at32().slice(0, 8))).toEqual([ESC, 0x40, ESC, 0x4d, 0, ESC, 0x74, 0]);
  });

  it('B2 pads the 2x bold title in its own style, then resets before the address pad', () => {
    expect(find(at32(), seq(GS, 0x21, 0x11, ESC, 0x45, 1, '  Corner Cafe', LF,
      GS, 0x21, 0, ESC, 0x45, 0, '     12 High Street, Leeds', LF))).toBeGreaterThan(0);
  });

  it('B3 styles each run of one line lazily', () => {
    expect(find(at32(), seq('Plain ', ESC, 0x45, 1, 'bold', ESC, 0x45, 0, ', ', ESC, 0x2d, 1, 'under', ESC, 0x2d, 0,
      ', ', GS, 0x42, 1, 'inv', GS, 0x42, 0, ' end', LF))).toBeGreaterThan(0);
  });

  it('B4 bolds the Total row and unbolds before the double rule', () => {
    const bytes = at32();
    const total = find(bytes, seq('Total'));
    const rule = bytes.indexOf(0xcd);
    expect(Array.from(bytes.slice(total - 3, total))).toEqual([ESC, 0x45, 1]);
    expect(rule).toBeGreaterThan(total);
    expect(Array.from(bytes.slice(rule - 3, rule))).toEqual([ESC, 0x45, 0]);
  });

  it('B5 prints CODE128 and QR natively, centred by ESC a, and sends ESC a nowhere else', () => {
    const bytes = at32();
    expect(find(bytes, seq(ESC, 0x61, 1, GS, 0x68, 0x32, GS, 0x77, 3, GS, 0x48, 2, GS, 0x6b, 0x49, 0x0c,
      '{BORDER-1001', ESC, 0x61, 0))).toBeGreaterThan(0);
    expect(find(bytes, seq(ESC, 0x61, 1,
      GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0,
      GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 4,
      GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31,
      GS, 0x28, 0x6b, 0x21, 0, 0x31, 0x50, 0x30, 'https://example.invalid/r/1001',
      GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30,
      ESC, 0x61, 0))).toBeGreaterThan(0);
    expect(count(bytes, [ESC, 0x61])).toBe(4);
  });

  it('B6 ends with the feed, the drawer pulse and the partial cut', () => {
    expect(tail(at32(), 12)).toEqual([LF, LF, LF, ESC, 0x70, 0, 0x19, 0xfa, GS, 0x56, 0x42, 0]);
  });
});

describe('renderEscpos: drawer', () => {
  it('D1 openDrawer pulses once, before the trailing feed and cut, when the template has no drawer', () => {
    const noDrawer = fixture.replace('<drawer />', '');
    expect(noDrawer).not.toBe(fixture);
    const bytes = render(noDrawer, { openDrawer: true });
    expect(count(bytes, [ESC, 0x70, 0, 0x19, 0xfa])).toBe(1);
    expect(tail(bytes, 12)).toEqual([ESC, 0x70, 0, 0x19, 0xfa, LF, LF, LF, GS, 0x56, 0x42, 0]);
  });

  it('D2 openDrawer adds no pulse when the template has a drawer', () => {
    expect(count(render(fixture, { openDrawer: true }), [ESC, 0x70])).toBe(1);
  });

  it('D3 a drawer with no connector uses options.drawerConnector', () => {
    expect(find(render('<receipt><drawer /></receipt>', { drawerConnector: 'pin5' }), [ESC, 0x70, 1, 0x19, 0xfa]))
      .toBeGreaterThan(0);
  });
});

describe('renderEscpos: layout rules', () => {
  it('S1 wraps 2x text at half the columns', () => {
    expect(strip(render('<receipt paper-width="32"><size width="2" height="1"><text>abcdefgh ijklmnop</text></size></receipt>')))
      .toEqual(['abcdefgh', 'ijklmnop']);
  });

  it('R1 gives the last * column the remainder', () => {
    const xml = '<receipt paper-width="33"><row><col width="10">a</col><col width="*">b</col>'
      + '<col width="*" align="right">c</col></row></receipt>';
    expect(strip(render(xml))).toEqual(['a'.padEnd(10) + 'b'.padEnd(11) + 'c'.padStart(12)]);
  });

  it('T1 resets the style once before the trailing controls', () => {
    const bytes = render('<receipt><bold><text>x</text></bold><cut /></receipt>');
    expect(Array.from(bytes.slice(find(bytes, seq('x', LF)) + 2))).toEqual([ESC, 0x45, 0, GS, 0x56, 0x42, 0]);
  });

  it('T2 an empty <text> still ends a line', () => {
    expect(strip(render('<receipt><text>Before</text><text></text><text>After</text></receipt>')))
      .toEqual(['Before', '', 'After']);
  });

  it('F1 an empty barcode value prints nothing', () => {
    const bytes = render('<receipt><barcode type="code128"></barcode></receipt>');
    expect(count(bytes, [GS, 0x6b])).toBe(0);
    expect(count(bytes, [LF])).toBe(0);
    expect(strip(bytes)).toEqual([]);
  });
});

describe('encodeThermalTemplate', () => {
  it('E1 is Mustache, then parseXml, then renderEscpos', () => {
    expect(encodeThermalTemplate('<receipt paper-width="32"><text>{{name}}</text></receipt>', { name: 'Ada' }))
      .toEqual(renderEscpos(parseXml('<receipt paper-width="32"><text>Ada</text></receipt>')));
    expect([entryRender, entryEncode]).toEqual([renderEscpos, encodeThermalTemplate]);
  });
});
