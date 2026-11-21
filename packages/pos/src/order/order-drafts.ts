import { map, type Observable } from 'rxjs';
import type { RxCollection, RxJsonSchema } from 'rxdb';
import type { TaxContext } from '../tax/types';
import { customerRefusal } from '../pos-order/command';
import { capturedMinor } from '../tender/payment-legs';
import { couponPricingBasis, createOrderBuilder, isLiveLeg, type OrderBuilder } from './order-builder';
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
  /** Read from the draft's data (open-sale tabs, u19): the captured money, the balance still due and the first line's name. */
  paidMinor?: number;
  balanceDueMinor?: number;
  firstItem?: string;
}

function draftExtras(data: unknown): Pick<ParkedOrderSummary, 'paidMinor' | 'balanceDueMinor' | 'firstItem'> {
  try {
    const saved = JSON.parse(String(data)) as Partial<Order>;
    return { paidMinor: capturedMinor(saved.payments ?? []), balanceDueMinor: saved.balanceDueMinor, firstItem: saved.lineItems?.[0]?.name };
  } catch {
    return {}; // an unreadable draft still lists, without these figures
  }
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

/**
 * Rebuilds a saved order on `taxContext`. Fees and shipping re-derive their rates; under woo granularity lines re-derive
 * from their class too. Outside woo, a line marked taxFromClass re-derives from its class unless `keepTaxRates` is set;
 * every other line (given rates, a draft from before the marker) keeps its stored rates. `keepCoupons` puts the saved
 * coupons back as parked, figures and all, while an unlocked leg is live (ADR-077 d3, amended 2026-11-19); otherwise none.
 * Carried coupons always restore their priced amounts against the saved basis, keeping stale figures stale.
 */
export function restoreOrderDraft(saved: Order, options: { currency: string; taxContext: TaxContext; keepTaxRates?: boolean; keepCoupons?: boolean }): OrderBuilder {
  const { currency, taxContext } = options;
  const builder = createOrderBuilder({
    currency,
    taxContext,
    id: saved.id,
    ...(saved.createdAt ? { createdAt: saved.createdAt } : {}), // #742: with every id below (fees and shipping replay whole)
    ...(saved.storeOrder !== undefined ? { storeOrder: saved.storeOrder } : {}),
    ...(saved.afterClose !== undefined ? { afterClose: saved.afterClose } : {}),
  });

  // Restore state from saved order
  // A customer whose email or id order.create would refuse (see useSale's setCustomer) isn't restored.
  if (saved.customer && !customerRefusal(saved.customer)) {
    builder.setCustomer(saved.customer);
  }
  if (saved.note) {
    builder.setNote(saved.note);
  }
  if (saved.meta?.length) builder.setMeta(saved.meta);

  // Restore line items and their discounts
  for (const line of saved.lineItems) {
    const rederive = line.taxFromClass === true && !options.keepTaxRates;
    const lineId = builder.addLine({
      id: line.id,
      productId: line.productId,
      separate: true,
      ...(line.storeLineId !== undefined ? { storeLineId: line.storeLineId } : {}),
      custom: line.custom,
      taxStatus: line.taxStatus,
      ...(rederive || taxContext.rounding?.granularity === 'woocommerce' ? { taxClass: line.taxClass } : {}),
      variantId: line.variantId,
      name: line.name,
      ...(line.attributes !== undefined ? { attributes: line.attributes } : {}),
      ...(line.anyAttributes !== undefined ? { anyAttributes: line.anyAttributes } : {}),
      sku: line.catalogueSku ?? line.sku,
      imageUrl: line.imageUrl,
      unitPrice: { amount: line.unitPriceMinor, currency, taxInclusive: line.taxInclusive },
      ...(line.regularUnitPriceMinor !== undefined ? { regularUnitPriceMinor: line.regularUnitPriceMinor } : {}),
      quantity: line.quantity,
      ...(rederive ? {} : { taxRates: line.taxLines.map(({ code, ratePpm }) => ({ code, ratePpm })) }),
    });
    if (line.catalogueSku !== undefined) builder.updateLine(lineId, { sku: line.sku });
    for (const discount of line.discounts) {
      builder.applyLineDiscount(lineId, {
        id: discount.id,
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
      id: discount.id,
      type: discount.type,
      value: discount.value,
      label: discount.label,
      couponCode: discount.couponCode,
    });
  }

  // Coupons are re-applied by the sale with fresh coupon data (ADR-077 d3), except carried coupons and keepCoupons below.
  // Restore payments
  for (const payment of saved.payments) {
    builder.addPayment({
      id: payment.id,
      method: payment.method,
      amountMinor: payment.amountMinor,
      tenderedMinor: payment.tenderedMinor,
      changeMinor: payment.changeMinor,
      reference: payment.reference,
      ...(payment.status !== undefined ? { status: payment.status } : {}),
      ...(payment.storePaymentId !== undefined ? { storePaymentId: payment.storePaymentId } : {}),
      ...(payment.locked !== undefined ? { locked: payment.locked } : {}),
      ...(payment.methodId !== undefined ? { methodId: payment.methodId } : {}),
      ...(payment.units !== undefined ? { units: payment.units } : {}),
    });
  }
  if (saved.coupons?.some((c) => c.carried) && !saved.coupons.every((c) => c.carried)) throw new Error('restoreOrderDraft: a draft cannot mix carried and redeemable coupons');
  if (saved.coupons?.length && saved.coupons.every((coupon) => coupon.carried)) {
    builder.setCoupons(saved.coupons.map((c) => c.code), { kind: 'store-priced', carried: true,
      priced: new Map(saved.coupons.map((c) => [c.code, { couponId: c.couponId,
        lines: (c.lines ?? []).filter((l) => l.amountMinor !== undefined).map(({ lineId, amountMinor }) => ({ lineId, amountMinor: amountMinor! })) }])),
      basis: saved.couponPricesStale ? '' : couponPricingBasis(saved) });
    return builder;
  }
  // Kept only with a display row per coupon; a draft parked stale keeps its figures but stays stale (basis '' never matches).
  if (options.keepCoupons && saved.coupons?.length && saved.display.coupons?.length === saved.coupons.length) {
    const restored = builder.getSnapshot();
    builder.setCoupons(saved.coupons.map((coupon) => coupon.code), { kind: 'kept', coupons: saved.coupons,
      displayRows: saved.display.coupons.map((row) => row.amountMinor), lines: new Map(saved.lineItems.map((li) => [li.id, li])),
      basis: saved.couponPricesStale ? '' : couponPricingBasis(restored), linesBasis: couponPricingBasis({ ...restored, customer: null }),
      legIds: saved.payments.filter(isLiveLeg).map((p) => p.id) });
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
          ...draftExtras(json.data),
        };
      }),
    ),
  );
}
