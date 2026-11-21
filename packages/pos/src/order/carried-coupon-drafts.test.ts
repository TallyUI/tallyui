// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { finalizeOrder } from '../pos-order/finalize';
import type { TaxContext } from '../tax/types';
import { couponPricingBasis, createOrderBuilder } from './order-builder';
import { orderDraftSchema, restoreOrderDraft, writeOrderDraft } from './order-drafts';
import type { Order } from './types';

const currency = 'EUR', code = 'refused-save';
const taxContext: TaxContext = { pricesIncludeTax: true, getTaxRatePpm: () => 190000 };
function sale() {
  const builder = createOrderBuilder({ currency, taxContext });
  const first = builder.addLine({ productId: 'p1', name: 'Inclusive', taxClass: 'standard',
    unitPrice: { amount: 1190, currency, taxInclusive: true } });
  const second = builder.addLine({ productId: 'p2', name: 'Exclusive',
    unitPrice: { amount: 500, currency, taxInclusive: false } });
  builder.setCoupons([code], { kind: 'store-priced', carried: true, basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([[code, { couponId: 'promo_1', lines: [{ lineId: first, amountMinor: 100 }, { lineId: second, amountMinor: 50 }] }]]) });
  builder.addPayment({ method: 'cash', status: 'captured', amountMinor: builder.getSnapshot().totalMinor });
  return builder;
}
const figures = ({ subtotalMinor, taxMinor, totalMinor }: Order) => ({ subtotalMinor, taxMinor, totalMinor });

describe('carried coupon drafts', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `carrieddrafts${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { await db.remove(); });

  it('D1: restores carried coupons and their figures through JSON without keepCoupons', () => {
    const saved = sale().getSnapshot();
    const restored = restoreOrderDraft(JSON.parse(JSON.stringify(saved)), { currency, taxContext }).getSnapshot();
    expect(saved.coupons?.[0]).toMatchObject({ carried: true, lines: [
      { lineId: saved.lineItems[0].id, amountMinor: 100 }, { lineId: saved.lineItems[1].id, amountMinor: 50 },
    ] });
    expect(restored.coupons).toEqual(saved.coupons);
    expect(figures(restored)).toEqual(figures(saved));
    expect(restored.display.coupons).toEqual(saved.display.coupons);
    expect(restored.payments).toEqual(saved.payments);
    expect(restored.couponPricesStale).toBeUndefined();
  });

  it('D2: keeps an explicitly stale carried draft stale', () => {
    const saved = { ...sale().getSnapshot(), couponPricesStale: true as const };
    expect(restoreOrderDraft(saved, { currency, taxContext }).getSnapshot().couponPricesStale).toBe(true);
  });

  it('D2: a class-taxed line restored on a different rate makes the saved carried basis stale', () => {
    const saved = sale().getSnapshot();
    expect(saved.lineItems[0].taxFromClass).toBe(true);
    const restored = restoreOrderDraft(saved, { currency,
      taxContext: { ...taxContext, getTaxRatePpm: () => 200000 } }).getSnapshot();
    expect(restored.lineItems[0].taxLines[0].ratePpm).toBe(200000);
    expect(restored.couponPricesStale).toBe(true);
  });

  it('D4: refuses a draft mixing carried and redeemable coupons', () => {
    const saved = sale().getSnapshot();
    const mixed = { ...saved, coupons: [...saved.coupons!,
      { code: 'redeemable', couponId: 'promo_2', discountMinor: 0, discountTaxMinor: 0 }] };
    expect(() => restoreOrderDraft(mixed, { currency, taxContext }))
      .toThrow('restoreOrderDraft: a draft cannot mix carried and redeemable coupons');
  });

  it('D3: a quantity edit stays stale through write and restore, and finalize refuses it', async () => {
    const builder = sale();
    builder.updateQuantity(builder.getSnapshot().lineItems[0].id, 2);
    const edited = builder.getSnapshot();
    expect(edited.couponPricesStale).toBe(true);
    const id = await writeOrderDraft(db.pos_drafts, edited);
    const doc = await db.pos_drafts.findOne(id).exec();
    const saved: Order = JSON.parse(doc!.toJSON().data);
    const restored = restoreOrderDraft(saved, { currency, taxContext }).getSnapshot();
    expect(restored.coupons).toEqual(edited.coupons);
    expect(restored.couponPricesStale).toBe(true);
    expect(() => finalizeOrder(restored, { capabilities: { orderCreate: 12 } }))
      .toThrow("finalize: the coupons' prices are out of date; price the coupons again before finalizing");
  });
});
