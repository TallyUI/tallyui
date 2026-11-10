import { describe, it, expect } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { createOrderBuilder } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import type { ProductTraits } from '@tallyui/core';
import type { TaxContext } from '../tax/types';

const traits: ProductTraits = {
  getId: (doc) => doc.id,
  getName: (doc) => doc.name,
  getSku: () => '',
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

const taxContext: TaxContext = { getTaxRatePpm: () => 0, pricesIncludeTax: false };

describe('payment leg status', () => {
  it('counts only captured legs and updates the balance on capture', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 3550 }, traits);
    const pendingId = builder.addPayment({ method: 'external', amountMinor: 1000, status: 'pending' });
    builder.addPayment({ method: 'cash', amountMinor: 500, status: 'captured' });
    expect(builder.getSnapshot()).toMatchObject({ paidMinor: 500, balanceDueMinor: 3050, changeDueMinor: 0 });
    expect(builder.setPaymentStatus(pendingId, 'captured')).toBe(true);
    expect(builder.getSnapshot()).toMatchObject({ paidMinor: 1500, balanceDueMinor: 2050 });
  });

  it('keeps the same snapshot for a refused move or unknown payment', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 3550 }, traits);
    const capturedId = builder.addPayment({ method: 'cash', amountMinor: 500, status: 'captured' });
    const before = builder.getSnapshot();
    expect(builder.setPaymentStatus(capturedId, 'pending')).toBe(false);
    expect(builder.getSnapshot()).toBe(before);
    expect(builder.setPaymentStatus('nope', 'voided')).toBe(false);
    expect(builder.getSnapshot()).toBe(before);
  });

  it('keeps a voided leg in the ledger without counting it', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 3550 }, traits);
    const id = builder.addPayment({ method: 'cash', amountMinor: 3550, status: 'captured' });
    expect(builder.setPaymentStatus(id, 'voided')).toBe(true);
    expect(builder.getSnapshot()).toMatchObject({
      paidMinor: 0, balanceDueMinor: 3550, payments: [{ id, amountMinor: 3550, status: 'voided' }],
    });
    expect(builder.getSnapshot().payments).toHaveLength(1);
  });

  it('does not add a status property to a legacy leg', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 3550 }, traits);
    builder.addPayment({ method: 'cash', amountMinor: 3550 });
    expect(builder.getSnapshot().payments[0]).not.toHaveProperty('status');
    expect(builder.getSnapshot().paidMinor).toBe(3550);
  });

  it('restores a voided leg without counting it', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 3550 }, traits);
    const id = builder.addPayment({ method: 'cash', amountMinor: 3550 });
    builder.setPaymentStatus(id, 'voided');
    const restored = restoreOrderDraft(builder.getSnapshot(), { currency: 'USD', taxContext });
    expect(restored.getSnapshot().payments[0].status).toBe('voided');
    expect(restored.getSnapshot().paidMinor).toBe(0);
  });
});

describe('payment splitting', () => {
  it.each([
    { amountMinor: 3500, balanceDueMinor: 0, changeDueMinor: 49 },
    { amountMinor: 3000, balanceDueMinor: 451, changeDueMinor: 0 },
  ])('tracks payment against Medusa #301: $amountMinor', ({ amountMinor, balanceDueMinor, changeDueMinor }) => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item 1', unitPrice: { amount: 850, currency: 'EUR' }, quantity: 2 });
    builder.addLine({ productId: 'p2', name: 'Item 2', unitPrice: { amount: 1200, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor });
    expect(builder.getSnapshot()).toMatchObject({ totalMinor: 3451, paidMinor: amountMinor, balanceDueMinor, changeDueMinor });
  });

  it('tracks a single payment', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 2000 }, traits);
    builder.addPayment({ method: 'cash', amountMinor: 2000 });

    const order = await firstValueFrom(builder.order$);
    expect(order.payments).toHaveLength(1);
    expect(order.balanceDueMinor).toBe(0);
    expect(order.changeDueMinor).toBe(0);
  });

  it('splits payment across two methods', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 3550 }, traits);
    builder.addPayment({ method: 'cash', amountMinor: 2000 });
    builder.addPayment({ method: 'card', amountMinor: 1550 });

    const order = await firstValueFrom(builder.order$);
    expect(order.payments).toHaveLength(2);
    expect(order.balanceDueMinor).toBe(0);
    expect(order.changeDueMinor).toBe(0);
  });

  it('calculates balance due when partially paid', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 3000 }, traits);
    builder.addPayment({ method: 'card', amountMinor: 1000 });

    const order = await firstValueFrom(builder.order$);
    expect(order.balanceDueMinor).toBe(2000);
    expect(order.changeDueMinor).toBe(0);
  });

  it('calculates change due when overpaid with cash', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 1700 }, traits);
    builder.addPayment({ method: 'cash', amountMinor: 2000 });

    const order = await firstValueFrom(builder.order$);
    expect(order.balanceDueMinor).toBe(0);
    expect(order.changeDueMinor).toBe(300);
  });

  it('removes a payment', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 2000 }, traits);
    const paymentId = builder.addPayment({ method: 'cash', amountMinor: 2000 });

    builder.removePayment(paymentId);
    const order = await firstValueFrom(builder.order$);
    expect(order.payments).toHaveLength(0);
    expect(order.balanceDueMinor).toBe(2000);
  });

  it('includes payment reference', async () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addProduct({ id: 'p1', name: 'Item', price: 1000 }, traits);
    builder.addPayment({ method: 'card', amountMinor: 1000, reference: 'TXN-4567' });

    const order = await firstValueFrom(builder.order$);
    expect(order.payments[0].reference).toBe('TXN-4567');
  });
});
