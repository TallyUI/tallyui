import { describe, it, expect } from 'vitest';
import { assertDisplayResidue, createOrderBuilder } from './order-builder';
import type { TaxContext } from '../tax/types';
import { roundMicrosToMinor, taxMicros } from '../tax/exact';
import type { Discount, LineItem, Order } from './types';

const store = (pricesIncludeTax: boolean, ratePpm = 200000): TaxContext => ({ getTaxRatePpm: () => ratePpm, pricesIncludeTax });
/** An expected display line: its amount and its discount rows (ADR-063). */
const line = (amountMinor: number, discounts: number[] = []) => ({
  lineId: expect.any(String), amountMinor, discounts: discounts.map((amount) => ({ discountId: expect.any(String), amountMinor: amount })),
});

/** Asserts the display row adds up in its mode: Subtotal − Discount (+ Tax when exclusive) = Total (ADR-063). */
function expectAddsUp(order: Order, context = '') {
  const d = order.display;
  expect(d, context).toMatchObject({ taxInclusive: order.pricesIncludeTax, taxMinor: order.taxMinor, totalMinor: order.totalMinor });
  expect(d.subtotalMinor - d.discountMinor + (d.taxInclusive ? 0 : d.taxMinor), `${context} subtotal − discount (+ tax) = total`).toBe(d.totalMinor);
  expect(d.discountMinor, context).toBeGreaterThanOrEqual(0);
}

// ADR-062's mixed-mode fixture: A is inclusive (3 × €10.00), B exclusive (€10.00), at 19%.
function mixed(pricesIncludeTax: boolean) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(pricesIncludeTax, 190000) });
  builder.addLine({ productId: 'a', name: 'Inclusive', unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: true }, quantity: 3 });
  builder.addLine({ productId: 'b', name: 'Exclusive', unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: false } });
  return builder;
}

