import { describe, it, expect, vi } from 'vitest';
import { createOrderBuilder } from './order-builder';
import type { TaxContext } from '../tax/types';
import type { Order } from './types';

const taxContext: TaxContext = {
  getTaxRatePpm: () => 100000,
  pricesIncludeTax: false,
};

const shirt = { productId: 'p1', name: 'Shirt', sku: 'SHIRT-1', unitPrice: { amount: 1200, currency: 'USD' }, regularUnitPriceMinor: 1200 };
const totals = (order: Order) => ({ subtotalMinor: order.subtotalMinor, taxMinor: order.taxMinor, totalMinor: order.totalMinor, discountMinor: order.discountMinor });

function setup() {
  const builder = createOrderBuilder({ currency: 'USD', taxContext });
  const id = builder.addLine(shirt);
  return { builder, id };
}

describe('OrderBuilder.updateLine (ADR-092 6b/6c)', () => {
  it('L1: a name edit is trimmed, leaves the totals, and stops a later scan merging', () => {
    const { builder, id } = setup();
    const before = totals(builder.getSnapshot());
    builder.updateLine(id, { name: ' Gift shirt ' });
    const after = builder.getSnapshot();
    expect(after.lineItems[0].name).toBe('Gift shirt');
    expect(totals(after)).toEqual(before);
    builder.addLine(shirt);
    const lines = builder.getSnapshot().lineItems;
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => [line.name, line.quantity])).toEqual([['Gift shirt', 1], ['Shirt', 1]]);
  });

  it('L2: a catalogue line keeps the SKU it was added with across SKU edits, and stops merging', () => {
    const { builder, id } = setup();
    builder.updateLine(id, { sku: 'S-EDIT' });
    expect(builder.getSnapshot().lineItems[0]).toMatchObject({ sku: 'S-EDIT', catalogueSku: 'SHIRT-1' });
    builder.updateLine(id, { sku: ' S-EDIT-2 ' });
    expect(builder.getSnapshot().lineItems[0]).toMatchObject({ sku: 'S-EDIT-2', catalogueSku: 'SHIRT-1' });
    builder.addLine(shirt);
    const lines = builder.getSnapshot().lineItems;
    expect(lines).toHaveLength(2);
    expect(lines[1].sku).toBe('SHIRT-1');
    expect(lines[1].catalogueSku).toBeUndefined();
  });

  it('L3: a custom line\'s SKU edit records no catalogue SKU', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const id = builder.addLine({ productId: 'custom:1', custom: true, name: 'Repair', sku: 'R-1', unitPrice: { amount: 500, currency: 'USD' } });
    builder.updateLine(id, { sku: 'R-2' });
    const line = builder.getSnapshot().lineItems[0];
    expect(line.sku).toBe('R-2');
    expect('catalogueSku' in line).toBe(false);
  });

  it('L4: a regular price is set without moving the price or totals, and null removes it', () => {
    const { builder, id } = setup();
    const before = builder.getSnapshot();
    builder.updateLine(id, { regularUnitPriceMinor: 1500 });
    const after = builder.getSnapshot();
    expect(after.lineItems[0].regularUnitPriceMinor).toBe(1500);
    expect(after.lineItems[0].unitPriceMinor).toBe(before.lineItems[0].unitPriceMinor);
    expect(totals(after)).toEqual(totals(before));
    builder.updateLine(id, { regularUnitPriceMinor: null });
    expect('regularUnitPriceMinor' in builder.getSnapshot().lineItems[0]).toBe(false);
  });

  it.each([
    { label: 'a blank name', patch: { name: '  ' }, error: 'A line needs a name' },
    { label: 'an empty SKU', patch: { sku: '' }, error: 'A line needs a SKU' },
    { label: 'a valid name with an empty SKU', patch: { name: 'ok', sku: '' }, error: 'A line needs a SKU' },
    { label: 'a negative regular price', patch: { regularUnitPriceMinor: -1 }, error: 'Regular price must be integer minor units >= 0' },
    { label: 'a fractional regular price', patch: { regularUnitPriceMinor: 1.5 }, error: 'Regular price must be integer minor units >= 0' },
    { label: 'an unknown line', patch: { name: 'ok' }, error: 'Unknown line nope', unknown: true },
  ])('L5: $label throws and changes nothing', ({ patch, error, unknown }) => {
    const { builder, id } = setup();
    const before = builder.getSnapshot();
    expect(() => builder.updateLine(unknown ? 'nope' : id, patch)).toThrow(error);
    expect(builder.getSnapshot()).toEqual(before);
    if (unknown) return;
    // A valid patch emits; a refused patch must not have leaked into the line's fields.
    builder.updateLine(id, { regularUnitPriceMinor: 1500 });
    const { name, sku, catalogueSku } = before.lineItems[0];
    const after = builder.getSnapshot().lineItems[0];
    expect(after).toMatchObject({ name, sku });
    expect(after.catalogueSku).toBe(catalogueSku);
  });

  it('L7: a custom line refuses a regular price and changes nothing; null is allowed (ADR-077 d3)', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const emit = vi.fn();
    const id = builder.addLine({ productId: 'custom:1', custom: true, name: 'Repair', sku: 'R-1', unitPrice: { amount: 500, currency: 'USD' } });
    builder.order$.subscribe(emit);
    emit.mockClear();
    const before = builder.getSnapshot();
    expect(() => builder.updateLine(id, { regularUnitPriceMinor: 500 })).toThrow(RangeError);
    expect(() => builder.updateLine(id, { regularUnitPriceMinor: 500 })).toThrow('A custom line has no regular price');
    expect(builder.getSnapshot()).toEqual(before);
    expect('regularUnitPriceMinor' in builder.getSnapshot().lineItems[0]).toBe(false);
    expect(emit).not.toHaveBeenCalled();
    expect(() => builder.updateLine(id, { regularUnitPriceMinor: null })).not.toThrow();
    expect('regularUnitPriceMinor' in builder.getSnapshot().lineItems[0]).toBe(false);
  });

  it('L6: two unedited scans of the same product still merge', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    builder.addLine(shirt);
    builder.addLine(shirt);
    const lines = builder.getSnapshot().lineItems;
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });
});
