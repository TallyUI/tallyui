// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder, withSentForm } from '../pos-order/finalize';
import { buildReceiptData } from '../receipt/build-receipt-data';
import type { ReceiptConfig } from '../receipt/types';
import { ensureRegister } from '../register/register-document';
import { closureSchema, registerSessionCreator } from '../register/schemas';
import {
  closeSession, openSession, stampSession, writeClosure,
  type ClosureCollection, type RegisterSessionCollection,
} from '../register/session-store';
import type { TaxContext, WooRate } from '../tax/types';
import { reportOrderFromPosOrder } from './adapters';

describe('a WooCommerce sale with a converted line: receipt, recorded taxByRate, Reports and the Z report agree per rate', () => {
  let db: RxDatabase<{ register_sessions: RegisterSessionCollection; closures: ClosureCollection }>;
  let splits: Record<'receipt' | 'recorded' | 'reportsFallback' | 'zReport', {
    ratePpm: number; netMinor?: number; amountMinor: number;
  }[]>;

  beforeAll(async () => {
    const rates: Record<string, WooRate[]> = {
      standard: [{ id: 1, code: 'vat-20', label: 'VAT 20%', rate: '20.0000', priority: 1, compound: false, shipping: true }],
      reduced: [{ id: 2, code: 'vat-10', label: 'VAT 10%', rate: '10.0000', priority: 1, compound: false, shipping: true }],
    };
    const taxContext: TaxContext = {
      pricesIncludeTax: false,
      rounding: { granularity: 'woocommerce', roundAtSubtotal: false },
      getTaxRatePpm: () => { throw new Error('WooCommerce must use the rate list'); },
      getTaxRates: (taxClass) => rates[taxClass || 'standard'],
    };
    const builder = createOrderBuilder({ currency: 'EUR', taxContext });
    builder.addLine({
      productId: 'p1', name: 'Converted 20%', quantity: 1, taxClass: 'standard',
      unitPrice: { amount: 3, currency: 'EUR', taxInclusive: true },
    });
    builder.addLine({
      productId: 'p2', name: 'Exclusive 10%', quantity: 1, taxClass: 'reduced',
      unitPrice: { amount: 10, currency: 'EUR', taxInclusive: false },
    });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order = builder.getSnapshot();
    const posOrder = finalizeOrder(order, { capabilities: { orderCreate: 6 }, registerId: 'register' });
    const legacyOrder = finalizeOrder(order, { capabilities: { orderCreate: 2 }, registerId: 'register' });
    const config: ReceiptConfig = { storeName: 'Tax probe' };
    const receipt = buildReceiptData(withSentForm(order, posOrder), config);

    db = await createRxDatabase({
      name: `taxprobe${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
      multiInstance: false,
    });
    await db.addCollections({
      register_sessions: registerSessionCreator(),
      closures: { schema: closureSchema },
    });
    await ensureRegister(db.register_sessions, 'web');
    const session = await openSession(db.register_sessions, {
      registerId: 'register', storeKey: 'store', expectedFloatMinor: 0, countedFloatMinor: 0,
      openedBy: 'cashier', businessDay: { year: 2026, month: 11, day: 17 },
    });
    const stampedOrder = await stampSession(posOrder, session.id, db.register_sessions);
    const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: order.totalMinor } });
    const closure = await writeClosure({
      closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed,
      counted: order.totalMinor, otherTenders: {}, movements: [], orders: [stampedOrder], softwareVersion: '1.0.0',
    });
    const zRates = closure.breakdowns.tax_rates as Record<string, { net_minor: number; tax_minor: number }>;
    splits = {
      receipt: receipt.totals.taxLines.map(({ ratePpm, amountMinor }) => ({ ratePpm, amountMinor })),
      recorded: posOrder.taxByRate!.map(({ ratePpm, netMinor, amountMinor }) => ({ ratePpm, netMinor, amountMinor })),
      reportsFallback: reportOrderFromPosOrder(legacyOrder).taxes.map(({ ratePpm, netMinor, taxMinor }) => ({
        ratePpm, netMinor, amountMinor: taxMinor,
      })),
      zReport: Object.entries(zRates).map(([rate, row]) => ({
        ratePpm: Number(rate), netMinor: row.net_minor, amountMinor: row.tax_minor,
      })),
    };
    for (const split of Object.values(splits)) split.sort((a, b) => a.ratePpm - b.ratePpm);
    expect(legacyOrder.taxByRate).toBeUndefined();
  });

  afterAll(async () => { await db?.remove(); });

  // The live receipt omits netMinor; compare the two fields present on both sides.
  it('live receipt equals recorded taxByRate', () => {
    expect(splits.receipt).toEqual([{ ratePpm: 100000, amountMinor: 1 }, { ratePpm: 200000, amountMinor: 1 }]);
    expect(splits.recorded.map(({ ratePpm, amountMinor }) => ({ ratePpm, amountMinor }))).toEqual(splits.receipt);
  });

  it('live receipt equals Reports fallback', () => {
    expect(splits.reportsFallback.map(({ ratePpm, amountMinor }) => ({ ratePpm, amountMinor }))).toEqual(splits.receipt);
  });

  it('live receipt equals Z report per-rate figures', () => {
    expect(splits.zReport.map(({ ratePpm, amountMinor }) => ({ ratePpm, amountMinor }))).toEqual(splits.receipt);
  });
});