describe('display totals (ADR-063)', () => {
  it('all exclusive, 20%: €100.00 with 10% off the order shows 10000 − 1000 + 1800 = 10800', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(false) });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 10000, currency: 'EUR' } });
    expect(builder.getSnapshot().display.discountMinor).toBe(0);
    expect(builder.getSnapshot().display.subtotalMinor).toBe(builder.getSnapshot().subtotalMinor);
    builder.applyOrderDiscount({ type: 'percentage', value: 10 });
    const order = builder.getSnapshot();
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: false, subtotalMinor: 10000, discountMinor: 1000, taxMinor: 1800, totalMinor: 10800, lines: [line(10000)], orderDiscountMinor: 1000 });
  });

  it('all inclusive, 20%: €120.00 with €12.00 off shows 12000 − 1200 = 10800, including 1800 tax', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(true) });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 12000, currency: 'EUR' } });
    expect(builder.getSnapshot().display.discountMinor).toBe(0);
    builder.applyOrderDiscount({ type: 'fixed', value: 1200 });
    const order = builder.getSnapshot();
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: true, subtotalMinor: 12000, discountMinor: 1200, taxMinor: 1800, totalMinor: 10800, lines: [line(12000)], orderDiscountMinor: 1200 });
  });

  it('mixed, exclusive display: adds up exactly, and the settlement figures are unchanged', () => {
    const builder = mixed(false);
    let order = builder.getSnapshot();
    expect(order.display.discountMinor).toBe(0);
    expect(order.display.subtotalMinor).toBe(order.subtotalMinor);
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    order = builder.getSnapshot();
    expect(order).toMatchObject({ totalMinor: 4085, taxMinor: 652, subtotalMinor: 3433, discountMinor: 100 });
    // Settlement discountMinor (100) mixes A's gross share (75) with B's net share (25); the display's is net: 3521 − 3433.
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: false, subtotalMinor: 3521, discountMinor: 88, taxMinor: 652, totalMinor: 4085, lines: [line(2521), line(1000)], orderDiscountMinor: 88 });
  });

  it('mixed, inclusive display: adds up exactly', () => {
    const builder = mixed(true);
    expect(builder.getSnapshot().display.discountMinor).toBe(0);
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    const order = builder.getSnapshot();
    expect(order).toMatchObject({ totalMinor: 4085, taxMinor: 652, subtotalMinor: 3433, discountMinor: 100 });
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: true, subtotalMinor: 4190, discountMinor: 105, taxMinor: 652, totalMinor: 4085, lines: [line(3000), line(1190)], orderDiscountMinor: 105 });
  });

  it.each([
    { pricesIncludeTax: false, display: { subtotalMinor: 1000, discountMinor: 200, taxMinor: 80, totalMinor: 880 } },
    { pricesIncludeTax: true, display: { subtotalMinor: 1000, discountMinor: 200, taxMinor: 73, totalMinor: 800 } },
  ])('stacks a line and an order discount on one line (inclusive display: $pricesIncludeTax)', (row) => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: store(row.pricesIncludeTax, 100000) });
    const lineId = builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency: 'USD' } });
    builder.applyLineDiscount(lineId, { type: 'percentage', value: 10 });
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    const order = builder.getSnapshot();
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: row.pricesIncludeTax, ...row.display, lines: [line(1000, [100])], orderDiscountMinor: 100 });
  });

  it('the medusapos cart: settlement 310 + 78 tax with 90 off shows 400 − 90 + 78 = 388, not 3.88 as 310 + 78 − 90', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(false, 250000) });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 400, currency: 'EUR' } });
    builder.applyOrderDiscount({ type: 'fixed', value: 90 });
    const order = builder.getSnapshot();
    expect(order).toMatchObject({ subtotalMinor: 310, taxMinor: 78, discountMinor: 90, totalMinor: 388 });
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: false, subtotalMinor: 400, discountMinor: 90, taxMinor: 78, totalMinor: 388, lines: [line(400)], orderDiscountMinor: 90 });
  });

  it('adds up for 200 seeded random carts in both display modes, with no discount shown when there is none', () => {
    // mulberry32: a small deterministic PRNG, so a failure reproduces.
    let seed = 0x7a11;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const pick = <T>(items: T[]): T => items[int(0, items.length - 1)];
    const discount = (max: number): Discount => random() < 0.5
      ? { type: 'percentage', value: int(1, 60) }
      : { type: 'fixed', value: int(1, max) };

    for (let cart = 0; cart < 200; cart++) {
      const discounted = random() < 2 / 3;
      const lines = Array.from({ length: int(1, 4) }, (_, index) => ({
        productId: `p${index}`, name: `Item ${index}`, quantity: int(1, 3),
        unitPrice: { amount: int(1, 20000), currency: 'EUR', taxInclusive: random() < 0.5 },
        taxRates: [{ ratePpm: pick([0, 50000, 100000, 200000]) }],
        lineDiscount: discounted && random() < 0.4 ? discount(20000) : undefined,
      }));
      const orderDiscount = discounted && random() < 0.6 ? discount(40000) : undefined;
      for (const pricesIncludeTax of [false, true]) {
        const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(pricesIncludeTax) });
        for (const { lineDiscount, ...line } of lines) {
          const lineId = builder.addLine(line);
          if (lineDiscount) builder.applyLineDiscount(lineId, lineDiscount);
        }
        if (orderDiscount) builder.applyOrderDiscount(orderDiscount);
        const order = builder.getSnapshot();
        const context = `cart ${cart}, inclusive display ${pricesIncludeTax}`;
        expectAddsUp(order, context);
        if (order.discountMinor === 0) {
          expect(order.display.discountMinor, `${context}: no discount, so none shown`).toBe(0);
          if (!pricesIncludeTax) expect(order.display.subtotalMinor, `${context}: no discount, same subtotal`).toBe(order.subtotalMinor);
        }
      }
    }
  });
});

/** The spec's conversion, as an oracle: an own-mode amount in the display mode, converted on its own (ADR-063). */
function convert(li: LineItem, amountMinor: number, displayInclusive: boolean) {
  if (li.taxInclusive === displayInclusive) return amountMinor;
  const tax = roundMicrosToMinor(taxMicros(amountMinor, li.taxLines.reduce((sum, t) => sum + t.ratePpm, 0), li.taxInclusive));
  return li.taxInclusive ? amountMinor - tax : amountMinor + tax;
}

