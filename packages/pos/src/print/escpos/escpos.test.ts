// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOrderBuilder } from '../../order/order-builder';
import { finalizeOrder } from '../../pos-order/finalize';
import { buildReceiptDataFromPosOrder } from '../../receipt/reprint';
import type { ReceiptData } from '../../receipt/types';
import {
  createEscPosTransport, createPrintQueue, encodeEscPos, escpos, ESCPOS_CODE_PAGES, PrintError, type PrinterProfile,
} from '../index';
import { escpos as entryEscpos, type EscPosBarcodeOptions, type EscPosQrOptions } from '../../index';

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

  it('a reopened, overpaid order prints Refund due and no Change line with that amount', () => {
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Tea', sku: 'TEA', unitPrice: { amount: 300, currency: 'GBP' } });
    builder.addPayment({ method: 'cash', amountMinor: 300 });
    let next = 0;
    const posOrder = finalizeOrder(builder.getSnapshot(), {
      capabilities: { orderCreate: 6 }, now: new Date('2026-11-10T09:30:00.000Z'), newId: () => `id-${++next}`,
    });
    const reopened = buildReceiptDataFromPosOrder({
      ...posOrder, refundDueMinor: 800,
      payments: [{ id: 'p1', storePaymentId: 'store-p1', method: 'external', amountMinor: 1100 }],
    }, { storeName: 'Corner Cafe' });
    expect(reopened.refundDueMinor).toBe(800);
    const lines = textLines(bytes(reopened, 32));
    expect(lines).toContain(`Refund due${sp(17)}${String.fromCharCode(0x9c)}8.00`);
    expect(lines.some((line) => line.startsWith('Change'))).toBe(false);
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

  it('passes a PrintError from the sink through unchanged', async () => {
    const refusal = new PrintError('unsupported', 'Counter has no bulk OUT endpoint to print to');
    const transport = createEscPosTransport({ sink: { write: async () => { throw refusal; } }, profile });
    await expect(transport.print({ id: 'a', kind: 'test', bytes: Uint8Array.from([1]) })).rejects.toBe(refusal);
    const queue = createPrintQueue({ transportFor: () => transport });
    await expect(queue.print('p1', { id: 'b', kind: 'test', bytes: Uint8Array.from([2]) })).rejects.toMatchObject({
      name: 'PrintError', code: 'unsupported', message: 'Counter has no bulk OUT endpoint to print to',
    });
  });

  it('keeps a failed PrintError from the sink as it is, cause included', async () => {
    const cause = new Error('stall');
    const lost = new PrintError('failed', 'Counter: transferOut failed: stall', { cause });
    const transport = createEscPosTransport({ sink: { write: async () => { throw lost; } }, profile });
    const caught = await transport.print({ id: 'a', kind: 'test', bytes: Uint8Array.from([1]) }).catch((error: unknown) => error);
    expect(caught).toBe(lost);
    expect((caught as PrintError).cause).toBe(cause);
  });

  it('refuses a Star printer and a job with nothing to print', async () => {
    const write = async () => undefined;
    const star = createEscPosTransport({ sink: { write }, profile: { ...profile, language: 'star-line' } });
    await expect(star.print({ id: 'a', kind: 'test', bytes: Uint8Array.from([1]) })).rejects.toMatchObject({ code: 'unsupported' });
    const empty = createEscPosTransport({ sink: { write }, profile });
    await expect(empty.print({ id: 'b', kind: 'test', html: '<p/>' })).rejects.toBeInstanceOf(PrintError);
  });
});

