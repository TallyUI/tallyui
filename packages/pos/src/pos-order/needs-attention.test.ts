// Ported from medusapos/app `563b03c4` `lib/order-store.test.ts` (ADR-052, TV7), word for word.
import { describe, expect, it } from 'vitest';
import { createOrderBuilder } from '../order';
import { finalizeOrder } from './finalize';
import { needsAttention } from './needs-attention';
import type { PosOrder } from './types';

function sale(): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  builder.addLine({ productId: 'shirt', variantId: 'blue', name: 'Blue shirt', unitPrice: { amount: 1200, currency: 'EUR' } });
  builder.addPayment({ method: 'cash', amountMinor: 1200 });
  return finalizeOrder(builder.getSnapshot());
}

describe('needsAttention', () => {
  it('selects rejected and applied-with-warnings orders newest first without changing the input', () => {
    const base = sale();
    const rejected: PosOrder = { ...base, id: 'rejected', syncStatus: 'rejected', createdAt: '2026-01-01T00:00:00Z' };
    const warned: PosOrder = { ...base, id: 'warned', syncStatus: 'applied', createdAt: '2026-01-03T00:00:00Z',
      warnings: [{ code: 'insufficient_stock', variantId: 'blue', quantity: 1 }] };
    const orders: PosOrder[] = [rejected, base, { ...base, syncStatus: 'applied', warnings: [] }, warned,
      { ...base, syncStatus: 'applied' }, { ...base, warnings: warned.warnings }];
    expect(needsAttention(orders)).toEqual([warned, rejected]);
    expect(orders[0]).toBe(rejected);
  });
});