/**
 * The line figures' invariants (ADR-063): lines sum to the subtotal, line discounts plus the order row to the discount;
 * every discount row is its own amount converted on its own; the rounding residue sits only on the last converted line,
 * within one cent per converted line, and is 0 when no line is converted. Returns the residue.
 */
function expectLinesAddUp(order: Order, context = '') {
  const d = order.display;
  expect(d.lines.map((l) => l.lineId), context).toEqual(order.lineItems.map((li) => li.id));
  expect(d.lines.reduce((sum, l) => sum + l.amountMinor, 0), `${context} Σ lines = subtotal`).toBe(d.subtotalMinor);
  const lineDiscounts = d.lines.flatMap((l) => l.discounts.map((row) => row.amountMinor));
  expect(lineDiscounts.reduce((sum, amount) => sum + amount, 0) + d.orderDiscountMinor, `${context} Σ line discounts + order row = discount`).toBe(d.discountMinor);
  for (const amount of [...d.lines.map((l) => l.amountMinor), ...lineDiscounts, d.orderDiscountMinor, d.subtotalMinor, d.discountMinor]) {
    expect(amount, `${context} every figure >= 0`).toBeGreaterThanOrEqual(0);
  }
  expect(d.orderDiscountMinor, `${context} order row, converted on its own`)
    .toBe(order.lineItems.reduce((sum, li) => sum + convert(li, li.orderDiscountMinor, d.taxInclusive), 0));
  if (order.discounts.length === 0) expect(d.orderDiscountMinor, `${context} no order discount, no row`).toBe(0);
  const converted = order.lineItems.flatMap((li, index) => li.taxInclusive === d.taxInclusive ? [] : [index]);
  const residues = order.lineItems.map((li, index) => {
    expect(d.lines[index].discounts.map((row) => row.amountMinor), `${context} line ${index}'s rows`)
      .toEqual(li.discounts.map((own) => convert(li, own.amountMinor, d.taxInclusive)));
    return d.lines[index].amountMinor - convert(li, li.unitPriceMinor * li.quantity, d.taxInclusive);
  });
  const residue = residues.reduce((sum, r) => sum + r, 0);
  residues.forEach((r, index) => {
    if (index !== converted[converted.length - 1]) expect(r, `${context} no residue on line ${index}`).toBe(0);
  });
  // The bound: 0 with no converted line; else ⌊n/2⌋ + 1 for n non-zero rounded conversions on converted lines.
  const conversions = converted.flatMap((index) => {
    const li = order.lineItems[index];
    return [li.unitPriceMinor * li.quantity, li.orderDiscountMinor, ...li.discounts.map((own) => own.amountMinor)];
  }).filter((x) => x !== 0).length;
  const bound = converted.length === 0 ? 0 : Math.floor(conversions / 2) + 1;
  expect(Math.abs(residue), `${context} residue within its bound`).toBeLessThanOrEqual(bound);
  return residue;
}