describe('escpos builder codes', () => {
  const tail = (data: Uint8Array, expected: number[]) => expect(Array.from(data).slice(-expected.length)).toEqual(expected);
  const qr = (value: string, options?: EscPosQrOptions) => Array.from(escpos().qrcode(value, options).bytes());
  const refuses = (call: (b: ReturnType<typeof escpos>) => unknown) => {
    const b = escpos().init();
    expect(() => call(b)).toThrow(RangeError);
    expect(b.bytes()).toEqual(escpos().init().bytes());
  };

  it('B1 underline', () => {
    expect(Array.from(escpos().underline(true).underline(false).bytes())).toEqual(seq(ESC, '-', 1, ESC, '-', 0));
  });

  it('B2 invert', () => {
    expect(Array.from(escpos().invert(true).invert(false).bytes())).toEqual(seq(GS, 'B', 1, GS, 'B', 0));
  });

  it('B3 code128 with the default options and a {B prefix', () => {
    expect(Array.from(escpos().barcode('AB12', 'code128').bytes()))
      .toEqual(seq(GS, 'h', 60, GS, 'w', 3, GS, 'H', 0, GS, 'k', 0x49, 6, '{BAB12'));
  });

  it('B4 code128 options, clamps and a caller code set', () => {
    expect(Array.from(escpos().barcode('{C1234', 'code128', { height: 80, width: 3, hri: 'below' }).bytes()))
      .toEqual(seq(GS, 'h', 80, GS, 'w', 4, GS, 'H', 2, GS, 'k', 0x49, 6, '{C1234'));
    expect(Array.from(escpos().barcode('A', 'code128', { height: 999, width: 0 }).bytes()).slice(0, 6))
      .toEqual(seq(GS, 'h', 255, GS, 'w', 2));
    expect(Array.from(escpos().barcode('A', 'code128', { hri: 'both' }).bytes()).slice(6, 9)).toEqual(seq(GS, 'H', 3));
  });

  it('B5 ean13 computes a missing check digit and accepts a right one', () => {
    const twelve = escpos().barcode('400638133393', 'ean13').bytes();
    tail(twelve, seq(GS, 'k', 2, '4006381333931', 0));
    expect(escpos().barcode('4006381333931', 'ean13').bytes()).toEqual(twelve);
    tail(escpos().barcode('000000000000', 'ean13').bytes(), seq('0000000000000', 0));
  });

  it.each(['4006381333932', '12345', '40063813339a', '40063813339311'])('B6 ean13 refuses %s and writes nothing', (value) => {
    refuses((b) => b.barcode(value, 'ean13'));
  });

  it.each(['', 'é', '{X12', 'a{b', 'A'.repeat(254)])('B6 code128 refuses %s and writes nothing', (value) => {
    refuses((b) => b.barcode(value, 'code128'));
  });

  it('B7 qrcode with the default options', () => {
    expect(qr('https://x.test')).toEqual(seq(
      GS, '(', 'k', 4, 0, 0x31, 0x41, 0x32, 0,
      GS, '(', 'k', 3, 0, 0x31, 0x43, 6,
      GS, '(', 'k', 3, 0, 0x31, 0x45, 0x31,
      GS, '(', 'k', 17, 0, 0x31, 0x50, 0x30, 'https://x.test',
      GS, '(', 'k', 3, 0, 0x31, 0x51, 0x30,
    ));
  });

  it('B8 qrcode options, a two-byte length and refusals', () => {
    expect(qr('x', { model: 1, size: 12, errorLevel: 'h' }).slice(0, 25)).toEqual(seq(
      GS, '(', 'k', 4, 0, 0x31, 0x41, 0x31, 0,
      GS, '(', 'k', 3, 0, 0x31, 0x43, 8,
      GS, '(', 'k', 3, 0, 0x31, 0x45, 0x33,
    ));
    expect(qr('a'.repeat(300)).slice(25, 33)).toEqual(seq(GS, '(', 'k', 0x2f, 1, 0x31, 0x50, 0x30));
    for (const value of ['', '€', '1'.repeat(7090)]) refuses((b) => b.qrcode(value));
  });

  it('B9 the option types and the new methods come from the package entry', () => {
    const barcodeOptions = { height: 80, width: 2, hri: 'below' } satisfies EscPosBarcodeOptions;
    const qrOptions = { model: 2, size: 4, errorLevel: 'q' } satisfies EscPosQrOptions;
    expect(entryEscpos().barcode('A', 'code128', barcodeOptions).bytes()[2]).toBe(80);
    expect(entryEscpos().qrcode('A', qrOptions).bytes()[16]).toBe(4);
    expect(typeof entryEscpos().qrcode).toBe('function');
  });
});
