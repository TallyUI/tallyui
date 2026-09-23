import { describe, it, expect } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { createOrderBuilder } from './order-builder';
import type { ProductTraits } from '@tallyui/core';
import type { TaxContext } from '../tax/types';

const traits: ProductTraits = {
  getId: (doc) => doc.id,
  getName: (doc) => doc.name,
  getSku: (doc) => doc.sku ?? '',
  getPrices: (doc, context) => [{ amount: doc.price, currency: context?.currency ?? 'USD', kind: 'base' }],
  getStock: () => ({ status: 'in_stock' }),
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
  isSellable: () => true,
  getVariantCount: () => 1,
  getType: () => 'simple',
  getBarcode: () => undefined,
  getCategoryNames: () => [],
};

const taxContext: TaxContext = { getTaxRate: () => 0.1, pricesIncludeTax: false };
const product = { id: 'p1', name: 'Coffee', price: 1000 };

describe('discount engine', () => {
  it('rounds percentage discounts half away from zero to minor units', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRate: () => 0, pricesIncludeTax: false } });
    const lineId = builder.addProduct({ ...product, price: 5 }, traits);
    builder.applyLineDiscount(lineId, { type: 'percentage', value: 10 });
    builder.applyOrderDiscount({ type: 'percentage', value: 12.5 });
    const order = builder.getSnapshot();
    expect(order.lineItems[0]).toMatchObject({ discountMinor: 1, netMinor: 4 });
    expect(order.discounts[0].amountMinor).toBe(1);
    expect(order.totalMinor).toBe(3);
  });

  it('caps combined line discounts at gross and fixed order discounts at the remaining total', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const lineId = builder.addProduct(product, traits);
    builder.applyLineDiscount(lineId, { type: 'fixed', value: 800 });
    builder.applyLineDiscount(lineId, { type: 'fixed', value: 800 });
    expect(builder.getSnapshot().lineItems[0]).toMatchObject({ discountMinor: 1000, netMinor: 0, taxMicros: '0' });
    builder.addProduct({ ...product, id: 'p2' }, traits);
    builder.applyOrderDiscount({ type: 'percentage', value: 20 });
    builder.applyOrderDiscount({ type: 'fixed', value: 1000 });
    const order = builder.getSnapshot();
    expect(order.discounts.map((d) => d.amountMinor)).toEqual([200, 900]);
    expect(order).toMatchObject({ totalMinor: 0, discountMinor: 2100 });
  });

  it('rejects non-integer fixed discounts without changing the order', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const lineId = builder.addProduct(product, traits);
    expect(() => builder.applyLineDiscount(lineId, { type: 'fixed', value: 1.5 })).toThrow(RangeError);
    expect(() => builder.applyOrderDiscount({ type: 'fixed', value: 1.5 })).toThrow(RangeError);
    builder.setNote('Still usable');
    expect(builder.getSnapshot()).toMatchObject({ discounts: [], totalMinor: 1100 });
    expect(builder.getSnapshot().lineItems[0].discounts).toEqual([]);
  });

  it('never makes the total negative with an oversized percentage order discount', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(product, traits);
    builder.applyOrderDiscount({ type: 'percentage', value: 200 });
    expect(builder.getSnapshot().totalMinor).toBe(0);
  });

  describe('line-level discounts', () => {
    it('applies a percentage discount to a line item', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct(product, traits);
      builder.applyLineDiscount(lineId, { type: 'percentage', value: 10, label: '10% off' });

      const order = await firstValueFrom(builder.order$);
      const line = order.lineItems[0];
      expect(line.discountMinor).toBe(100);
      expect(order.totalMinor).toBe(990); // (10 - 1) + 0.90 tax
    });

    it('applies a fixed discount to a line item', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct(product, traits);
      builder.applyLineDiscount(lineId, { type: 'fixed', value: 300 });

      const order = await firstValueFrom(builder.order$);
      const line = order.lineItems[0];
      expect(line.discountMinor).toBe(300);
      expect(order.totalMinor).toBe(770); // (10 - 3) + 0.70 tax
    });

    it('caps fixed discount at line gross', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct(product, traits);
      builder.applyLineDiscount(lineId, { type: 'fixed', value: 5000 });

      const order = await firstValueFrom(builder.order$);
      expect(order.lineItems[0].discountMinor).toBe(1000);
    });
  });

  describe('order-level discounts', () => {
    it('applies a percentage discount to the order', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      builder.addProduct(product, traits);
      builder.applyOrderDiscount({ type: 'percentage', value: 20 });

      const order = await firstValueFrom(builder.order$);
      expect(order.discountMinor).toBe(200);
      expect(order.totalMinor).toBe(900); // 11 - 2
    });

    it('applies a fixed discount to the order', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      builder.addProduct(product, traits);
      builder.applyOrderDiscount({ type: 'fixed', value: 500 });

      const order = await firstValueFrom(builder.order$);
      expect(order.discountMinor).toBe(500);
    });
  });

  describe('discount recalculation on quantity change', () => {
    it('percentage discount recalculates when quantity changes', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct(product, traits); // $10
      builder.applyLineDiscount(lineId, { type: 'percentage', value: 10 }); // 10% = $1

      // Change quantity to 3 — discount should now be $3 (10% of $30)
      builder.updateQuantity(lineId, 3);

      const order = await firstValueFrom(builder.order$);
      const line = order.lineItems[0];
      expect(line.discountMinor).toBe(300); // 10% of $30
      expect(order.totalMinor).toBe(2970); // ($30 - $3) + $2.70 tax
    });

    it('fixed discount recalculates (caps) when quantity changes', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct({ id: 'p1', name: 'Cheap', price: 200 }, traits);
      builder.applyLineDiscount(lineId, { type: 'fixed', value: 500 }); // capped at $2

      // Change quantity to 3 — gross now $6, fixed $5 is no longer capped
      builder.updateQuantity(lineId, 3);

      const order = await firstValueFrom(builder.order$);
      expect(order.lineItems[0].discountMinor).toBe(500);
    });

    it('stacks multiple discounts on the same line', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct(product, traits); // $10
      builder.applyLineDiscount(lineId, { type: 'percentage', value: 10, label: '10% off' });
      builder.applyLineDiscount(lineId, { type: 'fixed', value: 200, label: '$2 off' });

      const order = await firstValueFrom(builder.order$);
      const line = order.lineItems[0];
      expect(line.discounts).toHaveLength(2);
      expect(line.discountMinor).toBe(300); // $1 + $2
    });
  });

  describe('removing discounts', () => {
    it('removes a line discount by id', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct(product, traits);
      builder.applyLineDiscount(lineId, { type: 'fixed', value: 200 });

      let order = await firstValueFrom(builder.order$);
      const discountId = order.lineItems[0].discounts[0].id;
      builder.removeDiscount(discountId);

      order = await firstValueFrom(builder.order$);
      expect(order.lineItems[0].discountMinor).toBe(0);
    });

    it('removes an order discount by id', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      builder.addProduct(product, traits);
      builder.applyOrderDiscount({ type: 'fixed', value: 500 });

      let order = await firstValueFrom(builder.order$);
      const discountId = order.discounts[0].id;
      builder.removeDiscount(discountId);

      order = await firstValueFrom(builder.order$);
      expect(order.discounts).toHaveLength(0);
      expect(order.discountMinor).toBe(0);
    });
  });
});
