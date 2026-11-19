import { describe, expect, it } from 'vitest';
import type { TaxContext, WooRate } from '../tax/types';
import { createOrderBuilder } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import type { Order } from './types';

// 5.2 F3: outside woo granularity a class-taxed line re-derives its rates on resume; given-rate and legacy lines keep theirs.
const at = (ratePpm: number, extra: Partial<TaxContext> = {}): TaxContext => ({
  pricesIncludeTax: false, getTaxRatePpm: (taxClass) => taxClass === 'reduced' ? ratePpm : 0, ...extra,
});
const parkedAt10 = at(100000), resumedAt20 = at(200000);

function park(taxRates?: { code?: string; ratePpm: number }[]): Order {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: parkedAt10 });
  builder.addLine({ productId: 'p1', name: 'Tea', taxClass: 'reduced', unitPrice: { amount: 1000, currency: 'EUR' }, quantity: 2,
    ...(taxRates !== undefined ? { taxRates } : {}) });
  return JSON.parse(JSON.stringify(builder.getSnapshot())) as Order;
}

function figures(order: Order) {
  return { taxMinor: order.taxMinor, totalMinor: order.totalMinor, ratePpm: order.lineItems[0].taxLines[0].ratePpm };
}

describe('restoreOrderDraft re-derives class-taxed lines (5.2 F3)', () => {
  it('RD1: a line added by class takes the new rate and keeps its class and marker', () => {
    const saved = park();
    expect(figures(saved)).toEqual({ taxMinor: 200, totalMinor: 2200, ratePpm: 100000 });
    const restored = restoreOrderDraft(saved, { currency: 'EUR', taxContext: resumedAt20 }).getSnapshot();
    expect(figures(restored)).toEqual({ taxMinor: 400, totalMinor: 2400, ratePpm: 200000 });
    expect(restored.lineItems[0]).toHaveProperty('taxFromClass', true);
    expect(restored.lineItems[0]).toHaveProperty('taxClass', 'reduced');
  });

  it('RD2: a line added with given rates keeps them', () => {
    const saved = park([{ code: 'GIVEN', ratePpm: 100000 }]);
    expect('taxFromClass' in saved.lineItems[0]).toBe(false);
    const restored = restoreOrderDraft(saved, { currency: 'EUR', taxContext: resumedAt20 }).getSnapshot();
    expect(figures(restored)).toEqual({ taxMinor: 200, totalMinor: 2200, ratePpm: 100000 });
    expect(restored.lineItems[0].taxLines[0].code).toBe('GIVEN');
    expect('taxFromClass' in restored.lineItems[0]).toBe(false);
  });

  it('RD3: a draft parked before the marker (no taxFromClass, no taxClass) keeps its stored rates', () => {
    const saved = park();
    const { taxFromClass: _marker, taxClass: _class, ...legacy } = saved.lineItems[0];
    const restored = restoreOrderDraft({ ...saved, lineItems: [legacy] }, { currency: 'EUR', taxContext: resumedAt20 }).getSnapshot();
    expect(figures(restored)).toEqual({ taxMinor: 200, totalMinor: 2200, ratePpm: 100000 });
  });

  it('RD4: keepTaxRates keeps a class line\'s stored rates', () => {
    const restored = restoreOrderDraft(park(), { currency: 'EUR', taxContext: resumedAt20, keepTaxRates: true }).getSnapshot();
    expect(figures(restored)).toEqual({ taxMinor: 200, totalMinor: 2200, ratePpm: 100000 });
  });

  it('RD5: the re-derived line carries the new context\'s rate code', () => {
    const taxContext = at(200000, { getTaxRateCode: (taxClass) => taxClass === 'reduced' ? 'RED20' : undefined });
    const restored = restoreOrderDraft(park(), { currency: 'EUR', taxContext }).getSnapshot();
    expect(figures(restored)).toEqual({ taxMinor: 400, totalMinor: 2400, ratePpm: 200000 });
    expect(restored.lineItems[0].taxLines[0].code).toBe('RED20');
  });

  it('RD6: under woo granularity a line gets no marker and still re-derives from its class', () => {
    const woo = (percent: string): TaxContext => ({
      pricesIncludeTax: false, rounding: { granularity: 'woocommerce', roundAtSubtotal: false },
      getTaxRatePpm: () => { throw new Error('WooCommerce must use the rate list'); },
      getTaxRates: (taxClass) => taxClass === 'reduced'
        ? [{ id: 1, code: 'rate-1', label: 'Rate 1', rate: percent, priority: 1, compound: false, shipping: true } satisfies WooRate] : [],
    });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: woo('10.0000') });
    builder.addLine({ productId: 'p1', name: 'Tea', taxClass: 'reduced', unitPrice: { amount: 1000, currency: 'EUR' }, quantity: 2 });
    const saved = JSON.parse(JSON.stringify(builder.getSnapshot())) as Order;
    expect('taxFromClass' in saved.lineItems[0]).toBe(false);
    expect(figures(saved)).toEqual({ taxMinor: 200, totalMinor: 2200, ratePpm: 100000 });
    const restored = restoreOrderDraft(saved, { currency: 'EUR', taxContext: woo('20.0000') }).getSnapshot();
    expect('taxFromClass' in restored.lineItems[0]).toBe(false);
    expect(figures(restored)).toEqual({ taxMinor: 400, totalMinor: 2400, ratePpm: 200000 });
  });

  it('RD7: two class adds merge; a class add and an equal given-rate add stay two lines', () => {
    const line = { productId: 'p1', name: 'Tea', taxClass: 'reduced', unitPrice: { amount: 1000, currency: 'EUR' } };
    const merged = createOrderBuilder({ currency: 'EUR', taxContext: parkedAt10 });
    merged.addLine(line);
    merged.addLine(line);
    expect(merged.getSnapshot().lineItems.map((item) => item.quantity)).toEqual([2]);
    const split = createOrderBuilder({ currency: 'EUR', taxContext: parkedAt10 });
    split.addLine(line);
    split.addLine({ ...line, taxRates: [{ ratePpm: 100000 }] });
    expect(split.getSnapshot().lineItems.map((item) => item.quantity)).toEqual([1, 1]);
  });
});
