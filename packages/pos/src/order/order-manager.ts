import { BehaviorSubject, map, type Observable } from 'rxjs';
import type { RxCollection } from 'rxdb';
import type { TaxContext } from '../tax/types';
import { createOrderBuilder, type OrderBuilder } from './order-builder';
import type { Order } from './types';

export interface ParkedOrderSummary {
  id: string;
  customerName?: string;
  itemCount: number;
  total: number;
  parkedAt: string;
  source: 'local' | 'server';
}

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
  const { currency, taxContext, draftsCollection } = options;

  let activeBuilder = createOrderBuilder({ currency, taxContext });
  const activeSubject = new BehaviorSubject<OrderBuilder>(activeBuilder);

  const parkedOrders$: Observable<ParkedOrderSummary[]> = draftsCollection.find().$.pipe(
    map((docs) =>
      docs.map((doc) => {
        const json = doc.toJSON() as any;
        return {
          id: json.id,
          customerName: json.customerName || undefined,
          itemCount: json.itemCount ?? 0,
          total: json.total ?? 0,
          parkedAt: json.parkedAt ?? '',
          source: 'local' as const,
        };
      }),
    ),
  );

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
      await draftsCollection.upsert({
        id: snapshot.id,
        data: JSON.stringify(snapshot),
        customerName: snapshot.customer?.name ?? '',
        itemCount: snapshot.lineItems.length,
        total: snapshot.total,
        parkedAt: new Date().toISOString(),
      });

      activeBuilder = createOrderBuilder({ currency, taxContext });
      activeSubject.next(activeBuilder);
      return snapshot.id;
    },

    async resumeOrder(orderId) {
      const doc = await draftsCollection.findOne(orderId).exec();
      if (!doc) throw new Error(`Parked order ${orderId} not found`);

      const json = doc.toJSON() as any;
      const savedOrder: Order = JSON.parse(json.data);

      const builder = createOrderBuilder({
        currency,
        taxContext,
        id: savedOrder.id,
      });

      // Restore state from saved order
      if (savedOrder.customer) {
        builder.setCustomer(savedOrder.customer);
      }
      if (savedOrder.note) {
        builder.setNote(savedOrder.note);
      }

      // Restore line items using synthetic traits
      for (const line of savedOrder.lineItems) {
        const syntheticTraits = {
          getId: (d: any) => d.productId,
          getName: (d: any) => d.name,
          getSku: (d: any) => d.sku,
          getPrice: (d: any) => String(d.price),
          getRegularPrice: (d: any) => String(d.price),
          getSalePrice: () => undefined,
          isOnSale: () => false,
          getImageUrl: (d: any) => d.imageUrl,
          getImageUrls: (d: any) => (d.imageUrl ? [d.imageUrl] : []),
          getDescription: () => undefined,
          getStockStatus: () => 'instock' as const,
          getStockQuantity: () => null,
          hasVariants: () => false,
          getType: () => 'simple',
          getBarcode: () => undefined,
          getCategoryNames: () => [],
        };
        builder.addProduct(line, syntheticTraits, {
          variantId: line.variantId,
          quantity: line.quantity,
        });
      }

      // Restore payments
      for (const payment of savedOrder.payments) {
        builder.addPayment({
          method: payment.method,
          amount: payment.amount,
          reference: payment.reference,
        });
      }

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
