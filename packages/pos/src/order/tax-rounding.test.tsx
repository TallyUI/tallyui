import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ProductTraits, TaxRounding } from '@tallyui/core';
import { TaxProvider, useTax } from '../tax/tax-provider';
import type { TaxContext } from '../tax/types';
import { roundedTaxByRate, taxLinesByRate } from '../tax/exact';
import { createOrderBuilder } from './order-builder';
import { finalizeOrder } from '../pos-order/finalize';
import type { Order } from './types';

// #287: the till computes tax with the store's rounding strategy (ServerCapabilities.taxRounding).
const perLine: TaxRounding = { granularity: 'per_line', mode: 'half_up' };
const perGroup: TaxRounding = { granularity: 'per_rate_group', mode: 'half_up' };
const perOrder: TaxRounding = { granularity: 'per_order', mode: 'half_up' };
const context = (pricesIncludeTax: boolean, rounding?: TaxRounding): TaxContext =>
  ({ getTaxRatePpm: () => 190000, pricesIncludeTax, ...(rounding ? { rounding } : {}) });

/** Lines of [unit price, rate ppm, code?], each its own product. */
function sale(rounding: TaxRounding | undefined, pricesIncludeTax: boolean, lines: [number, number, string?][]): Order {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: context(pricesIncludeTax, rounding) });
  lines.forEach(([amount, ratePpm, code], index) => builder.addLine({
    productId: `p${index}`, name: `Item ${index}`, unitPrice: { amount, currency: 'EUR' },
    taxRates: [{ ...(code !== undefined ? { code } : {}), ratePpm }],
  }));
  return builder.getSnapshot();
}
const figures = (order: Order) => [order.subtotalMinor, order.taxMinor, order.totalMinor];
const rows = (order: Order) => taxLinesByRate(order.lineItems, order.taxMinor, undefined, order.taxRounding)
  .map(({ code, ratePpm, netMinor, amountMinor }) => [code, ratePpm, netMinor, amountMinor]);

describe('per_line (#287)', () => {
  it('exclusive: three lines of 0.07 at 19% round each line\'s tax, so Σ round(line) ≠ round(Σ line)', () => {
    // Each line: 7 × 19% = 1.33 → 1; tax 3, total 21 + 3 = 24. per_order: 3.99 → 4, total 25.
    expect(figures(sale(perLine, false, [[7, 190000], [7, 190000], [7, 190000]]))).toEqual([21, 3, 24]);
    expect(figures(sale(perOrder, false, [[7, 190000], [7, 190000], [7, 190000]]))).toEqual([21, 4, 25]);
    expect(figures(sale(undefined, false, [[7, 190000], [7, 190000], [7, 190000]]))).toEqual([21, 4, 25]);
  });

  it('inclusive: each line\'s net is round(gross / 1.19) and its tax gross − net', () => {
    // Each 0.10: net round(8.4034) = 8, tax 2; subtotal 16, tax 4, total 20.
    // per_order: 2 × 1.5966 = 3.193 → 3, subtotal 17, total 20.
    expect(figures(sale(perLine, true, [[10, 190000], [10, 190000]]))).toEqual([16, 4, 20]);
    expect(figures(sale(undefined, true, [[10, 190000], [10, 190000]]))).toEqual([17, 3, 20]);
  });
});

describe('per_rate_group (#287)', () => {
  const basket: [number, number, string][] = [[7, 190000, 'VAT 19'], [7, 190000, 'VAT 19'], [7, 70000, 'VAT 7'], [7, 70000, 'VAT 7']];

  it('exclusive: two rates, two lines each, round once per group', () => {
    // VAT 19: round(14 × 19% = 2.66) = 3; VAT 7: round(14 × 7% = 0.98) = 1; tax 4, total 28 + 4 = 32.
    // per_line: 1 + 1 + round(0.49) × 2 = 2, total 30.
    const order = sale(perGroup, false, basket);
    expect(figures(order)).toEqual([28, 4, 32]);
    expect(rows(order)).toEqual([['VAT 19', 190000, 14, 3], ['VAT 7', 70000, 14, 1]]);
    expect(figures(sale(perLine, false, basket))).toEqual([28, 2, 30]);
  });

  it('inclusive: each line\'s net is rounded first, and the total is Σ net + Σ group tax, not Σ gross', () => {
    // VAT 19: 0.10 → net round(8.4034) = 8, twice: 16, tax round(16 × 19% = 3.04) = 3.
    // VAT 7: 0.10 → net round(9.3458) = 9, twice: 18, tax round(18 × 7% = 1.26) = 1.
    // Subtotal 34, tax 4, total 38 (order-level-tax-calculation-strategy.js:44-49), against a shelf Σ of 40.
    // per_line: 2 + 2 + 1 + 1 = 6, total 40.
    const lines: [number, number, string][] = basket.map(([, ratePpm, code]) => [10, ratePpm, code]);
    const rounded = roundedTaxByRate(lines.map(([netMinor, ratePpm, code]) =>
      ({ netMinor, taxInclusive: true, taxLines: [{ code, ratePpm, taxMicros: '0' }] })), perGroup)!;
    expect([rounded.baseMinor, rounded.taxMinor, rounded.baseMinor + rounded.taxMinor]).toEqual([34, 4, 38]);
    expect(rounded.rates.map(({ code, ratePpm, netMinor, amountMinor }) => [code, ratePpm, netMinor, amountMinor]))
      .toEqual([['VAT 19', 190000, 16, 3], ['VAT 7', 70000, 18, 1]]);
    expect(figures(sale(perLine, true, lines))).toEqual([34, 6, 40]);
    // OPEN (#287a report): ADR-063's display shows each inclusive line at its shelf price, so a total below Σ shelf
    // leaves a residue with no converted line to take it, and the builder refuses the sale. Pinned until it's decided.
    expect(() => sale(perGroup, true, lines)).toThrow('Display residue -1 exceeds its bound of 0 (ADR-063)');
  });

  it('the same rate under two names is two groups', () => {
    // A: round(7 × 19% = 1.33) = 1; B: the same, 1; tax 2. One group would be round(2.66) = 3.
    const order = sale(perGroup, false, [[7, 190000, 'A'], [7, 190000, 'B']]);
    expect(figures(order)).toEqual([14, 2, 16]);
    expect(rows(order)).toEqual([['A', 190000, 7, 1], ['B', 190000, 7, 1]]);
    expect(figures(sale(perGroup, false, [[7, 190000, 'A'], [7, 190000, 'A']]))).toEqual([14, 3, 17]);
  });
});

