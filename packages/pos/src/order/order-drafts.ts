import { map, type Observable } from 'rxjs';
import type { RxCollection, RxJsonSchema } from 'rxdb';
import type { TaxContext } from '../tax/types';
import { customerRefusal } from '../pos-order/command';
import { createOrderBuilder, type OrderBuilder } from './order-builder';
import type { Order } from './types';

/** Apps create their drafts collection with this schema. */
export const orderDraftSchema: RxJsonSchema<{
  id: string; data: string; customerName?: string; itemCount?: number; total?: number; parkedAt?: string;
}> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    data: { type: 'string' },
    customerName: { type: 'string' },
    itemCount: { type: 'integer', minimum: 0, maximum: 2147483647, multipleOf: 1 },
    total: { type: 'number' },
    parkedAt: { type: 'string' },
  },
  required: ['id', 'data'],
};

export interface ParkedOrderSummary {
  id: string;
  customerName?: string;
  itemCount: number;
  totalMinor: number;
  parkedAt: string;
  source: 'local' | 'server';
}

export async function writeOrderDraft(drafts: RxCollection, snapshot: Order): Promise<string> {
  await drafts.upsert({
    id: snapshot.id,
    data: JSON.stringify(snapshot),
    customerName: snapshot.customer?.name ?? '',
    itemCount: snapshot.lineItems.length,
    total: snapshot.totalMinor,
    parkedAt: new Date().toISOString(),
  });
  return snapshot.id;
}

export function restoreOrderDraft(saved: Order, options: { currency: string; taxContext: TaxContext }): OrderBuilder {
  const { currency, taxContext } = options;
  const builder = createOrderBuilder({
    currency,
    taxContext,
    id: saved.id,
  });

  // Restore state from saved order
  // A customer whose email or id order.create would refuse (see useSale's setCustomer) isn't restored.
  if (saved.customer && !customerRefusal(saved.customer)) {
    builder.setCustomer(saved.customer);
  }
  if (saved.note) {
    builder.setNote(saved.note);
  }

  // Restore line items and their discounts
  for (const line of saved.lineItems) {
    const lineId = builder.addLine({
      productId: line.productId,
      custom: line.custom,
      taxStatus: line.taxStatus,
      variantId: line.variantId,
      name: line.name,
      sku: line.sku,
      imageUrl: line.imageUrl,
      unitPrice: { amount: line.unitPriceMinor, currency, taxInclusive: line.taxInclusive },
      quantity: line.quantity,
      taxRates: line.taxLines.map(({ code, ratePpm }) => ({ code, ratePpm })),
    });
    for (const discount of line.discounts) {
      builder.applyLineDiscount(lineId, {
        type: discount.type,
        value: discount.value,
        label: discount.label,
        couponCode: discount.couponCode,
      });
    }
  }

  for (const fee of saved.fees ?? []) builder.addFee(fee);
  for (const charge of saved.shipping ?? []) builder.addShipping(charge);

  // Restore order-level discounts
  for (const discount of saved.discounts) {
    builder.applyOrderDiscount({
      type: discount.type,
      value: discount.value,
      label: discount.label,
      couponCode: discount.couponCode,
    });
  }

  // Restore payments
  for (const payment of saved.payments) {
    builder.addPayment({
      method: payment.method,
      amountMinor: payment.amountMinor,
      tenderedMinor: payment.tenderedMinor,
      changeMinor: payment.changeMinor,
      reference: payment.reference,
    });
  }
  return builder;
}

export function parkedOrderSummaries$(drafts: RxCollection): Observable<ParkedOrderSummary[]> {
  return drafts.find().$.pipe(
    map((docs) =>
      docs.map((doc) => {
        const json = doc.toJSON() as any;
        return {
          id: json.id,
          customerName: json.customerName || undefined,
          itemCount: json.itemCount ?? 0,
          totalMinor: json.total ?? 0,
          parkedAt: json.parkedAt ?? '',
          source: 'local' as const,
        };
      }),
    ),
  );
}
