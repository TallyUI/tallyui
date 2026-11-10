import { describe, it, expect } from 'vitest';
import { paymentMethodOf, defaultPaymentMethods } from './payment-methods';

describe('paymentMethodOf', () => {
  it('describes cash', () => {
    expect(paymentMethodOf('cash')).toStrictEqual({
      id: 'cash', title: 'Cash', kind: 'cash',
      capture: { mode: 'manual', provider: null, hardware: null },
      capabilities: {
        amount: { partial: true }, change: true, refunds: { via: 'manual', partial: true },
        tips: 'none', offline: 'record', void: true,
      },
      defaults: { rounding: null, openDrawer: true },
    });
  });

  it('describes the card terminal', () => {
    expect(paymentMethodOf('external')).toStrictEqual({
      id: 'external', title: 'Card terminal', kind: 'card',
      capture: { mode: 'manual', provider: null, hardware: null },
      capabilities: {
        amount: { partial: true }, change: false, refunds: { via: 'manual', partial: true },
        tips: 'none', offline: 'record', void: true,
      },
      defaults: { rounding: null, openDrawer: false },
    });
  });

  it('returns a fresh object on each call', () => {
    const cash = paymentMethodOf('cash');
    cash.capabilities.change = false;
    expect(paymentMethodOf('cash').capabilities.change).toBe(true);
  });
});

describe('defaultPaymentMethods', () => {
  it('offers cash then the card terminal', () => {
    expect(defaultPaymentMethods().map((m) => m.id)).toEqual(['cash', 'external']);
  });
});
