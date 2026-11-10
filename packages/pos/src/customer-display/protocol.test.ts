import { describe, it, expect } from 'vitest';
import { decode, displayCart, makeEnvelope, type DisplayEnvelope } from './protocol';
import { encode } from './snapshot';
import { line, receiptWith } from './fixture.test-helper';

const cart = displayCart(receiptWith([line('Tea')]));
const config = {
  contract: '1.0' as const, display: { id: 'd1', name: 'Counter' },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: { total: 'Total' }, idle: { afterCompleteMs: 8000 },
};
const envelopes: DisplayEnvelope[] = [
  makeEnvelope('cart.updated', cart, 'a'),
  makeEnvelope('payment.state', { ...cart, state: 'approved', leg: { method: 'Card', amountMinor: 100 }, message: 'Thanks' }, 'b'),
  makeEnvelope('display.idle', { reason: 'no_cart' }, 'c'),
  makeEnvelope('display.hello', { template: { id: 'default', version: 1 } }, 'd'),
  makeEnvelope('display.config', config, 'e'),
];
const refusal = (value: unknown) => decode(JSON.stringify(value));
const withPayload = (action: string, payload: unknown) => refusal({ tally: 1, id: 'x', action, payload });

describe('display envelope', () => {
  it.each(envelopes)('round-trips $action', (envelope) => {
    expect(decode(encode(envelope))).toEqual({ ok: true, envelope });
  });

  it('mints an id when none is given', () => {
    expect(makeEnvelope('display.idle', { reason: 'no_cart' }).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([42, 'not json', '[]', 'null', JSON.stringify({ tally: 1, action: 'display.idle', payload: { reason: 'x' } })])(
    'refuses %s as malformed', (text) => {
      expect(decode(text)).toEqual({ ok: false, refusal: 'malformed' });
    });

  it('refuses a v2 envelope and an unknown version', () => {
    expect(refusal({ wcpos: 1, id: 'x', action: 'display.idle', payload: { reason: 'x' } })).toEqual({ ok: false, refusal: 'version' });
    expect(refusal({ tally: 2, id: 'x', action: 'display.idle', payload: { reason: 'x' } })).toEqual({ ok: false, refusal: 'version' });
  });

  it('refuses an unknown action', () => {
    expect(withPayload('cart.cleared', {})).toEqual({ ok: false, refusal: 'action' });
  });

  it.each([
    ['display.idle', null],
    ['cart.updated', { ...cart, receipt: { ...cart.receipt, lineItems: [{ quantity: 1, displayAmountMinor: 1 }] } }],
    ['payment.state', { ...cart, state: 'refunded' }],
    ['display.hello', {}],
    ['display.config', { ...config, contract: '2.0' }],
  ])('refuses a bad %s payload', (action, payload) => {
    expect(withPayload(action, payload)).toEqual({ ok: false, refusal: 'payload' });
  });
});
