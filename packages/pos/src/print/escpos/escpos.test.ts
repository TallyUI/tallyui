// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ReceiptData } from '../../receipt/types';
import {
  createEscPosTransport, createPrintQueue, encodeEscPos, escpos, ESCPOS_CODE_PAGES, PrintError, type PrinterProfile,
} from '../index';

const ESC = 0x1b;
const GS = 0x1d;
const LF = '\n';
/** Readable byte sequences: numbers as given, ASCII strings as their codes, `£` as cp437 0x9C. */
const seq = (...parts: (number | string)[]): number[] => parts.flatMap((part) => typeof part === 'number' ? [part]
  : Array.from(part, (char) => {
    if (char === '£') return 0x9c;
    if (char.charCodeAt(0) > 0x7e) throw new Error(`not ASCII: ${char}`);
    return char.charCodeAt(0);
  }));
const sp = (n: number) => ' '.repeat(n);

const receipt = (change: Partial<ReceiptData> = {}): ReceiptData => ({
  schemaVersion: '1.4.0',
  software: { name: 'TallyUI', plugin_version: '', app_version: '3.12.0', app_build: '', platform: 'web' },
  currency: 'GBP',
  header: { storeName: 'Corner Cafe', orderNumber: '1001', date: '2026-11-10T09:30:00.000Z' },
  register: { id: '', name: '' },
  fiscal: { document_type: 'sale', is_reprint: false, reprint_count: 0, qr_payload: '' },
  lineItems: [{
    name: 'Tea', sku: 'TEA', quantity: 2, unitPriceMinor: 150, lineTotalMinor: 300, displayAmountMinor: 300,
    displayDiscounts: [],
  }],
  fees: [], shipping: [], discounts: [], orderDiscountMinor: 0,
  totals: { taxInclusive: false, subtotalMinor: 300, discountMinor: 0, taxLines: [], taxMinor: 0, totalMinor: 300 },
  payments: [{ method: 'cash', amountMinor: 500 }],
  changeDueMinor: 200,
  footer: {},
  ...change,
});
const format = {
  formatMoney: (minor: number) => `£${(minor / 100).toFixed(2)}`,
  formatDate: (iso: string) => iso.slice(0, 16).replace('T', ' '),
};
const bytes = (data: ReceiptData, columns: number, extra = {}) => Array.from(encodeEscPos(data, { columns, ...format, ...extra }));
const textLines = (encoded: number[]) => String.fromCharCode(...encoded).split(LF);

