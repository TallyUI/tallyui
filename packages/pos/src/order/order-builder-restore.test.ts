import { describe, expect, it } from 'vitest';
import { createOrderBuilder } from './order-builder';
import type { TaxContext } from '../tax/types';

const taxContext: TaxContext = { pricesIncludeTax: false, getTaxRatePpm: () => 100000 };
const line = (id: string) => ({ id, productId: id, name: id, unitPrice: { amount: 1000, currency: 'EUR' }, separate: true as const });

describe('OrderBuilder.restoreItem (#1095)', () => {
  it('T9: throws a RangeError for an id already on the order, or a line discount id that is', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext });
    builder.addLine(line('a'));
    builder.addLine(line('b'));
    builder.applyLineDiscount('b', { id: 'disc', type: 'percentage', value: 10 });
    const a = builder.getSnapshot().lineItems[0];
    const b = builder.getSnapshot().lineItems[1];
    const before = builder.getSnapshot();
    expect(() => builder.restoreItem('line', a, 0)).toThrow(RangeError);
    // A line whose own id is new but whose discount id is on the order (line b's).
    expect(() => builder.restoreItem('line', { ...b, id: 'c' }, 0)).toThrow(RangeError);
    expect(builder.getSnapshot()).toBe(before);
    builder.removeItem('a');
    builder.restoreItem('line', a, 0);
    expect(builder.getSnapshot().lineItems.map((li) => li.id)).toEqual(['a', 'b']);
  });
});
