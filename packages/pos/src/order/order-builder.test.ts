import { describe, it, expect, vi } from 'vitest';
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
  getImageUrl: (doc) => doc.imageUrl,
  getImageUrls: (doc) => doc.imageUrl ? [doc.imageUrl] : [],
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

const taxContext: TaxContext = {
  getTaxRate: () => 0.1,
  pricesIncludeTax: false,
};

const productDoc = { id: 'p1', name: 'Espresso', sku: 'ESP-001', price: 450 };
const productDoc2 = { id: 'p2', name: 'Latte', sku: 'LAT-001', price: 500 };

describe('OrderBuilder', () => {
  it.each([
    { name: 'Medusa #301', lines: [[850, 2], [1200, 1]], subtotalMinor: 2900, taxMinor: 551, totalMinor: 3451 },
    { name: 'Medusa vector A', lines: [[150, 1], [35, 3], [5, 1]], subtotalMinor: 260, taxMinor: 49, totalMinor: 309 },
  ])('rounds tax once per order: $name', ({ lines, subtotalMinor, taxMinor, totalMinor }) => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRate: () => 0.19, pricesIncludeTax: false } });
    lines.forEach(([amount, quantity], index) => builder.addLine({
      productId: `p${index}`, variantId: `v${index}`, name: 'Medusa item',
      unitPrice: { amount, currency: 'EUR' }, quantity,
    }));
    const order = builder.getSnapshot();
    expect(order).toMatchObject({ subtotalMinor, taxMinor, totalMinor, pricesIncludeTax: false, paidMinor: 0 });
    expect(JSON.parse(JSON.stringify(order))).toEqual(order);
  });

  it('extracts inclusive 19% tax', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRate: () => 0.19, pricesIncludeTax: true } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1190, currency: 'EUR' } });
    expect(builder.getSnapshot()).toMatchObject({ subtotalMinor: 1000, taxMinor: 190, totalMinor: 1190, pricesIncludeTax: true });
  });

  it.each([
    { unitPrice: { amount: 100, currency: 'EUR' } },
    { unitPrice: { amount: 1.5, currency: 'USD' } },
    { unitPrice: { amount: 100, currency: 'USD' }, quantity: 0 },
    { unitPrice: { amount: 100, currency: 'USD' }, quantity: 1.5 },
  ])('rejects invalid addLine input: %j', (input) => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    expect(() => builder.addLine({ productId: 'p1', name: 'Item', ...input })).toThrow(RangeError);
    expect(builder.getSnapshot().lineItems).toHaveLength(0);
  });

  it('resolves a sale price from getPrices in the upper-case order currency', () => {
    const getPrices = vi.fn(() => [
      { amount: 100, currency: 'EUR', kind: 'base' as const },
      { amount: 500, currency: 'USD', kind: 'base' as const },
      { amount: 400, currency: 'USD', kind: 'sale' as const },
    ]);
    const getPrice = vi.fn(() => { throw new Error('Deprecated accessor'); });
    const builder = createOrderBuilder({ currency: 'usd', taxContext });
    builder.addProduct(productDoc, { ...traits, getPrices, getPrice });
    expect(getPrices).toHaveBeenCalledWith(productDoc, { currency: 'USD' });
    expect(getPrice).not.toHaveBeenCalled();
    expect(builder.getSnapshot().currency).toBe('USD');
    expect(builder.getSnapshot().lineItems[0].unitPriceMinor).toBe(400);
  });

  it('merges only matching products, variants, prices and tax rates', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const input = { productId: 'p1', variantId: 'v1', name: 'Item', unitPrice: { amount: 1000, currency: 'USD' }, taxRates: [{ code: 'STATE', ratePpm: 60000 }] };
    const id = builder.addLine(input);
    expect(builder.addLine({ ...input, quantity: 2 })).toBe(id);
    builder.addLine({ ...input, unitPrice: { amount: 1100, currency: 'USD' } });
    builder.addLine({ ...input, taxRates: [{ code: 'STATE', ratePpm: 70000 }] });
    builder.addLine({ ...input, taxRates: [{ code: 'CITY', ratePpm: 60000 }] });
    builder.addLine({ ...input, variantId: 'v2' });
    expect(builder.getSnapshot().lineItems).toHaveLength(5);
    expect(builder.getSnapshot().lineItems[0].quantity).toBe(3);
  });

  it.each([false, true])('calculates stacked taxes (inclusive: %s)', (pricesIncludeTax) => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRate: () => 0.19, pricesIncludeTax } });
    builder.addLine({
      productId: 'p1', name: 'Item', unitPrice: { amount: pricesIncludeTax ? 1085 : 1000, currency: 'USD' },
      taxRates: [{ code: 'STATE', ratePpm: 60000 }, { code: 'CITY', ratePpm: 25000 }],
    });
    const order = builder.getSnapshot();
    expect(order).toMatchObject({ subtotalMinor: 1000, taxMinor: 85, totalMinor: 1085 });
    expect(order.lineItems[0].taxMicros).toBe('85000000');
    expect(order.lineItems[0].taxLines).toEqual([
      { code: 'STATE', ratePpm: 60000, taxMicros: '60000000' },
      { code: 'CITY', ratePpm: 25000, taxMicros: '25000000' },
    ]);
  });

  it('puts the inclusive micro-unit split remainder on the last tax line', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRate: () => 0, pricesIncludeTax: true } });
    builder.addLine({
      productId: 'p1', name: 'Item', unitPrice: { amount: 1, currency: 'USD' },
      taxRates: [{ ratePpm: 60000 }, { ratePpm: 25000 }],
    });
    const line = builder.getSnapshot().lineItems[0];
    expect(line.taxMicros).toBe('78341');
    expect(line.taxLines.map((tax) => tax.taxMicros)).toEqual(['55299', '23042']);
  });

  it('starts with an empty draft order', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const order = await firstValueFrom(builder.order$);
    expect(order.status).toBe('draft');
    expect(order.lineItems).toHaveLength(0);
    expect(order.subtotalMinor).toBe(0);
    expect(order.totalMinor).toBe(0);
  });

  it('adds a product as a line item', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits);

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(1);
    expect(order.lineItems[0].name).toBe('Espresso');
    expect(order.lineItems[0].unitPriceMinor).toBe(450);
    expect(order.lineItems[0].quantity).toBe(1);
    expect(order.lineItems[0].taxLines).toEqual([{ ratePpm: 100000, taxMicros: '45000000' }]);
  });

  it('increments quantity when adding same product twice', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits);
    const firstEmission = await firstValueFrom(builder.order$);
    builder.addProduct(productDoc, traits);
    expect(firstEmission.lineItems[0].quantity).toBe(1);

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
    expect(line.taxMicros).toBe('45000000');
    expect(line.netMinor).toBe(450);
    expect(order.totalMinor).toBe(495);
  });

  it('calculates order totals', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits);
    builder.addProduct(productDoc2, traits);

    const order = await firstValueFrom(builder.order$);
    expect(order.subtotalMinor).toBe(950);
    expect(order.taxMinor).toBe(95);
    expect(order.totalMinor).toBe(1045);
    expect(order.balanceDueMinor).toBe(1045);
  });

  it('updates line item quantity', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const lineId = builder.addProduct(productDoc, traits);
    builder.updateQuantity(lineId, 3);

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems[0].quantity).toBe(3);
    expect(order.subtotalMinor).toBe(1350);
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
    expect(order.subtotalMinor).toBe(0);
  });

  it('handles tax-inclusive pricing', async () => {
    const inclTax: TaxContext = { getTaxRate: () => 0.1, pricesIncludeTax: true };
    const builder = createOrderBuilder({ currency: 'USD', taxContext: inclTax });
    builder.addProduct(productDoc, traits);

    const order = await firstValueFrom(builder.order$);
    const line = order.lineItems[0];
    expect(line.taxMicros).toBe('40909091');
    expect(order.taxMinor).toBe(41);
    expect(order.totalMinor).toBe(450);
    expect(order.subtotalMinor).toBe(409);
    expect(order.totalMinor).toBe(450);
  });

  it('adds product with specific quantity', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits, { quantity: 5 });

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems[0].quantity).toBe(5);
  });

  it('removes line item when quantity set to 0', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const lineId = builder.addProduct(productDoc, traits);
    builder.updateQuantity(lineId, 0);

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(0);
    expect(order.subtotalMinor).toBe(0);
  });

  it('removes line item when quantity set to negative', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const lineId = builder.addProduct(productDoc, traits);
    builder.updateQuantity(lineId, -1);

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(0);
  });

  it('getSnapshot() matches order$ emission', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits);

    const fromObservable = await firstValueFrom(builder.order$);
    const fromSnapshot = builder.getSnapshot();
    expect(fromSnapshot.id).toBe(fromObservable.id);
    expect(fromSnapshot.lineItems).toEqual(fromObservable.lineItems);
    expect(fromSnapshot.totalMinor).toBe(fromObservable.totalMinor);
  });

  it('clear() resets payments, customer, and discounts', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const lineId = builder.addProduct(productDoc, traits);
    builder.setCustomer({ id: 'c1', name: 'Alice' });
    builder.addPayment({ method: 'cash', amountMinor: 500 });
    builder.applyLineDiscount(lineId, { type: 'fixed', value: 100 });
    builder.applyOrderDiscount({ type: 'percentage', value: 10 });
    builder.clear();

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(0);
    expect(order.payments).toHaveLength(0);
    expect(order.discounts).toHaveLength(0);
    expect(order.customer).toBeNull();
    expect(order.note).toBe('');
  });

  it('throws when there is no price in the order currency', () => {
    const noPriceTraits = { ...traits, getPrices: () => [{ amount: 450, currency: 'EUR', kind: 'base' as const }] };
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    expect(() => builder.addProduct(productDoc, noPriceTraits))
      .toThrow('No price in USD for product p1');
    expect(builder.getSnapshot().lineItems).toHaveLength(0);
  });

  it('adds same product with different variantIds as separate lines', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits, { variantId: 'small' });
    builder.addProduct(productDoc, traits, { variantId: 'large' });

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(2);
  });

  it('merges same product+variant on second add', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct(productDoc, traits, { variantId: 'small' });
    builder.addProduct(productDoc, traits, { variantId: 'small' });

    const order = await firstValueFrom(builder.order$);
    expect(order.lineItems).toHaveLength(1);
    expect(order.lineItems[0].quantity).toBe(2);
  });
});