describe('encodeEscPos', () => {
  it.each([32, 48])('lays out a small receipt at %i columns', (columns) => {
    expect(bytes(receipt(), columns)).toEqual(seq(
      ESC, '@', ESC, 'M', 0, ESC, 't', 0,
      ESC, 'a', 1, ESC, 'E', 1, 'Corner Cafe' + LF, ESC, 'E', 0,
      ESC, 'a', 0, '-'.repeat(columns) + LF,
      ESC, 'a', 1, ESC, 'E', 1, 'Receipt' + LF, ESC, 'E', 0, ESC, 'a', 0,
      'Order' + sp(columns - 9) + '1001' + LF,
      'Date' + sp(columns - 20) + '2026-11-10 09:30' + LF,
      '-'.repeat(columns) + LF,
      'Tea' + LF,
      '  2 x £1.50' + sp(columns - 16) + '£3.00' + LF,
      '-'.repeat(columns) + LF,
      'Subtotal' + sp(columns - 13) + '£3.00' + LF,
      ESC, 'E', 1, 'Total' + sp(columns - 10) + '£3.00' + LF, ESC, 'E', 0,
      '='.repeat(columns) + LF,
      'Cash' + sp(columns - 9) + '£5.00' + LF,
      'Change' + sp(columns - 11) + '£2.00' + LF,
      ESC, 'd', 1, ESC, 'a', 1, 'Thank you' + LF, ESC, 'a', 0, ESC, 'd', 3,
      GS, 'V', 0x42, 0,
    ));
  });

  it('wraps names at the column boundary and keeps the amount on the last line', () => {
    const line = receipt().lineItems[0]!;
    const lines = textLines(bytes(receipt({
      lineItems: [
        { ...line, name: `${'a'.repeat(28)} Tea` },
        { ...line, name: `${'b'.repeat(29)} Tea` },
        { ...line, name: 'c'.repeat(40), displayDiscounts: [{ label: 'Loyalty discount for members only', amountMinor: 100 }] },
      ],
    }), 32));
    expect(lines).toContain(`${'a'.repeat(28)} Tea`);
    expect(lines).toContain('b'.repeat(29));
    expect(lines).toContain('c'.repeat(32));
    expect(lines).toContain('c'.repeat(8));
    // The discount amount carries a U+2212 minus from receiptTemplateData; it prints as '-'.
    expect(lines).toContain('  Loyalty discount for');
    expect(lines).toContain(`  members only${sp(12)}-${String.fromCharCode(0x9c)}1.00`);
  });

  it('prints characters outside the code page as one byte each', () => {
    const line = receipt().lineItems[0]!;
    const encoded = bytes(receipt({ lineItems: [{ ...line, name: 'Łódź' }] }), 32);
    expect(textLines(encoded)).toContain(String.fromCharCode(0x3f, 0xa2, 0x64, 0x7a));
    const mixed = 'Crème brûlée ☕ 日本 “x”';
    expect(Array.from(escpos().text(mixed).bytes())).toEqual(seq('Cr', 0x8a, 'me br', 0x96, 'l', 0x82, 'e ? ?? "x"'));
    expect(Array.from(escpos(ESCPOS_CODE_PAGES.cp858).codePage().text('€').bytes())).toEqual([ESC, 0x74, 19, 0xd5]);
  });

  it('falls back to the currency code when the page has no symbol', () => {
    const encoded = encodeEscPos(receipt({ currency: 'EUR' }), { columns: 32, formatDate: format.formatDate });
    const text = String.fromCharCode(...encoded);
    expect(text).toContain('EUR');
    expect(text).not.toContain('?');
  });

  it('pulses the drawer before the cut, and leaves either out when asked', () => {
    const plain = bytes(receipt(), 32, { cut: false });
    expect(plain.slice(-6)).toEqual(seq(ESC, 'a', 0, ESC, 'd', 3));
    const tail = (extra: object) => bytes(receipt(), 32, extra).slice(plain.length);
    expect(tail({})).toEqual(seq(GS, 'V', 0x42, 0));
    expect(tail({ openDrawer: true })).toEqual(seq(ESC, 'p', 0, 25, 250, GS, 'V', 0x42, 0));
    expect(tail({ openDrawer: true, cut: false, drawerConnector: 'pin5' })).toEqual(seq(ESC, 'p', 1, 25, 250));
    expect(tail({ cut: false })).toEqual([]);
  });

  it('builds the other commands, and the code pages fill 0x80-0xFF', () => {
    expect(Array.from(escpos().align('right').size(2, 3).cut('full').bytes()))
      .toEqual([ESC, 0x61, 2, GS, 0x21, 0x12, GS, 0x56, 0x41, 0]);
    expect(Array.from(ESCPOS_CODE_PAGES.cp437.high)).toHaveLength(128);
    expect(Array.from(ESCPOS_CODE_PAGES.cp858.high)).toHaveLength(128);
  });
});

describe('createEscPosTransport', () => {
  const profile: PrinterProfile = { id: 'p1', name: 'Counter', connectionType: 'network', columns: 32, autoCut: false };

  it('writes each job once, encoded from the receipt or as given, through the queue', async () => {
    const writes: Uint8Array[] = [];
    const transport = createEscPosTransport({ sink: { write: async (b) => { writes.push(b); } }, profile, format });
    const queue = createPrintQueue({ transportFor: () => transport });
    const raw = Uint8Array.from([ESC, 0x40]);
    await Promise.all([
      queue.print('p1', { id: 'a', kind: 'receipt', receipt: receipt() }),
      queue.print('p1', { id: 'b', kind: 'test', bytes: raw }),
    ]);
    expect(writes).toEqual([encodeEscPos(receipt(), { columns: 32, cut: false, ...format }), raw]);
  });

  it('fails the job when the sink fails, and prints the next one', async () => {
    const writes: Uint8Array[] = [];
    let fail = true;
    const sink = { write: async (b: Uint8Array) => {
      if (fail) { fail = false; throw new Error('USB device lost'); }
      writes.push(b);
    } };
    const queue = createPrintQueue({ transportFor: () => createEscPosTransport({ sink, profile }) });
    const first = queue.print('p1', { id: 'a', kind: 'test', bytes: Uint8Array.from([1]) });
    const second = queue.print('p1', { id: 'b', kind: 'test', bytes: Uint8Array.from([2]) });
    await expect(first).rejects.toMatchObject({ name: 'PrintError', code: 'failed', message: 'USB device lost' });
    await second;
    expect(writes).toEqual([Uint8Array.from([2])]);
  });

  it('refuses a Star printer and a job with nothing to print', async () => {
    const write = async () => undefined;
    const star = createEscPosTransport({ sink: { write }, profile: { ...profile, language: 'star-line' } });
    await expect(star.print({ id: 'a', kind: 'test', bytes: Uint8Array.from([1]) })).rejects.toMatchObject({ code: 'unsupported' });
    const empty = createEscPosTransport({ sink: { write }, profile });
    await expect(empty.print({ id: 'b', kind: 'test', html: '<p/>' })).rejects.toBeInstanceOf(PrintError);
  });
});
