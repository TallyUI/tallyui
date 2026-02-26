import { describe, it, expect } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { createOrderBuilder } from './order-builder';
import type { ProductTraits } from '@tallyui/core';
import type { TaxContext } from '../tax/types';

const traits: ProductTraits = {
  getId: (doc) => doc.id,
  getName: (doc) => doc.name,
  getSku: (doc) => doc.sku ?? '',
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

const taxContext: TaxContext = { getTaxRate: () => 0.1, pricesIncludeTax: false };
const product = { id: 'p1', name: 'Coffee', price: 10 };

describe('discount engine', () => {
  describe('line-level discounts', () => {
    it('applies a percentage discount to a line item', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct(product, traits);
      builder.applyLineDiscount(lineId, { type: 'percentage', value: 10, label: '10% off' });

      const order = await firstValueFrom(builder.order$);
      const line = order.lineItems[0];
      expect(line.discountAmount).toBeCloseTo(1.00);
      expect(line.lineTotal).toBeCloseTo(9.90); // (10 - 1) + 0.90 tax
    });

    it('applies a fixed discount to a line item', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct(product, traits);
      builder.applyLineDiscount(lineId, { type: 'fixed', value: 3 });

      const order = await firstValueFrom(builder.order$);
      const line = order.lineItems[0];
      expect(line.discountAmount).toBe(3);
      expect(line.lineTotal).toBeCloseTo(7.70); // (10 - 3) + 0.70 tax
    });

    it('caps fixed discount at line gross', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct(product, traits);
      builder.applyLineDiscount(lineId, { type: 'fixed', value: 50 });

      const order = await firstValueFrom(builder.order$);
      expect(order.lineItems[0].discountAmount).toBe(10);
    });
  });

  describe('order-level discounts', () => {
    it('applies a percentage discount to the order', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      builder.addProduct(product, traits);
      builder.applyOrderDiscount({ type: 'percentage', value: 20 });

      const order = await firstValueFrom(builder.order$);
      expect(order.discountTotal).toBeCloseTo(2.00);
      expect(order.total).toBeCloseTo(9.00); // 11 - 2
    });

    it('applies a fixed discount to the order', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      builder.addProduct(product, traits);
      builder.applyOrderDiscount({ type: 'fixed', value: 5 });

      const order = await firstValueFrom(builder.order$);
      expect(order.discountTotal).toBeCloseTo(5.00);
    });
  });

  describe('removing discounts', () => {
    it('removes a line discount by id', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      const lineId = builder.addProduct(product, traits);
      builder.applyLineDiscount(lineId, { type: 'fixed', value: 2 });

      let order = await firstValueFrom(builder.order$);
      const discountId = order.lineItems[0].discounts[0].id;
      builder.removeDiscount(discountId);

      order = await firstValueFrom(builder.order$);
      expect(order.lineItems[0].discountAmount).toBe(0);
    });

    it('removes an order discount by id', async () => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      builder.addProduct(product, traits);
      builder.applyOrderDiscount({ type: 'fixed', value: 5 });

      let order = await firstValueFrom(builder.order$);
      const discountId = order.discounts[0].id;
      builder.removeDiscount(discountId);

      order = await firstValueFrom(builder.order$);
      expect(order.discounts).toHaveLength(0);
      expect(order.discountTotal).toBe(0);
    });
  });
});
