// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOrderBuilder } from './order-builder';
import { isTakenAt } from './taken-at';

const iso = '2026-11-21T10:15:30.123Z';

describe('isTakenAt', () => {
  it('accepts an instant in toISOString form', () => {
    expect(isTakenAt(new Date(0).toISOString())).toBe(true);
    expect(isTakenAt(iso)).toBe(true);
  });

  it.each(['', 'yesterday', '2026-11-21', '2026-11-21T10:15:30Z', '2026-02-30T00:00:00.000Z', '2026-11-21T10:15:30.123+00:00', 42, null, undefined])(
    'rejects %j', (value) => { expect(isTakenAt(value)).toBe(false); });
});

describe('OrderBuilder.setPaymentStatus takenAt', () => {
  function pendingLeg() {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
    const id = builder.addPayment({ method: 'external', amountMinor: 500, status: 'pending' });
    return { builder, id, leg: () => builder.getSnapshot().payments[0] };
  }

  it('a move to captured sets the status and the instant', () => {
    const { builder, id, leg } = pendingLeg();
    expect(builder.setPaymentStatus(id, 'captured', iso)).toBe(true);
    expect(leg()).toMatchObject({ status: 'captured', takenAt: iso });
  });

  it('a move to failed sets no takenAt', () => {
    const { builder, id, leg } = pendingLeg();
    expect(builder.setPaymentStatus(id, 'failed', iso)).toBe(true);
    expect(leg().status).toBe('failed');
    expect(leg()).not.toHaveProperty('takenAt');
  });

  it('a refused move sets nothing', () => {
    const { builder, id, leg } = pendingLeg();
    builder.setPaymentStatus(id, 'failed');
    expect(builder.setPaymentStatus(id, 'captured', iso)).toBe(false);
    expect(leg().status).toBe('failed');
    expect(leg()).not.toHaveProperty('takenAt');
  });
});