describe('taxLinesByRate under each granularity (#287)', () => {
  const basket: [number, number, string][] = [[7, 190000, 'VAT 19'], [13, 190000, 'VAT 19'], [7, 70000, 'VAT 7'], [9, 70000, 'VAT 7']];

  it.each([
    // per_order: exact 1.33 + 2.47 + 0.49 + 0.63 = 4.92 → 5, spread by largest remainder: VAT 19 3.80 → 4, VAT 7 1.12 → 1.
    { rounding: undefined, taxMinor: 5, amounts: [4, 1] },
    // per_line: 1 + 2 = 3 at 19%; 0 + 1 = 1 at 7%.
    { rounding: perLine, taxMinor: 4, amounts: [3, 1] },
    // per_rate_group: round(20 × 19% = 3.8) = 4; round(16 × 7% = 1.12) = 1.
    { rounding: perGroup, taxMinor: 5, amounts: [4, 1] },
  ])('$rounding.granularity: the rows sum to the order tax', ({ rounding, taxMinor, amounts }) => {
    const order = sale(rounding, false, basket);
    expect(order.taxMinor).toBe(taxMinor);
    expect(rows(order).map((row) => row[3])).toEqual(amounts);
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: context(false, rounding) });
    basket.forEach(([amount, ratePpm, code], index) => builder.addLine({
      productId: `p${index}`, name: 'Item', unitPrice: { amount, currency: 'EUR' }, taxRates: [{ code, ratePpm }] }));
    builder.addPayment({ method: 'cash', amountMinor: order.totalMinor });
    // finalize sends the same rows, with Σ = taxMinor checked there (pos-order/finalize.ts).
    const posOrder = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 3 } });
    expect(posOrder.taxByRate!.map((row) => row.amountMinor)).toEqual(amounts);
  });
});

describe('discounted baskets (#287)', () => {
  // vendurepos's measurement scored undiscounted baskets only. These expectations apply the cited Vendure algorithm
  // to the till's discounted line nets (its proratedLinePrice): a 10% line discount and a fixed 1.00 order discount.
  // Line a 2 × 5.00 less 1.00 = 9.00; line b 3.29. The 1.00 splits 900 : 329 = 73.23 : 26.77, floors 73 + 26, and
  // the last unit to b's larger remainder: a 73, b 27. Nets: a 827, b 302; subtotal 1129.
  function discounted(rounding: TaxRounding | undefined) {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: context(false, rounding) });
    const a = builder.addLine({ productId: 'a', name: 'A', unitPrice: { amount: 500, currency: 'EUR' }, quantity: 2 });
    builder.addLine({ productId: 'b', name: 'B', unitPrice: { amount: 329, currency: 'EUR' } });
    builder.applyLineDiscount(a, { type: 'percentage', value: 10 });
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    return builder.getSnapshot();
  }

  it.each([
    // per_order: 827 × 19% = 157.13, 302 × 19% = 57.38; Σ 214.51 → 215.
    { rounding: perOrder, figures: [1129, 215, 1344] },
    // per_line: 157 + 57 = 214.
    { rounding: perLine, figures: [1129, 214, 1343] },
    // per_rate_group, one group: round(1129 × 19% = 214.51) = 215.
    { rounding: perGroup, figures: [1129, 215, 1344] },
  ])('$rounding.granularity', ({ rounding, figures: expected }) => {
    const order = discounted(rounding);
    expect(order.lineItems.map((li) => li.netMinor)).toEqual([827, 302]);
    expect(figures(order)).toEqual(expected);
    expect(rows(order).map((row) => row[3])).toEqual([expected[1]]);
  });
});

