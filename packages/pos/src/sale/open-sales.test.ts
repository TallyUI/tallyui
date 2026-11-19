import { describe, expect, it } from 'vitest';
import type { Order, ParkedOrderSummary } from '../order';
import { openSales } from './open-sales';

describe('openSales', () => {
  it("carries a parked draft's parkedAt and none on the current sale", () => {
    const order = {
      id: '3', lineItems: [{ name: 'Beanie' }], totalMinor: 1800,
      paidMinor: 0, balanceDueMinor: 1800, customer: null,
    } as unknown as Order;
    const parked: ParkedOrderSummary[] = [
      { id: '1', itemCount: 1, totalMinor: 2250, parkedAt: '2026-11-17T08:00:00.000Z', source: 'local' },
      { id: '2', itemCount: 1, totalMinor: 1800, parkedAt: '', source: 'local' },
    ];

    const sales = openSales(order, parked);
    expect(sales[0].parkedAt).toBe('2026-11-17T08:00:00.000Z');
    expect(sales[1].parkedAt).toBeUndefined();
    expect(sales[2].parkedAt).toBeUndefined();
  });
});
