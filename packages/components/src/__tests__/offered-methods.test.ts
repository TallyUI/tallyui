import { describe, expect, it } from 'vitest';
import { defaultPaymentMethods, paymentMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { offeredMethods, tenderOf } from '../sale/offered-methods';

const own = (id: string, kind: string, mode = 'manual'): PaymentMethodDescriptor =>
  ({ ...paymentMethodOf('external'), id, kind, capture: { mode, provider: null, hardware: null } });

describe('offeredMethods', () => {
  it("offers today's two defaults when the host passes none", () => {
    expect(offeredMethods()).toStrictEqual(defaultPaymentMethods());
  });

  it('offers only the manual-capture methods, in the host order', () => {
    const methods = ['manual', 'device', 'gateway', 'webview', 'server', 'stored_value', 'manual'].map((mode, index) => own(`m${index}`, 'card', mode));
    expect(offeredMethods(methods).map(({ id }) => id)).toEqual(['m0', 'm6']);
  });
});

describe('tenderOf', () => {
  it("records today's defaults as their wire method with no methodId key", () => {
    expect(tenderOf(paymentMethodOf('cash'))).toStrictEqual({ method: 'cash' });
    expect(tenderOf(paymentMethodOf('external'))).toStrictEqual({ method: 'external' });
  });

  it('records any other method as its wire method plus its own id', () => {
    expect(tenderOf(own('pos_cash', 'cash'))).toStrictEqual({ method: 'cash', methodId: 'pos_cash' });
    expect(tenderOf(own('cheque', 'other'))).toStrictEqual({ method: 'external', methodId: 'cheque' });
    expect(tenderOf(own('cash', 'card'))).toStrictEqual({ method: 'external', methodId: 'cash' });
  });
});
