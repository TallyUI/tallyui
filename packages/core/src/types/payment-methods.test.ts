import { describe, it, expect } from 'vitest';
import { paymentMethodOf, defaultPaymentMethods, legMethodId, wireMethodOf } from './payment-methods';

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

describe('wireMethodOf (condition 5)', () => {
  it("is 'cash' for a cash-kind method and 'external' for every other kind, known or not", () => {
    expect(wireMethodOf({ kind: 'cash' })).toBe('cash');
    for (const kind of ['card', 'stored_value', 'bank_transfer', 'other', 'gift_voucher']) expect(wireMethodOf({ kind })).toBe('external');
  });
});

describe('legMethodId', () => {
  it('is the wire method plus the leg\'s methodId, else the wire method alone', () => {
    expect(legMethodId({ method: 'cash', methodId: 'cod' })).toBe('cash:cod');
    expect(legMethodId({ method: 'external', methodId: 'stripe' })).toBe('external:stripe');
    expect(legMethodId({ method: 'cash' })).toBe('cash');
    expect(legMethodId({ method: 'external' })).toBe('external');
  });

  it('keeps a non-cash method whose id is `cash` apart from cash', () => {
    expect(legMethodId({ method: 'external', methodId: 'cash' })).toBe('external:cash');
    expect(legMethodId({ method: 'external', methodId: 'cash' })).not.toBe(legMethodId({ method: 'cash' }));
  });

  it('is the wire method alone when the id equals it', () => {
    expect(legMethodId({ method: 'cash', methodId: 'cash' })).toBe('cash');
    expect(legMethodId({ method: 'external', methodId: 'external' })).toBe('external');
  });
});
