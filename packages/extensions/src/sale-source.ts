import { useLayoutEffect, useState } from 'react';
import type { SaleLike, SaleSource, SaleView } from './types';
function snapshot(sale: SaleLike): SaleView {
  return {
    stage: sale.stage.kind, currency: sale.order.currency,
    coupons: (sale.order.display.coupons ?? []).map(({ code, amountMinor }) => ({ code, amountMinor })),
    couponPricesStale: sale.order.couponPricesStale === true, couponsRepricing: sale.couponsRepricing,
  };
}
export function useSaleSource(sale: SaleLike): SaleSource {
  const [store] = useState(() => {
    const listeners = new Set<() => void>();
    const state = { sale, listeners, view: {
      value: snapshot(sale),
      subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    } };
    const source: SaleSource = { view: state.view, actions: {
      applyCoupon: code => state.sale.applyCoupon(code),
      removeCoupon: code => state.sale.removeCoupon(code),
      repriceCoupons: () => state.sale.repriceCoupons(),
    } };
    return { state, source };
  });
  useLayoutEffect(() => {
    const { state } = store, next = snapshot(sale), prev = state.view.value;
    state.sale = sale;
    if (prev.stage === next.stage && prev.currency === next.currency && prev.couponPricesStale === next.couponPricesStale &&
      prev.couponsRepricing === next.couponsRepricing && prev.coupons.length === next.coupons.length &&
      prev.coupons.every((coupon, i) => coupon.code === next.coupons[i].code && coupon.amountMinor === next.coupons[i].amountMinor)) return;
    state.view.value = next;
    state.listeners.forEach(listener => listener());
  });
  return store.source;
}
