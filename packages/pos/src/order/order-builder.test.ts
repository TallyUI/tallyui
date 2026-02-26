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
  getImageUrl: (doc) => doc.imageUrl,
  getImageUrls: (doc) => doc.imageUrl ? [doc.imageUrl] : [],
  getDescription: () => undefined,
  getStockStatus: () => 'instock',
  getStockQuantity: () => null,
  hasVariants: () => false,
  getType: () => 'simple',
  getBarcode: () => undefined,
  getCategoryNames: () => [],
};

const taxContext: TaxContext = {
  getTaxRate: () => 0.1,
  pricesIncludeTax: false,
};

const productDoc = { id: 'p1', name: 'Espresso', sku: 'ESP-001', price: 4.50 };
const productDoc2 = { id: 'p2', name: 'Latte', sku: 'LAT-001', price: 5.00 };

describe('OrderBuilder', () => {
  it('starts with an empty draft order', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const order = await firstValueFrom(builder.order$);
    expect(order.status).toBe('draft');
    expect(order.lineItems).toHaveLength(0);
    expect(order.subtotal).toBe(0);
    expect(order.total).toBe(0);
  });

  it('adds a product as a line item', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits);

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(1);
    expect(order.lineItems[0].name).toBe('Espresso');
    expect(order.lineItems[0].price).toBe(4.50);
    expect(order.lineItems[0].quantity).toBe(1);
    expect(order.lineItems[0].taxRate).toBe(0.1);
  });

  it('increments quantity when adding same product twice', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits);
    builder.addProduct(productDoc, traits);

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(1);
    expect(order.lineItems[0].quantity).toBe(2);
  });

  it('treats different products as separate line items', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits);
    builder.addProduct(productDoc2, traits);

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(2);
  });

  it('calculates line totals with tax (exclusive)', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits);

    const order = await firstValueFrom(builder.order$);
    const line = order.lineItems[0];
    expect(line.taxAmount).toBeCloseTo(0.45);
    expect(line.lineTotal).toBeCloseTo(4.95);
  });

  it('calculates order totals', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits);
    builder.addProduct(productDoc2, traits);

    const order = await firstValueFrom(builder.order$);
    expect(order.subtotal).toBeCloseTo(9.50);
    expect(order.taxTotal).toBeCloseTo(0.95);
    expect(order.total).toBeCloseTo(10.45);
    expect(order.balanceDue).toBeCloseTo(10.45);
  });

  it('updates line item quantity', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const lineId = builder.addProduct(productDoc, traits);
    builder.updateQuantity(lineId, 3);

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems[0].quantity).toBe(3);
    expect(order.subtotal).toBeCloseTo(13.50);
  });

  it('removes a line item', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const lineId = builder.addProduct(productDoc, traits);
    builder.addProduct(productDoc2, traits);
    builder.removeItem(lineId);

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(1);
    expect(order.lineItems[0].name).toBe('Latte');
  });

  it('sets and clears customer', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.setCustomer({ id: 'c1', name: 'Alice', email: 'alice@example.com' });

    let order = await firstValueFrom(builder.order$);
    expect(order.customer?.name).toBe('Alice');

    builder.setCustomer(null);
    order = await firstValueFrom(builder.order$);
    expect(order.customer).toBeNull();
  });

  it('sets note', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.setNote('Extra hot');

    const order = await firstValueFrom(builder.order$);
    expect(order.note).toBe('Extra hot');
  });

  it('clears the order', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits);
    builder.setNote('Test');
    builder.clear();

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(0);
    expect(order.note).toBe('');
    expect(order.subtotal).toBe(0);
  });

  it('handles tax-inclusive pricing', async () => {
    const inclTax: TaxContext = { getTaxRate: () => 0.1, pricesIncludeTax: true };
    const builder = createOrderBuilder({ currency: 'USD', taxContext: inclTax });
    builder.addProduct(productDoc, traits);

    const order = await firstValueFrom(builder.order$);
    const line = order.lineItems[0];
    expect(line.taxAmount).toBeCloseTo(0.41, 1);
    expect(line.lineTotal).toBeCloseTo(4.50);
    expect(order.subtotal).toBeCloseTo(4.09, 1);
    expect(order.total).toBeCloseTo(4.50);
  });

  it('adds product with specific quantity', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits, { quantity: 5 });

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems[0].quantity).toBe(5);
  });
});