describe('the defaults (#287)', () => {
  // The existing fixtures: Medusa's vectors, inclusive, and ADR-062's worked example in each mode, with discounts.
  function fixtures(rounding: TaxRounding | undefined): unknown[] {
    const run = (pricesIncludeTax: boolean, build: (b: ReturnType<typeof createOrderBuilder>) => void) => {
      const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: (c) => c === 'ten' ? 100000 : 190000, pricesIncludeTax, ...(rounding ? { rounding } : {}) } });
      build(builder);
      return JSON.parse(JSON.stringify(builder.getSnapshot(), (key, value) =>
        ['id', 'lineId', 'discountId', 'createdAt', 'updatedAt', 'taxRounding'].includes(key) ? undefined : value));
    };
    const add = (b: ReturnType<typeof createOrderBuilder>, amount: number, quantity = 1, taxInclusive?: boolean, taxClass?: string) =>
      b.addLine({ productId: `p${amount}`, name: 'Item', unitPrice: { amount, currency: 'EUR', ...(taxInclusive !== undefined ? { taxInclusive } : {}) }, quantity, taxClass });
    const worked = (b: ReturnType<typeof createOrderBuilder>, bInclusive?: boolean) => {
      b.applyLineDiscount(add(b, 1250, 2, undefined, 'ten'), { type: 'percentage', value: 10 });
      add(b, 999, 1, bInclusive, 'ten');
      b.applyOrderDiscount({ type: 'fixed', value: 500 });
    };
    return [
      run(false, (b) => { add(b, 850, 2); add(b, 1200); }),
      run(false, (b) => { add(b, 150); add(b, 35, 3); add(b, 5); }),
      run(true, (b) => { add(b, 1190); add(b, 10); add(b, 10); }),
      run(false, (b) => worked(b)), run(true, (b) => worked(b)), run(true, (b) => worked(b, false)), run(false, (b) => worked(b, true)),
    ];
  }

  it('absent, custom and explicit per_order half away from zero are byte-identical', () => {
    const absent = JSON.stringify(fixtures(undefined));
    expect(JSON.stringify(fixtures({ granularity: 'custom' }))).toBe(absent);
    expect(JSON.stringify(fixtures({ granularity: 'per_order', mode: 'half_away_from_zero' }))).toBe(absent);
  });

  it('the order snapshot carries the sale\'s strategy, and none when absent', () => {
    expect(sale(perLine, false, [[7, 190000]]).taxRounding).toEqual(perLine);
    expect('taxRounding' in sale(undefined, false, [[7, 190000]])).toBe(false);
  });
});

describe('the rateCodes mapping (#287)', () => {
  const ratesPpm = { default: 190000, standard: 190000, reduced: 70000 };
  const rateCodes = { standard: 'VAT 19' };
  function tax(props: { rounding?: TaxRounding; rateCodes?: Record<string, string> }) {
    const wrapper = ({ children }: { children: ReactNode }) =>
      <TaxProvider ratesPpm={ratesPpm} pricesIncludeTax={false} {...props}>{children}</TaxProvider>;
    return renderHook(() => useTax(), { wrapper }).result.current;
  }
  type Doc = { id: string; price: number; taxClass?: string };
  const traits = {
    getId: (doc: Doc) => doc.id, getName: () => 'Item', getSku: () => undefined, getImageUrl: () => undefined, isSellable: () => true,
    getPrices: (doc: Doc) => [{ amount: doc.price, currency: 'EUR', kind: 'base' as const }], getTaxClass: (doc: Doc) => doc.taxClass,
  } as unknown as ProductTraits<Doc>;

  it('a taxClass product gets the mapped code, and an unmapped class has none', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: tax({ rounding: perGroup, rateCodes }) });
    builder.addProduct({ id: 'a', price: 7, taxClass: 'standard' }, traits);
    builder.addProduct({ id: 'b', price: 7, taxClass: 'reduced' }, traits);
    expect(builder.getSnapshot().lineItems.map((li) => li.taxLines.map(({ code, ratePpm }) => ({ code, ratePpm }))))
      .toEqual([[{ code: 'VAT 19', ratePpm: 190000 }], [{ code: undefined, ratePpm: 70000 }]]);
    expect('code' in builder.getSnapshot().lineItems[1].taxLines[0]).toBe(false);
  });

  it('names the rate getTaxRatePpm picks, and carries no strategy when none is given', () => {
    const context = tax({ rounding: perGroup, rateCodes });
    expect(context.rounding).toEqual(perGroup);
    expect(context.getTaxRateCode!('standard')).toBe('VAT 19');
    expect(context.getTaxRateCode!(undefined)).toBeUndefined();
    expect('rounding' in tax({})).toBe(false);
  });

  it('a new strategy is a new tax context, so useSale restarts an idle sale under it', () => {
    let rounding: TaxRounding = perLine;
    const wrapper = ({ children }: { children: ReactNode }) =>
      <TaxProvider ratesPpm={ratesPpm} pricesIncludeTax={false} rounding={rounding} rateCodes={rateCodes}>{children}</TaxProvider>;
    const { result, rerender } = renderHook(() => useTax(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    rounding = perGroup;
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current.rounding).toEqual(perGroup);
  });
});
