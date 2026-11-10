import { describe, it, expect } from 'vitest';
import { displayReducer, initialDisplayState } from './display-state';
import { displayCart, makeEnvelope, type DisplayConfig } from './protocol';
import { line, receiptWith } from './fixture.test-helper';

const cart = displayCart(receiptWith([line('Tea')]));
const config: DisplayConfig = {
  contract: '1.0', display: { id: 'd1', name: 'Counter' },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: {}, idle: { afterCompleteMs: 8000 },
};

describe('display state', () => {
  it('starts idle with no config', () => {
    expect(initialDisplayState).toEqual({ config: null, view: { screen: 'idle', reason: 'no_cart' } });
  });

  it('shows the cart, then the payment, then goes idle', () => {
    const shown = displayReducer(initialDisplayState, makeEnvelope('cart.updated', cart));
    expect(shown.view).toEqual({ screen: 'cart', cart });

    const paying = displayReducer(shown, makeEnvelope('payment.state', { ...cart, state: 'started' }));
    expect(paying.view).toEqual({ screen: 'payment', cart, payment: { state: 'started' } });

    const done = displayReducer(paying, makeEnvelope('payment.state', {
      ...cart, state: 'complete', leg: { method: 'Cash', amountMinor: 100 }, message: 'Thank you',
    }));
    expect(done.view).toEqual({
      screen: 'payment', cart, payment: { state: 'complete', leg: { method: 'Cash', amountMinor: 100 }, message: 'Thank you' },
    });

    expect(displayReducer(done, makeEnvelope('display.idle', { reason: 'no_cart' })).view).toEqual({ screen: 'idle', reason: 'no_cart' });
  });

  it('takes the config and keeps the view', () => {
    const shown = displayReducer(initialDisplayState, makeEnvelope('cart.updated', cart));
    const configured = displayReducer(shown, makeEnvelope('display.config', config));
    expect(configured).toEqual({ config, view: shown.view });
  });

  it('ignores its own hello', () => {
    expect(displayReducer(initialDisplayState, makeEnvelope('display.hello', { template: { id: 1, version: 1 } }))).toBe(initialDisplayState);
  });
});
