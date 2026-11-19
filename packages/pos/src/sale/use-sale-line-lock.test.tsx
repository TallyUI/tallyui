import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { createOrderBuilder, type Order } from '../order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { SALE_HAS_PAYMENT, useSale } from './use-sale';

const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
    { id: 'red', title: 'Red', sku: 'RED', prices: [{ amount: 10, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };
type Sale = ReturnType<typeof useSale>;

function renderSale() {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  return renderHook(() => useSale(pricing, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 5 },
  }), { wrapper: Wrapper });
}

/** A sale with two lines (one of quantity 2), a line discount, a fee and shipping, in the cash tender stage. */
function saleInTender() {
  const hook = renderSale();
  act(() => {
    hook.result.current.add(entries[0], traits);
    hook.result.current.add(entries[0], traits);
    hook.result.current.add(entries[1], traits);
  });
  const [blue, red] = hook.result.current.order.lineItems;
  act(() => {
    expect(hook.result.current.applyDiscount(red.id, { type: 'percentage', value: 10 })).toBeNull();
    hook.result.current.addFee({ name: 'Bag', amountMinor: 120 });
    hook.result.current.addShipping({ name: 'Delivery', amountMinor: 240, methodId: 'post' });
    hook.result.current.startTender('cash');
  });
  expect(hook.result.current.stage.kind).toBe('tender');
  const order = hook.result.current.order;
  return { ...hook, ids: { blue: blue.id, red: red.id, fee: order.fees![0].id, shipping: order.shipping![0].id, discount: order.lineItems[1].discounts[0].id } };
}

/** Lines, fees, shipping, discounts and totals: everything a line or total change moves. */
function bill(order: Order) {
  const { lineItems, fees, shipping, discounts, subtotalMinor, discountMinor, taxMinor, totalMinor } = order;
  return { lineItems, fees, shipping, discounts, subtotalMinor, discountMinor, taxMinor, totalMinor };
}

type Ids = ReturnType<typeof saleInTender>['ids'];
const methods: [string, (sale: Sale, ids: Ids) => unknown, 'refusal' | 'void'][] = [
  ['add', (sale) => sale.add(entries[1], traits), 'refusal'],
  ['setQuantity', (sale, ids) => sale.setQuantity(ids.blue, 5), 'void'],
  ['splitLine', (sale, ids) => sale.splitLine(ids.blue), 'refusal'],
  ['remove', (sale, ids) => sale.remove(ids.blue), 'void'],
  ['setUnitPrice', (sale, ids) => sale.setUnitPrice(ids.blue, 1), 'refusal'],
  ['applyDiscount', (sale) => sale.applyDiscount(null, { type: 'fixed', value: 100 }), 'refusal'],
  ['removeDiscount', (sale, ids) => sale.removeDiscount(ids.discount), 'void'],
  ['addFee', (sale) => sale.addFee({ name: 'Wrap', amountMinor: 50 }), 'refusal'],
  ['updateFee', (sale, ids) => sale.updateFee(ids.fee, { amountMinor: 999 }), 'refusal'],
  ['removeFee', (sale, ids) => sale.removeFee(ids.fee), 'refusal'],
  ['addShipping', (sale) => sale.addShipping({ name: 'Courier', amountMinor: 50 }), 'refusal'],
  ['updateShipping', (sale, ids) => sale.updateShipping(ids.shipping, { amountMinor: 999 }), 'refusal'],
  ['removeShipping', (sale, ids) => sale.removeShipping(ids.shipping), 'refusal'],
  ['addCustomLine', (sale) => sale.addCustomLine({ name: 'Gift', priceMinor: 300 }), 'refusal'],
  ['applyCoupon', (sale) => sale.applyCoupon('ten'), 'refusal'],
  ['removeCoupon', (sale) => sale.removeCoupon('ten'), 'refusal'],
];

afterEach(cleanup);

describe('useSale line lock while a till leg is live', () => {
  it.each(methods)('L1: %s is refused under a captured cash leg', async (_name, call, kind) => {
    const { result, ids } = saleInTender();
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 500 })).toEqual(expect.any(String)); });
    const before = bill(result.current.order);
    let returned: unknown;
    await act(async () => { returned = await call(result.current, ids); });
    expect(returned).toBe(kind === 'void' ? undefined : SALE_HAS_PAYMENT);
    expect(bill(result.current.order)).toEqual(before);
    expect(result.current.error).toBe(SALE_HAS_PAYMENT);
  });

  it.each(['pending', 'authorized'] as const)('L2: a single %s leg locks setQuantity and addFee', (status) => {
    const { result, ids } = saleInTender();
    act(() => {
      const id = result.current.addTender({ method: 'external', amountMinor: 500, status: 'pending' });
      if (status === 'authorized') expect(result.current.setTenderStatus(id!, 'authorized')).toBe(true);
    });
    expect(result.current.order.payments[0].status).toBe(status);
    const before = bill(result.current.order);
    act(() => {
      result.current.setQuantity(ids.blue, 5);
      expect(result.current.addFee({ name: 'Wrap', amountMinor: 50 })).toBe(SALE_HAS_PAYMENT);
    });
    expect(bill(result.current.order)).toEqual(before);
    expect(result.current.error).toBe(SALE_HAS_PAYMENT);
  });

  it('L3: voiding the only live leg lets setQuantity and applyDiscount apply again', () => {
    const { result, ids } = saleInTender();
    act(() => {
      const id = result.current.addTender({ method: 'cash', amountMinor: 500 });
      expect(result.current.voidTender(id!)).toBe(true);
    });
    act(() => {
      result.current.setQuantity(ids.blue, 5);
      expect(result.current.applyDiscount(null, { type: 'fixed', value: 100 })).toBeNull();
    });
    expect(result.current.order.lineItems[0].quantity).toBe(5);
    expect(result.current.order.discounts).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('L4: a leg moved to failed does not lock', () => {
    const { result, ids } = saleInTender();
    act(() => {
      const id = result.current.addTender({ method: 'external', amountMinor: 500, status: 'pending' });
      expect(result.current.setTenderStatus(id!, 'failed')).toBe(true);
    });
    act(() => { result.current.setQuantity(ids.blue, 5); });
    expect(result.current.order.lineItems[0].quantity).toBe(5);
    expect(result.current.error).toBeNull();
  });

  it('L5: a reopened order whose only payments are locked store legs edits freely in the cart', () => {
    const { result } = renderSale();
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false }, storeOrder: { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' } });
    builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.addPayment({ method: 'external', amountMinor: 500, reference: 'Cash', storePaymentId: 'p1', locked: true });
    act(() => { expect(result.current.openStoreOrder(builder.getSnapshot())).toBeNull(); });
    expect(result.current.stage.kind).toBe('cart');
    const lineId = result.current.order.lineItems[0].id;
    act(() => {
      result.current.setQuantity(lineId, 3);
      expect(result.current.addFee({ name: 'Wrap', amountMinor: 50 })).toEqual({ id: expect.any(String) });
    });
    expect(result.current.order.lineItems[0].quantity).toBe(3);
    expect(result.current.order.fees).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('L6: in the tender stage with no leg taken, setQuantity still applies', () => {
    const { result, ids } = saleInTender();
    act(() => { result.current.setQuantity(ids.blue, 5); });
    expect(result.current.order.lineItems[0].quantity).toBe(5);
    expect(result.current.error).toBeNull();
  });
});
