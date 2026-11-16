import { useLayoutEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useReadView, useSaleSource } from './index';
import type { SaleLike, SaleSource } from './index';

function sale(coupons: NonNullable<SaleLike['order']['display']['coupons']> = []): SaleLike {
  return { stage: { kind: 'cart' }, order: { currency: 'EUR', display: { coupons } }, couponsRepricing: false,
    applyCoupon: vi.fn(async () => null), removeCoupon: vi.fn(() => null), repriceCoupons: vi.fn(async () => null) };
}
function Block({ source }: { source: SaleSource }) {
  const view = useReadView(source.view);
  return <span data-testid="coupons">{view.coupons.map(coupon => coupon.code).join(',')}</span>;
}
function Harness({ current, observe }: { current: SaleLike; observe: (source: SaleSource) => void }) {
  const source = useSaleSource(current);
  useLayoutEffect(() => { observe(source); });
  return <Block source={source} />;
}

it('updates the view and displayed coupon codes when the sale changes', () => {
  const observe = vi.fn();
  const { rerender } = render(<Harness current={sale()} observe={observe} />);
  expect(screen.getByTestId('coupons').textContent).toBe('');
  const source: SaleSource = observe.mock.lastCall![0], first = source.view.value;
  const couponSale = sale([{ code: 'new', amountMinor: 250 }]);
  rerender(<Harness current={couponSale} observe={observe} />);
  expect(screen.getByTestId('coupons').textContent).toBe('new');
  expect(source.view.value).not.toBe(first);
  expect(source.view.value.coupons).toEqual(couponSale.order.display.coupons);
  expect(source.view.value.coupons[0]).not.toBe(couponSale.order.display.coupons![0]);
});

it('keeps the view identity and does not notify when an equal new sale arrives', () => {
  const observe = vi.fn(), notify = vi.fn();
  const { rerender } = render(<Harness current={sale([{ code: 'same', amountMinor: 10 }])} observe={observe} />);
  const source: SaleSource = observe.mock.lastCall![0], first = source.view.value;
  const unsubscribe = source.view.subscribe(notify);
  rerender(<Harness current={sale([{ code: 'same', amountMinor: 10 }])} observe={observe} />);
  expect(source.view.value).toBe(first);
  expect(notify).not.toHaveBeenCalled();
  unsubscribe();
  rerender(<Harness current={sale()} observe={observe} />);
  expect(notify).not.toHaveBeenCalled();
});

it('delegates actions to the latest sale and keeps the source stable', async () => {
  const observe = vi.fn(), first = sale(), second = sale();
  const { rerender } = render(<Harness current={first} observe={observe} />);
  const source: SaleSource = observe.mock.lastCall![0], actions = source.actions, view = source.view;
  rerender(<Harness current={second} observe={observe} />);
  expect(observe.mock.lastCall![0]).toBe(source);
  expect(source.actions).toBe(actions);
  expect(source.view).toBe(view);
  await source.actions.applyCoupon('c');
  source.actions.removeCoupon('c');
  await source.actions.repriceCoupons();
  expect(second.applyCoupon).toHaveBeenCalledExactlyOnceWith('c');
  expect(second.removeCoupon).toHaveBeenCalledExactlyOnceWith('c');
  expect(second.repriceCoupons).toHaveBeenCalledTimes(1);
  expect(first.applyCoupon).not.toHaveBeenCalled();
  expect(first.removeCoupon).not.toHaveBeenCalled();
  expect(first.repriceCoupons).not.toHaveBeenCalled();
});

it.each(['stage', 'currency', 'couponPricesStale', 'couponsRepricing', 'code', 'amountMinor'] as const)(
  'notifies subscribers when %s changes', field => {
    const current = sale([{ code: 'old', amountMinor: 10 }]), observe = vi.fn();
    const { rerender } = render(<Harness current={current} observe={observe} />);
    const source: SaleSource = observe.mock.lastCall![0], notify = vi.fn(), other = vi.fn();
    source.view.subscribe(notify); source.view.subscribe(other);
    const next = sale([{ code: 'old', amountMinor: 10 }]);
    if (field === 'stage') next.stage.kind = 'tender';
    if (field === 'currency') next.order.currency = 'USD';
    if (field === 'couponPricesStale') next.order.couponPricesStale = true;
    if (field === 'couponsRepricing') next.couponsRepricing = true;
    if (field === 'code') next.order.display.coupons = [{ code: 'new', amountMinor: 10 }];
    if (field === 'amountMinor') next.order.display.coupons = [{ code: 'old', amountMinor: 20 }];
    rerender(<Harness current={next} observe={observe} />);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
  },
);
