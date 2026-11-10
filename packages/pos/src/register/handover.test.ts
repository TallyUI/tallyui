import { describe, expect, it } from 'vitest';
import type { ClosureContext } from './closure-document';
import { handoverSlip, switchWarnings, type SwitchKind } from './handover';
import type { RegisterSession } from './schemas';

const counts = (pending: number) => ({ pending, rejected: 0, stuck: 0 });
const outbox = (sales: number, tillUpdates = 0) => ({ sales: counts(sales), tillUpdates: counts(tillUpdates) });
const quiet = { parkedSales: 0, paidMinor: 0 };

describe('switchWarnings', () => {
  it.each<SwitchKind>(['cashier', 'register', 'signOut'])('%s: nothing left behind, then unsent sales and till updates', (kind) => {
    expect(switchWarnings({ kind, outbox: outbox(0), ...quiet })).toEqual({ kind, warnings: [], unsentSales: 0, sessionOpen: false });
    expect(switchWarnings({ kind, outbox: outbox(2, 1), ...quiet })).toEqual({
      kind, unsentSales: 2, sessionOpen: false,
      warnings: [{ code: 'unsentSales', count: 2 }, { code: 'unsentTillUpdates', count: 1 }],
    });
  });

  it('names an open or counting session for a register switch and a sign-out, never for a cashier switch', () => {
    for (const kind of ['register', 'signOut'] as const) {
      for (const sessionStatus of ['open', 'counting'] as const) {
        const result = switchWarnings({ kind, outbox: outbox(0), ...quiet, sessionStatus });
        expect(result.sessionOpen).toBe(true);
        expect(result.warnings).toEqual([{ code: 'openSession' }]);
      }
      expect(switchWarnings({ kind, outbox: outbox(0), ...quiet, sessionStatus: 'closed' }).warnings).toEqual([]);
    }
    const cashier = switchWarnings({ kind: 'cashier', outbox: outbox(0), ...quiet, sessionStatus: 'open' });
    expect(cashier).toMatchObject({ sessionOpen: false, warnings: [] });
  });

  it('lists parked sales and a partly paid sale, in order', () => {
    expect(switchWarnings({ kind: 'signOut', outbox: outbox(1), parkedSales: 3, paidMinor: 500, sessionStatus: 'open' }).warnings).toEqual([
      { code: 'unsentSales', count: 1 }, { code: 'parkedSales', count: 3 }, { code: 'partlyPaidSale' }, { code: 'openSession' },
    ]);
  });
});

const session: RegisterSession = {
  id: 's', register_id: 'r', store_key: '1', status: 'open', opened_at_gmt: '2026-09-11T08:00:00Z', counted_float_minor: 10000,
};
const context: ClosureContext = {
  store: { name: 'Shop' }, currency: 'USD', timezone: 'UTC', locale: 'en-GB', printedAt: '2026-09-11T12:00:00Z',
  exponent: 2, formatMoney: (v) => v, i18n: {},
};
const input = {
  session, cashier: { name: 'Sam' }, registerName: 'Till 1', openedByName: 'Alex', salesCount: 7,
  expected: { cash: 15000, card: 4200 }, blind: false, outbox: outbox(2, 1), context,
};

describe('handoverSlip', () => {
  it("builds the slip's data and an X-report envelope marked as a hand-over", () => {
    const slip = handoverSlip(input);
    expect(slip).toMatchObject({
      registerName: 'Till 1', cashierName: 'Sam', openedByName: 'Alex', openedAtTime: '08:00', salesCount: 7,
      expected: { cash: 15000, card: 4200 }, unsentSales: 2, unsentTillUpdates: 1,
    });
    expect(slip.document.fiscal).toMatchObject({ document_type: 'handover', is_handover: true, is_x_report: true, receipt_number: '' });
    expect(slip.document.register.name).toBe('Till 1');
    expect(slip.document.closure.breakdowns.labels).toMatchObject({ cashier_name: 'Sam', opened_by_name: 'Alex' });
    expect(slip.document.closure.breakdowns).toMatchObject({ transaction_count: 7 });
    expect(slip.document.closure.tenders.find((t) => t.name === 'cash')?.expected).toBe('150.00');
  });

  it('carries no expected figures while blind', () => {
    const slip = handoverSlip({ ...input, session: { ...session, counted: { cash: 15000 } }, blind: true });
    expect(slip.expected).toBeNull();
    expect(slip.document.closure.tenders.map((t) => [t.name, t.expected])).toEqual([['cash', '']]);
  });
});
