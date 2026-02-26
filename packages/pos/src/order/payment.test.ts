import { describe, it, expect } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { createOrderBuilder } from './order-builder';
import type { ProductTraits } from '@tallyui/core';
import type { TaxContext } from '../tax/types';

const traits: ProductTraits = {
  getId: (doc) => doc.id,
  getName: (doc) => doc.name,
  getSku: () => '',
  getPrice: (doc) => String(doc.price),
  getRegularPrice: (doc) => String(doc.price),
  getSalePrice: () => undefined,
  isOnSale: () => false,
  getImageUrl: () => undefined,
  getImageUrls: () => [],
  getDescription: () => undefined,
  getStockStatus: () => 'instock',
  getStockQuantity: () => null,
  hasVariants: () => false,
  getType: () => 'simple',
  getBarcode: () => undefined,
  getCategoryNames: () => [],
};

const taxContext: TaxContext = { getTaxRate: () => 0, pricesIncludeTax: false };

describe('payment splitting', () => {
  it('tracks a single payment', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 20 }, traits);
    builder.addPayment({ method: 'cash', amount: 20 });

    const order = await firstValueFrom(builder.order$);
    expect(order.payments).toHaveLength(1);
    expect(order.balanceDue).toBe(0);
    expect(order.changeDue).toBe(0);
  });

  it('splits payment across two methods', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 35.50 }, traits);
    builder.addPayment({ method: 'cash', amount: 20 });
    builder.addPayment({ method: 'card', amount: 15.50 });

    const order = await firstValueFrom(builder.order$);
    expect(order.payments).toHaveLength(2);
    expect(order.balanceDue).toBe(0);
    expect(order.changeDue).toBe(0);
  });

  it('calculates balance due when partially paid', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 30 }, traits);
    builder.addPayment({ method: 'card', amount: 10 });

    const order = await firstValueFrom(builder.order$);
    expect(order.balanceDue).toBeCloseTo(20);
    expect(order.changeDue).toBe(0);
  });

  it('calculates change due when overpaid with cash', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 17 }, traits);
    builder.addPayment({ method: 'cash', amount: 20 });

    const order = await firstValueFrom(builder.order$);
    expect(order.balanceDue).toBe(0);
    expect(order.changeDue).toBeCloseTo(3);
  });

  it('removes a payment', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 20 }, traits);
    const paymentId = builder.addPayment({ method: 'cash', amount: 20 });

    builder.removePayment(paymentId);
    const order = await firstValueFrom(builder.order$);
    expect(order.payments).toHaveLength(0);
    expect(order.balanceDue).toBe(20);
  });

  it('includes payment reference', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 10 }, traits);
    builder.addPayment({ method: 'card', amount: 10, reference: 'TXN-4567' });

    const order = await firstValueFrom(builder.order$);
    expect(order.payments[0].reference).toBe('TXN-4567');
  });
});
