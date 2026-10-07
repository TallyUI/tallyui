import type { ReconcileFeedEntry } from '@tallyui/core';
import type { RxCollection } from 'rxdb';
import type { PosOrder } from '../pos-order/types';
import { APPLIED_USE_GRACE_MS } from './coupon-source';

export function startCouponUsageRefetch(deps: {
  orders: RxCollection<PosOrder>;
  coupons: RxCollection;
  enqueue: (entries: Array<ReconcileFeedEntry>) => void;
  reSync: () => void;
  now?: () => number;
}): { stop(): void } {
  const now = deps.now ?? Date.now;
  const handled = new Set<string>();
  let stopped = false;
  const subscription = deps.orders.find({ selector: { syncStatus: 'applied' } }).$.subscribe(async (orders) => {
    const ids = new Set<number>();
    for (const order of orders) {
      if (!order.coupons?.length || handled.has(order.id)
        || !(now() - Date.parse(order.updatedAt) < APPLIED_USE_GRACE_MS)) continue;
      handled.add(order.id);
      for (const coupon of order.coupons) {
        const id = Number(coupon.couponId);
        if (Number.isInteger(id)) ids.add(id);
      }
    }
    if (!ids.size) return;
    try {
      const docs = await deps.coupons.find({ selector: { id: { $in: [...ids] } } }).exec();
      if (stopped || !docs.length) return;
      deps.enqueue(docs.map((doc) => ({ key: doc.uuid, local: doc.toJSON(), refreshOnly: true })));
      deps.reSync();
    } catch {
      // A failed read stays handled; the store remains authoritative.
    }
  });
  return { stop() { stopped = true; subscription.unsubscribe(); } };
}