describe('display line figures (ADR-063)', () => {
  // Line A: 3 × €10.00 with 10% and €1.50 off (stacked); line B: €9.99 with €0.99 off; 15% off the order; 19%.
  function discounted(prices: 'exclusive' | 'inclusive' | 'mixed', pricesIncludeTax: boolean) {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(pricesIncludeTax, 190000) });
    const a = builder.addLine({ productId: 'a', name: 'A', quantity: 3, unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: prices !== 'exclusive' } });
    const b = builder.addLine({ productId: 'b', name: 'B', unitPrice: { amount: 999, currency: 'EUR', taxInclusive: prices === 'inclusive' } });
    builder.applyLineDiscount(a, { type: 'percentage', value: 10, label: 'Ten' });
    builder.applyLineDiscount(a, { type: 'fixed', value: 150 });
    builder.applyLineDiscount(b, { type: 'fixed', value: 99 });
    builder.applyOrderDiscount({ type: 'percentage', value: 15 });
    return builder.getSnapshot();
  }

  // Own mode: A 3000 − 300 − 150, B 999 − 99; the order's 15% of 3450 is 518, allocated A 383, B 135.
  // Converting to inclusive adds round(19%) to each amount on its own; to exclusive, takes off round(19/119).
  it.each([
    { prices: 'exclusive', pricesIncludeTax: false, lines: [[3000, 300, 150], [999, 99]], orderDiscountMinor: 518, subtotalMinor: 3999, discountMinor: 1067, residue: 0 },
    { prices: 'inclusive', pricesIncludeTax: true, lines: [[3000, 300, 150], [999, 99]], orderDiscountMinor: 518, subtotalMinor: 3999, discountMinor: 1067, residue: 0 },
    // 3570 + 1189 = 4759, but the total 3489 (2932 + 557 tax) + 1271 off is 4760: B, the last converted line, shows 1190.
    { prices: 'exclusive', pricesIncludeTax: true, lines: [[3570, 357, 179], [1190, 118]], orderDiscountMinor: 456 + 161, subtotalMinor: 4760, discountMinor: 1271, residue: 1 },
    { prices: 'inclusive', pricesIncludeTax: false, lines: [[2521, 252, 126], [839, 83]], orderDiscountMinor: 322 + 113, subtotalMinor: 3360, discountMinor: 896, residue: 0 },
    { prices: 'mixed', pricesIncludeTax: false, lines: [[2521, 252, 126], [999, 99]], orderDiscountMinor: 322 + 135, subtotalMinor: 3520, discountMinor: 934, residue: 0 },
    { prices: 'mixed', pricesIncludeTax: true, lines: [[3000, 300, 150], [1189, 118]], orderDiscountMinor: 383 + 161, subtotalMinor: 4189, discountMinor: 1112, residue: 0 },
  ] as const)('$prices prices, inclusive display $pricesIncludeTax: every figure adds up', (row) => {
    const order = discounted(row.prices, row.pricesIncludeTax);
    expectAddsUp(order);
    expect(expectLinesAddUp(order)).toBe(row.residue);
    expect(order.display.lines.map((l) => [l.amountMinor, ...l.discounts.map((d) => d.amountMinor)])).toEqual(row.lines);
    expect(order.display).toMatchObject({ orderDiscountMinor: row.orderDiscountMinor, subtotalMinor: row.subtotalMinor, discountMinor: row.discountMinor });
    expect(order.display.lines[0].discounts.map((d) => d.label)).toEqual(['Ten', undefined]);
    // The settlement lines are the own-mode figures above: 2167 and 765 net, after shares of 383 and 135.
    expect(order.lineItems.map((li) => [li.netMinor, li.orderDiscountMinor])).toEqual([[2167, 383], [765, 135]]);
  });

  // ADR-062's mixed fixture with €9.50 off B: discounting B moves the order's tax rounding by a cent. The cashier's
  // 950 is shown exactly (converted, when B is converted), and the cent sits on the last converted line's amount.
  it.each([
    { pricesIncludeTax: false, lines: [[2522], [1000, 950]], subtotalMinor: 3522, discountMinor: 950 },
    { pricesIncludeTax: true, lines: [[3000], [1191, 1131]], subtotalMinor: 4191, discountMinor: 1131 },
  ])('the mixed fixture with €9.50 off B puts the rounding cent on the converted line (inclusive display $pricesIncludeTax)', (row) => {
    const builder = mixed(row.pricesIncludeTax);
    const b = builder.getSnapshot().lineItems[1].id;
    builder.applyLineDiscount(b, { type: 'fixed', value: 950 });
    const order = builder.getSnapshot();
    expectAddsUp(order);
    expect(expectLinesAddUp(order)).toBe(1);
    expect(order.display.lines.map((l) => [l.amountMinor, ...l.discounts.map((d) => d.amountMinor)])).toEqual(row.lines);
    expect(order.display).toMatchObject({ subtotalMinor: row.subtotalMinor, discountMinor: row.discountMinor, orderDiscountMinor: 0 });
  });

  // Regression: one converted line whose rounded conversions all lean the same way. Gross 44172 → 53006 (tax 8834.4
  // rounds down); rows 17578 → 21094, 23853 → 28624, order share 1398 → 1678 (each tax x.6 rounds up). The total
  // 1343 + 269 tax = 1612, plus 51396 off, is 53008: a residue of 2, over one cent per converted line but within ⌊4/2⌋ + 1.
  it('a residue of 2 on one converted line is rounding, not an error: the builder does not throw', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(true) });
    const lineId = builder.addLine({ productId: 'p1', name: 'Item', quantity: 3, unitPrice: { amount: 14724, currency: 'EUR', taxInclusive: false } });
    builder.applyLineDiscount(lineId, { type: 'fixed', value: 17578 });
    builder.applyLineDiscount(lineId, { type: 'percentage', value: 54 });
    builder.applyOrderDiscount({ type: 'percentage', value: 51 });
    const order = builder.getSnapshot();
    expectAddsUp(order);
    expect(expectLinesAddUp(order)).toBe(2);
    expect(order.display.lines.map((l) => [l.amountMinor, ...l.discounts.map((d) => d.amountMinor)])).toEqual([[53008, 21094, 28624]]);
    expect(order.display).toMatchObject({ subtotalMinor: 53008, discountMinor: 51396, orderDiscountMinor: 1678, taxMinor: 269, totalMinor: 1612 });
  });

  it.each([
    { residue: 1, convertedLines: 0, conversions: 0 },
    { residue: -1, convertedLines: 0, conversions: 0 },
    { residue: 4, convertedLines: 1, conversions: 4 },
    { residue: -4, convertedLines: 2, conversions: 5 },
  ])('the residue guard throws past its bound: $residue with $convertedLines converted lines, $conversions conversions', (row) => {
    expect(() => assertDisplayResidue(row.residue, row.convertedLines, row.conversions)).toThrow(/exceeds its bound/);
  });

  it.each([
    { residue: 0, convertedLines: 0, conversions: 0 },
    { residue: 2, convertedLines: 1, conversions: 4 },
    { residue: 3, convertedLines: 1, conversions: 4 },
    { residue: -3, convertedLines: 2, conversions: 5 },
  ])('the residue guard allows $residue with $convertedLines converted lines, $conversions conversions', (row) => {
    expect(() => assertDisplayResidue(row.residue, row.convertedLines, row.conversions)).not.toThrow();
  });

  it('the medusapos cart: the line shows 400 above Subtotal 400, and the order discount is its own row of 90', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(false, 250000) });
    const lineId = builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 400, currency: 'EUR' } });
    builder.applyOrderDiscount({ type: 'fixed', value: 90 });
    const order = builder.getSnapshot();
    expectLinesAddUp(order);
    expect(order.display.lines).toEqual([{ lineId, amountMinor: 400, discounts: [] }]);
    expect(order.display).toMatchObject({ subtotalMinor: 400, discountMinor: 90, orderDiscountMinor: 90 });
  });

  it('holds for 200 seeded random carts with stacked line and order discounts, in both display modes', () => {
    let seed = 0x48d1;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const discount = (max: number): Discount => random() < 0.5
      ? { type: 'percentage', value: int(1, 60) }
      : { type: 'fixed', value: int(1, max) };
    const discounts = (max: number) => Array.from({ length: int(0, 2) }, () => discount(max));

    for (let cart = 0; cart < 200; cart++) {
      const lines = Array.from({ length: int(1, 4) }, (_, index) => ({
        productId: `p${index}`, name: `Item ${index}`, quantity: int(1, 3),
        unitPrice: { amount: int(1, 20000), currency: 'EUR', taxInclusive: random() < 0.5 },
        taxRates: [{ ratePpm: [0, 50000, 100000, 190000, 200000][int(0, 4)] }],
        lineDiscounts: discounts(20000),
      }));
      const orderDiscounts = discounts(40000);
      for (const pricesIncludeTax of [false, true]) {
        const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(pricesIncludeTax) });
        for (const { lineDiscounts, ...line } of lines) {
          const lineId = builder.addLine(line);
          for (const d of lineDiscounts) builder.applyLineDiscount(lineId, d);
        }
        for (const d of orderDiscounts) builder.applyOrderDiscount(d);
        const order = builder.getSnapshot();
        const context = `cart ${cart}, inclusive display ${pricesIncludeTax}`;
        expectAddsUp(order, context);
        expectLinesAddUp(order, context);
      }
    }
  });
});
