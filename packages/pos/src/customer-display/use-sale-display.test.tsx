import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createOrderBuilder } from '../order';
import type { SaleStage } from '../sale/use-sale';
import type { DisplayLink } from './display-link';
import type { SaleDisplayInput } from './sale-display';
import { useSaleDisplay } from './use-sale-display';

const taxContext = { getTaxRatePpm: () => 0, pricesIncludeTax: false };
const cart: SaleStage = { kind: 'cart' };
function orderWith(...names: string[]) {
  const builder = createOrderBuilder({ currency: 'USD', taxContext });
  for (const name of names) builder.addLine({ productId: name, name, unitPrice: { amount: 1000, currency: 'USD' } });
  return builder.getSnapshot();
}
function recorder() {
  const calls: unknown[][] = [];
  const link: DisplayLink = {
    showCart: (receipt) => { calls.push(['cart', receipt && receipt.lineItems.map(({ name }) => name)]); },
    showPayment: (receipt, payment) => { calls.push(['payment', receipt.lineItems.map(({ name }) => name), payment]); },
    close: () => {},
  };
  return { link, calls };
}
const render = (link: DisplayLink | null, sale: SaleDisplayInput) => renderHook(
  ({ link: current, sale: input }) => useSaleDisplay(current, input, { receipt: { storeName: 'Corner Shop' } }),
  { initialProps: { link, sale } },
);

describe('useSaleDisplay', () => {
  it('publishes once per new order', () => {
    const { link, calls } = recorder();
    const { rerender } = render(link, { order: orderWith('Tea'), stage: cart });
    rerender({ link, sale: { order: orderWith('Tea', 'Cake'), stage: cart } });
    expect(calls).toEqual([['cart', ['Tea']], ['cart', ['Tea', 'Cake']]]);
  });

  it('calls nothing on a rerender with the same order and stage', () => {
    const { link, calls } = recorder();
    const sale = { order: orderWith('Tea'), stage: cart };
    const { rerender } = render(link, sale);
    rerender({ link, sale: { ...sale } });
    expect(calls).toHaveLength(1);
  });

  it('a null link publishes nothing, and a link given later gets only the sale as it stands', () => {
    const { link, calls } = recorder();
    const { rerender } = render(null, { order: orderWith('Tea'), stage: cart });
    const sale = { order: orderWith('Cake'), stage: cart };
    rerender({ link: null, sale });
    rerender({ link, sale });
    expect(calls).toEqual([['cart', ['Cake']]]);
  });

  it('closes the old link and publishes to the new one when the link changes', () => {
    const old = recorder(), next = recorder();
    const sale = { order: orderWith('Tea'), stage: cart };
    const { rerender } = render(old.link, sale);
    rerender({ link: next.link, sale });
    expect(old.calls).toEqual([['cart', ['Tea']], ['cart', null]]);
    expect(next.calls).toEqual([['cart', ['Tea']]]);
  });

  it('keeps one publisher per link: a new but equal order object calls the link no further time', () => {
    const { link, calls } = recorder();
    const order = orderWith('Tea');
    const { rerender } = render(link, { order, stage: cart });
    rerender({ link, sale: { order: { ...order }, stage: cart } });
    expect(calls).toHaveLength(1);
  });

  it('reads the latest options on each publish', () => {
    const names: string[] = [];
    const link: DisplayLink = { showCart: (receipt) => { names.push(receipt?.header.storeName ?? ''); }, showPayment: () => {}, close: () => {} };
    const { rerender } = renderHook(({ order, storeName }) => useSaleDisplay(link, { order, stage: cart }, { receipt: { storeName } }),
      { initialProps: { order: orderWith('Tea'), storeName: 'A' } });
    rerender({ order: orderWith('Tea', 'Cake'), storeName: 'B' });
    expect(names).toEqual(['A', 'B']);
  });

  it('closes on unmount', () => {
    const { link, calls } = recorder();
    const { unmount } = render(link, { order: orderWith('Tea'), stage: cart });
    unmount();
    expect(calls).toEqual([['cart', ['Tea']], ['cart', null]]);
  });
});
