import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { Order } from '../order';
import type { PosOrder } from '../pos-order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { SALE_FINISHED, SALE_HAS_PAYMENT, useSale } from './use-sale';

const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
    { id: 'red', title: 'Red', sku: 'RED', prices: [{ amount: 10, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };
type Options = Parameters<typeof useSale>[1];

function renderSale(overrides: Partial<Options> = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  return renderHook(() => useSale(pricing, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 5 }, ...overrides,
  }), { wrapper: Wrapper });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A one-line sale paid by a captured cash leg and completed: the receipt stage, with the finished builder still live. */
async function saleOnReceipt(overrides: Partial<Options> = {}) {
  const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
  const hook = renderSale({ onSaleCompleted, ...overrides });
  act(() => { hook.result.current.add(entries[0], traits); });
  act(() => { expect(hook.result.current.addTender({ method: 'cash', amountMinor: 1250 })).toEqual(expect.any(String)); });
  await act(async () => { await hook.result.current.complete(); });
  const receipt = hook.result.current.stage;
  if (receipt.kind !== 'receipt') throw new Error('Expected receipt');
  expect(onSaleCompleted).toHaveBeenCalledTimes(1);
  return { ...hook, onSaleCompleted, receipt };
}

/** Lines, charges and totals: everything a line or total change moves. */
function bill(order: Pick<Order, 'lineItems' | 'fees' | 'shipping' | 'discounts' | 'payments' | 'subtotalMinor' | 'discountMinor' | 'taxMinor' | 'totalMinor'>) {
  const { lineItems, fees, shipping, discounts, payments, subtotalMinor, discountMinor, taxMinor, totalMinor } = order;
  return { lineItems, fees, shipping, discounts, payments, subtotalMinor, discountMinor, taxMinor, totalMinor };
}

afterEach(cleanup);

describe('useSale on the receipt stage', () => {
  it('R1: add starts the next sale with that entry', async () => {
    const { result, onSaleCompleted, receipt } = await saleOnReceipt();
    let added: unknown;
    act(() => { added = result.current.add(entries[1], traits); });
    expect(added).toEqual({ lineId: expect.any(String) });
    expect(result.current.stage.kind).toBe('cart');
    expect(result.current.order.id).not.toBe(receipt.order.id);
    expect(result.current.order.lineItems).toHaveLength(1);
    expect(result.current.order.lineItems[0]).toMatchObject({ id: (added as { lineId: string }).lineId, variantId: 'red', quantity: 1 });
    expect(result.current.order.payments).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
  });

  it('R2: setQuantity and addFee are refused with SALE_FINISHED and change nothing', async () => {
    const { result, receipt } = await saleOnReceipt();
    const before = bill(result.current.order);
    const lineId = result.current.order.lineItems[0].id;
    let quantity: unknown = 'unset', fee: unknown;
    act(() => {
      quantity = result.current.setQuantity(lineId, 5);
      fee = result.current.addFee({ name: 'Wrap', amountMinor: 50 });
    });
    expect(quantity).toBeUndefined();
    expect(fee).toBe(SALE_FINISHED);
    expect(result.current.error).toBe(SALE_FINISHED);
    expect(result.current.stage).toBe(receipt);
    expect(bill(result.current.order)).toEqual(before);
    expect(bill(receipt.order)).toEqual(before);
  });

  it.each([
    ['no tenderGate', false],
    ['a tenderGate that resolves null', true],
  ] as const)('R3: startTender is refused with %s, and the sale is never sent twice', async (_name, gated) => {
    const tenderGate = vi.fn(async () => null);
    const { result, onSaleCompleted, receipt } = await saleOnReceipt(gated ? { tenderGate } : {});
    await act(async () => { result.current.startTender('cash'); await flush(); });
    expect(tenderGate).not.toHaveBeenCalled();
    expect(result.current.stage).toBe(receipt);
    expect(result.current.error).toBe(SALE_FINISHED);
    expect(result.current.order.payments).toEqual([expect.objectContaining({ method: 'cash', amountMinor: 1250 })]);
    expect(receipt.order.payments).toEqual([expect.objectContaining({ method: 'cash', amountMinor: 1250 })]);
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
  });

  it('R3: a tenderGate still pending when the sale completes does not re-open the tender', async () => {
    let answer!: (refusal: string | null) => void;
    const tenderGate = vi.fn(() => new Promise<string | null>((resolve) => { answer = resolve; }));
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted, tenderGate });
    act(() => { result.current.add(entries[0], traits); });
    await act(async () => { result.current.startTender('cash'); await flush(); });
    expect(tenderGate).toHaveBeenCalledTimes(1);
    act(() => { result.current.addTender({ method: 'cash', amountMinor: 1250 }); });
    await act(async () => { await result.current.complete(); });
    const receipt = result.current.stage;
    expect(receipt.kind).toBe('receipt');
    await act(async () => { answer(null); await flush(); });
    expect(result.current.stage).toBe(receipt);
    expect(result.current.error).toBe(SALE_FINISHED);
    expect(result.current.order.payments).toHaveLength(1);
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
  });

  it('R4: cancelTender is refused with SALE_FINISHED', async () => {
    const { result, receipt } = await saleOnReceipt();
    const before = bill(result.current.order);
    act(() => { result.current.cancelTender(); });
    expect(result.current.stage).toBe(receipt);
    expect(result.current.error).toBe(SALE_FINISHED);
    expect(bill(result.current.order)).toEqual(before);
  });
});

