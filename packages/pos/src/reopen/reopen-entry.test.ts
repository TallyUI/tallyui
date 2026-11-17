import { describe, expect, it, vi } from 'vitest';
import type { StoreOrder, StoreOrderLine } from '@tallyui/core';
import { STORE_ORDER_REBUILD_REFUSALS, type StoreOrderRebuildReason } from '../order/from-store-order';
import { ReopenEntryError, storeOrderForReopen } from './reopen-entry';

const taxContext = { getTaxRatePpm: () => 100000, pricesIncludeTax: false };
const options = { currency: 'EUR', taxContext, catalogue: () => ({}) };

function storeOrder(): StoreOrder {
  return {
    id: '41', reference: '41', clientOrderId: 'u-1', revision: 'sha256:a', status: 'completed',
    placedAt: '2026-11-17T10:00:00.000Z', currency: 'EUR', pricesIncludeTax: false, customer: null,
    lines: [
      { id: '7', productId: 'coffee', name: 'Coffee', quantity: 2,
        subtotalMinor: 2000, totalMinor: 2000, subtotalTaxMinor: 200, taxMinor: 200 },
      { id: '8', productId: 'tea', name: 'Tea', quantity: 1,
        subtotalMinor: 1000, totalMinor: 1000, subtotalTaxMinor: 100, taxMinor: 100 },
      { id: '9', productId: 'cocoa', name: 'Cocoa', quantity: 1,
        subtotalMinor: 600, totalMinor: 600, subtotalTaxMinor: 60, taxMinor: 60 },
    ],
    fees: [{ id: 'f1', name: 'Handling', totalMinor: 500, taxMinor: 50, taxStatus: 'taxable' }],
    shipping: [{ id: 's1', name: 'Delivery', totalMinor: 800, taxMinor: 80, taxStatus: 'taxable', methodId: 'flat_rate' }],
    coupons: [], refunds: [], discountMinor: 0, discountTaxMinor: 0, taxLines: [],
    taxMinor: 490, totalMinor: 5390,
    payments: [{ id: 'p1', method: 'pos_cash', amountMinor: 1000 }],
  };
}

