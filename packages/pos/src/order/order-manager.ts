import { BehaviorSubject, type Observable } from 'rxjs';
import type { RxCollection } from 'rxdb';
import type { TaxContext } from '../tax/types';
import { createOrderBuilder, type OrderBuilder } from './order-builder';
import type { Order } from './types';
import { writeOrderDraft, restoreOrderDraft, parkedOrderSummaries$, type ParkedOrderSummary } from './order-drafts';

export type { ParkedOrderSummary } from './order-drafts';

export interface OrderManagerOptions {
  currency: string;
  taxContext: TaxContext;
  draftsCollection: RxCollection;
}

export interface OrderManager {
  activeOrder$: Observable<OrderBuilder>;
  parkedOrders$: Observable<ParkedOrderSummary[]>;
  newOrder(): OrderBuilder;
  parkCurrentOrder(): Promise<string>;
  resumeOrder(orderId: string): Promise<OrderBuilder>;
  deleteParkedOrder(orderId: string): Promise<void>;
}

export function createOrderManager(options: OrderManagerOptions): OrderManager {
  const { taxContext, draftsCollection } = options;
  const currency = options.currency.toUpperCase();

  let activeBuilder = createOrderBuilder({ currency, taxContext });
  const activeSubject = new BehaviorSubject<OrderBuilder>(activeBuilder);

  const parkedOrders$ = parkedOrderSummaries$(draftsCollection);

  return {
    activeOrder$: activeSubject.asObservable(),
    parkedOrders$,

    newOrder() {
      activeBuilder = createOrderBuilder({ currency, taxContext });
      activeSubject.next(activeBuilder);
      return activeBuilder;
    },

    async parkCurrentOrder() {
      const snapshot = activeBuilder.getSnapshot();
      await writeOrderDraft(draftsCollection, snapshot);

      activeBuilder = createOrderBuilder({ currency, taxContext });
      activeSubject.next(activeBuilder);
      return snapshot.id;
    },

    async resumeOrder(orderId) {
      const doc = await draftsCollection.findOne(orderId).exec();
      if (!doc) throw new Error(`Parked order ${orderId} not found`);

      const json = doc.toJSON() as any;
      const savedOrder: Order = JSON.parse(json.data);

      const builder = restoreOrderDraft(savedOrder, { currency, taxContext });

      await doc.remove();

      activeBuilder = builder;
      activeSubject.next(activeBuilder);
      return builder;
    },

    async deleteParkedOrder(orderId) {
      const doc = await draftsCollection.findOne(orderId).exec();
      if (doc) await doc.remove();
    },
  };
}
