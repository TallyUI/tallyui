import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import closureFixture from './__fixtures__/closure.json';
import closureLocalRow from './__fixtures__/closure-local-row.json';
import { closureFigures } from './closure-figures';

const local = closureLocalRow.breakdowns;
const withBreakdowns = (overrides: Record<string, unknown>) => ({ breakdowns: { ...local, ...overrides } });

it('reads a closure writeClosure wrote', () => {
  expect(closureFigures(closureLocalRow)).toEqual({
    openingFloat: { expectedMinor: 10000, countedMinor: 10000, varianceMinor: 0 },
    paymentMethods: [
      { id: 'cash', salesMinor: 13000, refundsMinor: 5000 },
      { id: 'card', salesMinor: 12000, refundsMinor: 0 },
    ],
    taxRates: [{ key: 'vat', name: 'VAT 20%', netMinor: 16667, taxMinor: 3333, grossMinor: 20000 }],
    movements: [{
      id: 'movement-fixture', type: 'paid_out', amountMinor: 500, reason: 'Petty cash', voided: true,
      createdAtGmt: '2026-09-11T10:00:00Z', createdBy: '1',
    }],
    transactionCount: 12, refundCount: 2,
    cashiers: [{ id: '1', name: 'Alex' }],
    taxRoundingMixed: false, taxIncludesStorePaid: false,
  });
});

// The store's own document carries decimal strings, never the `*_minor` money writeClosure writes:
// none of its money is read, its counts and cashiers are.
it('reads a closure adopted from the store', () => {
  expect(closureFigures(closureFixture.closure)).toEqual({
    openingFloat: {}, paymentMethods: [], taxRates: [], movements: [],
    transactionCount: 12, refundCount: 2,
    cashiers: [{ id: '1', name: 'Alex' }],
    taxRoundingMixed: false, taxIncludesStorePaid: false,
  });
  expect(closureFigures({ breakdowns: {} })).toEqual({
    openingFloat: {}, paymentMethods: [], taxRates: [], movements: [], cashiers: [],
    taxRoundingMixed: false, taxIncludesStorePaid: false,
  });
});

it('a missing opening float is unknown, never 0 (#1261)', () => {
  const { opening_float: _float, ...rest } = local;
  expect(closureFigures({ breakdowns: rest }).openingFloat).toEqual({});
  const nulls = closureFigures(withBreakdowns({ opening_float: { expected_minor: null, counted_minor: null, variance_minor: null } }));
  expect(nulls.openingFloat).toEqual({});
  expect(nulls.openingFloat).not.toHaveProperty('countedMinor', 0);
  const odd = closureFigures(withBreakdowns({ opening_float: { expected_minor: '100', variance_minor: Number.NaN } }));
  expect(odd.openingFloat).toEqual({});
  const counts = closureFigures(withBreakdowns({ transaction_count: null, refund_count: '2' }));
  expect([counts.transactionCount, counts.refundCount]).toEqual([undefined, undefined]);
});

it('drops a payment method or tax rate whose money is not an integer', () => {
  const figures = closureFigures(withBreakdowns({
    payment_methods: {
      cash: { name: 'Cash', sales_minor: 100, refunds_minor: 0 },
      card: { sales_minor: '12.00', refunds_minor: 0 },
      gift: { sales_minor: 1.5, refunds_minor: 0 },
      voucher: { sales_minor: 100 },
    },
    tax_rates: {
      vat: { net_minor: 100, tax_minor: 20, gross_minor: 120 },
      gst: { net_minor: 100, tax_minor: null, gross_minor: 120 },
    },
  }));
  expect(figures.paymentMethods).toEqual([{ id: 'cash', name: 'Cash', salesMinor: 100, refundsMinor: 0 }]);
  expect(figures.taxRates).toEqual([{ key: 'vat', netMinor: 100, taxMinor: 20, grossMinor: 120 }]);
});

it('a bare string cashier becomes id and name', () => {
  const figures = closureFigures(withBreakdowns({ cashiers: ['7', { id: '8' }, { id: '9', name: 'Sam' }, 42, null] }));
  expect(figures.cashiers).toEqual([{ id: '7', name: '7' }, { id: '8', name: '8' }, { id: '9', name: 'Sam' }]);
});

// Revert: cast `breakdowns.opening_float` or `breakdowns.cashiers` in closure-document.ts again.
it('pos reads the closure opening float and cashiers through closureFigures', () => {
  const source = readFileSync(path.join(process.cwd(), 'packages/pos/src/register/closure-document.ts'), 'utf8');
  expect(source).toContain('closureFigures(');
  expect(source).not.toContain('breakdowns.opening_float as');
  expect(source).not.toContain('breakdowns.cashiers ?? []) as');
});
