import { describe, it, expect } from 'vitest';
import { displayCart, makeEnvelope, type DisplayCart } from './protocol';
import { encode, MAX_MESSAGE_BYTES, messageBytes } from './snapshot';
import { line, receiptWith } from './fixture.test-helper';
import type { ReceiptLineItem } from '../receipt/types';

const cartMessage = (lines: ReceiptLineItem[], note?: string) =>
  makeEnvelope('cart.updated', displayCart(receiptWith(lines, note)), 'id');
const sent = (text: string) => JSON.parse(text).payload as DisplayCart;

describe('display message cap', () => {
  it('sends a small cart unchanged', () => {
    const envelope = cartMessage([line('Tea')]);
    expect(encode(envelope)).toBe(JSON.stringify(envelope));
  });

  // Pads the old line so the whole message is exactly MAX_MESSAGE_BYTES plus `over`.
  const boundary = (over: number) => {
    const base = messageBytes(JSON.stringify(cartMessage([line(''), line('new')])));
    return cartMessage([line('x'.repeat(MAX_MESSAGE_BYTES - base + over)), line('new')]);
  };

  it('sends a message of exactly the cap unchanged', () => {
    const envelope = boundary(0);
    const text = encode(envelope);
    expect(messageBytes(text)).toBe(MAX_MESSAGE_BYTES);
    expect(text).toBe(JSON.stringify(envelope));
  });

  it('drops the oldest line one byte over the cap', () => {
    const text = encode(boundary(1));
    expect(messageBytes(text)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(sent(text).linesTruncated).toBe(true);
    expect(sent(text).receipt.lineItems.map(({ name }) => name)).toEqual(['new']);
  });

  it('cuts a long note first and keeps every line when that is enough', () => {
    const text = encode(cartMessage([line('Tea'), line('Cake')], '😀'.repeat(60_000)));
    const { receipt, linesTruncated } = sent(text);
    expect(messageBytes(receipt.footer.note!)).toBeLessThanOrEqual(1024);
    expect(receipt.footer.note!.startsWith('😀')).toBe(true);
    expect(receipt.lineItems).toHaveLength(2);
    expect(linesTruncated).toBe(false);
  });

  it('caps line attributes at eight before dropping lines', () => {
    const attributes = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`a${i}`, 'x'.repeat(24_000)]));
    const { receipt, linesTruncated } = sent(encode(cartMessage([line('Tea', { attributes })])));
    expect(Object.keys(receipt.lineItems[0].attributes!)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']);
    expect(linesTruncated).toBe(false);
  });

  it('fits a huge cart, keeping the newest lines and the totals', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => line(`item-${i}-${'y'.repeat(300)}`));
    const envelope = cartMessage(lines);
    expect(messageBytes(JSON.stringify(envelope))).toBeGreaterThan(1024 * 1024);
    const text = encode(envelope);
    const { receipt, linesTruncated } = sent(text);
    expect(messageBytes(text)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(linesTruncated).toBe(true);
    expect(receipt.lineItems.at(-1)!.name).toBe(lines[4999].name);
    expect(receipt.totals.totalMinor).toBe(500_000);
  });

  it('drops oversized config translations and keeps the presentation hints', () => {
    const envelope = makeEnvelope('display.config', {
      contract: '1.0', display: { id: 'd1', name: 'Counter' },
      store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
      presentation_hints: { theme: 'dark' }, i18n: { total: 'x'.repeat(MAX_MESSAGE_BYTES) }, idle: { afterCompleteMs: 8000 },
    });
    const text = encode(envelope);
    expect(messageBytes(text)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(JSON.parse(text).payload).toMatchObject({ i18n: {}, presentation_hints: { theme: 'dark' } });
  });

  it('leaves its input unchanged', () => {
    const envelope = cartMessage(Array.from({ length: 2000 }, (_, i) => line(`item-${i}-${'z'.repeat(200)}`)), 'n'.repeat(5000));
    const before = structuredClone(envelope);
    encode(envelope);
    expect(envelope).toEqual(before);
  });
});
