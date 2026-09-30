import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ProductTraits } from '@tallyui/core';
import { TaxProvider, useTax, taxLogger } from '../tax/tax-provider';
import type { LogEntry } from '../logging';
import { createOrderBuilder } from './order-builder';
import { addEntryToCart } from '../sale/cart';
import { catalogueEntries } from '../sale/catalogue';
import { finalizeOrder } from '../pos-order/finalize';

// #288: a store with two tax classes, the default 25% and `reduced` 12%, through the real TaxProvider.
const rates = { default: 250000, reduced: 120000, zero: 0 };
function taxContext(pricesIncludeTax: boolean) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    <TaxProvider ratesPpm={rates} pricesIncludeTax={pricesIncludeTax}>{children}</TaxProvider>;
  return renderHook(() => useTax(), { wrapper }).result.current;
}

type Doc = { id: string; name: string; price: number; taxClass?: string };
const base = {
  getId: (doc: Doc) => doc.id, getName: (doc: Doc) => doc.name, getSku: () => undefined, getImageUrl: () => undefined,
  isSellable: () => true, getVariantCount: () => 1,
  getPrices: (doc: Doc) => [{ amount: doc.price, currency: 'EUR', kind: 'base' as const }],
  getVariants: (doc: Doc) => [{ id: `${doc.id}-v`, prices: base.getPrices(doc), stock: { status: 'in_stock' as const } }],
};
const traits = { ...base, getTaxClass: (doc: Doc) => doc.taxClass } as unknown as ProductTraits<Doc>;
const coffee: Doc = { id: 'p1', name: 'Coffee', price: 999 }; // no class: the default 25%
const bread: Doc = { id: 'p2', name: 'Bread', price: 333, taxClass: 'reduced' }; // 12%

function twoClassSale(pricesIncludeTax: boolean) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: taxContext(pricesIncludeTax) });
  builder.addProduct(coffee, traits);
  builder.addProduct(bread, traits, { quantity: 2 });
  builder.addPayment({ method: 'cash', amountMinor: 5000 });
  const order = builder.getSnapshot();
  return { order, posOrder: finalizeOrder(order, { capabilities: { orderCreate: 3 } }) };
}

describe('each line is taxed at its product tax class (#288)', () => {
  it('exclusive: each line carries its own rate, taxByRate has two rows, taxMinor matches the hand computation', () => {
    const { order, posOrder } = twoClassSale(false);
    // Coffee 999 × 25% = 249.75; bread 333 × 2 = 666 × 12% = 79.92.
    expect(order.lineItems.map((line) => line.taxLines)).toEqual([
      [{ ratePpm: 250000, taxMicros: '249750000' }], [{ ratePpm: 120000, taxMicros: '79920000' }]]);
    // 249.75 + 79.92 = 329.67, rounded once: 330. Total 999 + 666 + 330 = 1995.
    expect(order).toMatchObject({ taxMinor: 330, totalMinor: 1995 });
    // Floors 249 and 79 leave 330 − 328 = 2 units, one to each remainder (.92, .75): 250 and 80.
    expect(posOrder.taxByRate).toEqual([
      { ratePpm: 250000, netMinor: 999, amountMinor: 250, grossMinor: 1249 },
      { ratePpm: 120000, netMinor: 666, amountMinor: 80, grossMinor: 746 },
    ]);
  });

  it('inclusive: each line carries its own rate, taxByRate has two rows, taxMinor matches the hand computation', () => {
    const { order, posOrder } = twoClassSale(true);
    // Coffee 999 × 0.25 / 1.25 = 199.8; bread 666 × 0.12 / 1.12 = 71.357142857… → 71.357143 (micro, half up).
    expect(order.lineItems.map((line) => line.taxLines)).toEqual([
      [{ ratePpm: 250000, taxMicros: '199800000' }], [{ ratePpm: 120000, taxMicros: '71357143' }]]);
    // 199.8 + 71.357143 = 271.157143, rounded once: 271. Total is the shelf gross 999 + 666 = 1665.
    expect(order).toMatchObject({ taxMinor: 271, totalMinor: 1665 });
    // Floors 199 and 71 leave 271 − 270 = 1 unit, to the larger remainder (.8 over .357): 200 and 71.
    // Nets: 999 − round(199.8) = 799, 666 − round(71.357) = 595.
    expect(posOrder.taxByRate).toEqual([
      { ratePpm: 250000, netMinor: 799, amountMinor: 200, grossMinor: 999 },
      { ratePpm: 120000, netMinor: 595, amountMinor: 71, grossMinor: 666 },
    ]);
  });

  it("the till's cart path (addEntryToCart) passes the class too", () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: taxContext(false) });
    addEntryToCart(builder, catalogueEntries([bread], traits)[0], traits, 'EUR');
    expect(builder.getSnapshot().lineItems[0].taxLines).toEqual([{ ratePpm: 120000, taxMicros: '39960000' }]);
  });

  it('an unknown class falls back to the default rate and logs once per class', () => {
    const logged: LogEntry[] = [];
    taxLogger.addSink({ id: 'tax-class-288', levels: ['warn'], write: (entry) => logged.push(entry) });
    try {
      const builder = createOrderBuilder({ currency: 'EUR', taxContext: taxContext(false) });
      builder.addProduct({ ...coffee, taxClass: 'misconfigured' }, traits);
      builder.addProduct({ ...bread, taxClass: 'misconfigured' }, traits);
      expect(builder.getSnapshot().lineItems.map((line) => line.taxLines[0].ratePpm)).toEqual([250000, 250000]);
      expect(logged.map((entry) => entry.data)).toEqual([{ taxClass: 'misconfigured' }]);
    } finally {
      taxLogger.removeSink('tax-class-288');
    }
  });

  it('a class the store rates at 0 (a Vendure category with no rate in the zone) is taxed 0, with no warning', () => {
    const logged: LogEntry[] = [];
    taxLogger.addSink({ id: 'tax-class-288-zero', levels: ['warn'], write: (entry) => logged.push(entry) });
    try {
      const builder = createOrderBuilder({ currency: 'EUR', taxContext: taxContext(false) });
      builder.addProduct({ ...coffee, taxClass: 'zero' }, traits);
      expect(builder.getSnapshot().lineItems[0].taxLines).toEqual([{ ratePpm: 0, taxMicros: '0' }]);
      expect(builder.getSnapshot().taxMinor).toBe(0);
      expect(logged).toEqual([]);
    } finally {
      taxLogger.removeSink('tax-class-288-zero');
    }
  });

  it('traits without getTaxClass tax every line at the default rate, as before', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: taxContext(false) });
    const plain = base as unknown as ProductTraits<Doc>;
    builder.addProduct(coffee, plain);
    builder.addProduct(bread, plain);
    expect(builder.getSnapshot().lineItems.map((line) => line.taxLines[0].ratePpm)).toEqual([250000, 250000]);
  });
});