describe('storeOrderForReopen', () => {
  it('builds the base order with store ids, totals and a locked payment', () => {
    const read = storeOrder();
    const snapshot = storeOrderForReopen(read, options).getSnapshot();
    expect(snapshot.storeOrder).toEqual({ id: read.id, revision: read.revision, uuid: read.clientOrderId });
    expect(snapshot.totalMinor).toBe(read.totalMinor);
    expect(snapshot.taxMinor).toBe(read.taxMinor);
    expect(snapshot.payments).toHaveLength(1);
    expect(snapshot.payments[0]).toMatchObject({ storePaymentId: 'p1', locked: true });
  });

  it('looks up each product line exactly once, with the read line object', () => {
    const read = storeOrder();
    const catalogue = vi.fn((_line: StoreOrderLine) => ({}));
    storeOrderForReopen(read, { ...options, catalogue });
    expect(catalogue).toHaveBeenCalledTimes(read.lines.length);
    for (const [index, line] of read.lines.entries()) {
      expect(catalogue.mock.calls[index]).toHaveLength(1);
      expect(catalogue.mock.calls[index][0]).toBe(line);
    }
  });

  it("the catalogue's tax class reaches the rebuilt line", () => {
    const read = storeOrder();
    read.lines[0].subtotalTaxMinor = 100;
    read.lines[0].taxMinor = 100;
    read.taxMinor -= 100;
    read.totalMinor -= 100;
    const reducedTax = { ...taxContext, getTaxRatePpm: (taxClass?: string) => taxClass === 'reduced' ? 50000 : 100000 };
    const snapshot = storeOrderForReopen(read, {
      ...options, taxContext: reducedTax,
      catalogue: (line) => line.productId === 'coffee' ? { taxClass: 'reduced' } : {},
    }).getSnapshot();
    expect(snapshot.lineItems[0].taxLines[0].ratePpm).toBe(50000);
    expect(() => storeOrderForReopen(read, { ...options, taxContext: reducedTax }))
      .toThrowError(expect.objectContaining({ reason: 'totals' }));
  });

  it.each(['cancelled', 'failed', 'trash', 'Cancelled'])('refuses status %s', (status) => {
    const read = storeOrder();
    read.status = status;
    let refusal: unknown;
    try { storeOrderForReopen(read, options); } catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(ReopenEntryError);
    expect(refusal).toMatchObject({ reason: 'status', message: `An order that is ${status.toLowerCase()} cannot be reopened` });
  });

  it.each(['completed', 'processing', 'on-hold', 'pending', 'pos-open'])('allows status %s', (status) => {
    const read = storeOrder();
    read.status = status;
    expect(() => storeOrderForReopen(read, options)).not.toThrow();
  });

  it('checks status before the catalogue', () => {
    const read = storeOrder();
    read.status = 'cancelled';
    const catalogue = vi.fn(() => null);
    expect(() => storeOrderForReopen(read, { ...options, catalogue }))
      .toThrowError(expect.objectContaining({ reason: 'status' }));
    expect(catalogue).not.toHaveBeenCalled();
  });

  it('refuses the first missing product by name without looking up later lines', () => {
    const read = storeOrder();
    const catalogue = vi.fn((line: StoreOrderLine) => line === read.lines[1] ? null : {});
    let refusal: unknown;
    try { storeOrderForReopen(read, { ...options, catalogue }); } catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(ReopenEntryError);
    expect(refusal).toMatchObject({
      reason: 'catalogue', message: `"${read.lines[1].name}" is no longer in the till's catalogue`,
    });
    expect(catalogue).toHaveBeenCalledTimes(2);
    expect(catalogue.mock.calls[0][0]).toBe(read.lines[0]);
    expect(catalogue.mock.calls[1][0]).toBe(read.lines[1]);
  });

  it('leaves a line without a productId to the rebuild without looking it up', () => {
    const read = storeOrder();
    delete read.lines[1].productId;
    const catalogue = vi.fn((_line: StoreOrderLine) => ({}));
    expect(() => storeOrderForReopen(read, { ...options, catalogue }))
      .toThrowError(expect.objectContaining({ reason: 'product' }));
    expect(catalogue).toHaveBeenCalledTimes(2);
    expect(catalogue.mock.calls[0][0]).toBe(read.lines[0]);
    expect(catalogue.mock.calls[1][0]).toBe(read.lines[2]);
  });

  it('refuses payments whose sum exceeds the total', () => {
    const read = storeOrder();
    read.payments.push({ id: 'p2', method: 'pos_card', amountMinor: read.totalMinor - 1000 + 1 });
    let refusal: unknown;
    try { storeOrderForReopen(read, options); } catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(ReopenEntryError);
    expect(refusal).toMatchObject({ reason: 'overpaid', message: 'This order is paid more than its total' });
  });

  it('allows payments summing exactly to the total', () => {
    const read = storeOrder();
    read.payments.push({ id: 'p2', method: 'pos_card', amountMinor: read.totalMinor - 1000 });
    expect(storeOrderForReopen(read, options).getSnapshot().balanceDueMinor).toBe(0);
  });

  it.each<{ reason: StoreOrderRebuildReason; change: (read: StoreOrder) => void }>([
    { reason: 'payment_record', change: (read) => { read.paymentRecordUnreadable = true; } },
    // A WCPOS order whose ledger is not served has a payment with no store id (carryover item 16).
    { reason: 'store_id', change: (read) => { delete read.payments[0].id; } },
    { reason: 'refund', change: (read) => { read.refunds = [{ id: 'r1', amountMinor: 100 }]; } },
    { reason: 'currency', change: (read) => { read.currency = 'USD'; } },
  ])('passes through the rebuild refusal for $reason', ({ reason, change }) => {
    const read = storeOrder();
    change(read);
    let refusal: unknown;
    try { storeOrderForReopen(read, options); } catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(ReopenEntryError);
    expect(refusal).toMatchObject({ reason, message: STORE_ORDER_REBUILD_REFUSALS[reason] });
  });

  it('passes a non-rebuild error through unchanged', () => {
    const boom = new Error('boom');
    let refusal: unknown;
    try {
      storeOrderForReopen(storeOrder(), { ...options, catalogue: () => { throw boom; } });
    } catch (error) { refusal = error; }
    expect(refusal).toBe(boom);
    expect(refusal).not.toBeInstanceOf(ReopenEntryError);
  });

  it('passes a non-rebuild error thrown inside the rebuild through unchanged', () => {
    const boom = new Error('rate lookup failed');
    let refusal: unknown;
    try {
      storeOrderForReopen(storeOrder(), {
        ...options, taxContext: { ...taxContext, getTaxRatePpm: () => { throw boom; } },
      });
    } catch (error) { refusal = error; }
    expect(refusal).toBe(boom);
    expect(refusal).not.toBeInstanceOf(ReopenEntryError);
  });

  it.each(['success', 'status', 'catalogue', 'rebuild', 'overpaid'])('does not change the read on %s', (mode) => {
    const read = storeOrder();
    if (mode === 'status') read.status = 'failed';
    if (mode === 'rebuild') read.currency = 'USD';
    if (mode === 'overpaid') read.payments[0].amountMinor = read.totalMinor + 1;
    const before = structuredClone(read);
    const check = () => storeOrderForReopen(read, {
      ...options, catalogue: () => mode === 'catalogue' ? null : {},
    });
    if (mode === 'success') expect(check).not.toThrow();
    else expect(check).toThrow(ReopenEntryError);
    expect(read).toEqual(before);
  });
});