describe('useSale on the cart stage is unchanged', () => {
  it('R5: an unlocked captured leg still refuses setQuantity with SALE_HAS_PAYMENT', () => {
    const { result } = renderSale();
    act(() => { result.current.add(entries[0], traits); });
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 500 })).toEqual(expect.any(String)); });
    const before = bill(result.current.order);
    act(() => { result.current.setQuantity(result.current.order.lineItems[0].id, 5); });
    expect(result.current.stage.kind).toBe('cart');
    expect(result.current.error).toBe(SALE_HAS_PAYMENT);
    expect(bill(result.current.order)).toEqual(before);
  });

  it('R6: with no payments, add, startTender and cancelTender behave as before', () => {
    const { result } = renderSale();
    const id = result.current.order.id;
    let added: unknown;
    act(() => { added = result.current.add(entries[0], traits); });
    expect(added).toEqual({ lineId: expect.any(String) });
    act(() => { result.current.startTender('cash'); });
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'cash' });
    expect(result.current.error).toBeNull();
    act(() => { result.current.cancelTender(); });
    expect(result.current.stage).toEqual({ kind: 'cart' });
    expect(result.current.error).toBeNull();
    expect(result.current.order.id).toBe(id);
    expect(result.current.order.lineItems).toHaveLength(1);
    expect(result.current.order.payments).toEqual([]);
  });
});

describe('useSale on the receipt stage refuses tender, note and customer changes (#1062 follow-up)', () => {
  type Sale = ReturnType<typeof useSale>;
  const jane = { id: 'customer-1', name: 'Jane Smith', email: 'jane@test.com' };
  it.each([
    ['FS1', 'setTender', (sale: Sale) => sale.setTender(null), undefined],
    ['FS2', 'addTender', (sale: Sale) => sale.addTender({ method: 'cash', amountMinor: 100 }), null],
    ['FS3', 'voidTender', (sale: Sale, leg: string) => sale.voidTender(leg), false],
    ['FS4', 'removeTender', (sale: Sale, leg: string) => sale.removeTender(leg), undefined],
    ['FS5', 'setTenderStatus', (sale: Sale, leg: string) => sale.setTenderStatus(leg, 'failed'), false],
    ['FS6', 'setNote', (sale: Sale) => sale.setNote('Gift wrap'), undefined],
    ['FS7', 'setCustomer', (sale: Sale) => sale.setCustomer(jane), undefined],
  ] as const)('%s: %s is refused with SALE_FINISHED and changes nothing', async (_id, _name, call, expected) => {
    const { result, receipt } = await saleOnReceipt();
    const { payments, note, customer } = result.current.order;
    let returned: unknown = 'unset';
    act(() => { returned = call(result.current, payments[0].id); });
    expect(returned).toBe(expected);
    expect(result.current.error).toBe(SALE_FINISHED);
    expect(result.current.stage).toBe(receipt);
    expect(result.current.order.payments).toEqual(payments);
    expect(result.current.order.note).toEqual(note);
    expect(result.current.order.customer).toEqual(customer);
  });

  it('FS9: add starts the next sale on the default customer, not a guest', async () => {
    const regular = { id: 'customer-7', name: 'Sam Regular', email: 'sam@test.com' };
    const { result } = await saleOnReceipt({ defaultCustomer: regular });
    act(() => { result.current.add(entries[1], traits); });
    expect(result.current.stage.kind).toBe('cart');
    expect(result.current.order.customer).toEqual(regular);
  });
});
