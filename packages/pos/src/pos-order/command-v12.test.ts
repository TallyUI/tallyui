// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CustomerAddress } from '@tallyui/core';
import { payloadBoundErrors, payloadShapeErrors, precheckCommand } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { INFORMATIONAL_EXTRAS_ORDER_CREATE_VERSION, ORDER_CREATE_MAX_VERSION, toOrderCreateEnvelope, toOrderUpdateEnvelope } from './command';
import { finalizeOrder, freezeSentForm } from './finalize';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';

const fixturePath = fileURLToPath(new URL('./__fixtures__/order-create-v12.json', import.meta.url));
const supported = { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], register: [1], orderUpdate: [1] };
const billing: CustomerAddress = { firstName: 'Ann', lastName: 'Lee', address1: '1 State St', city: 'Albany', state: 'NY', postcode: '12207', country: 'US' };
const taxIds = [{ type: 'eu_vat', value: 'DE123456789', country: 'DE', label: 'VAT number' }, { type: 'us_ein', value: '12-3456789' }];
const meta = [{ key: 'po_number', value: 'PO-1' }, { key: 'gift_message', value: '' }];

/** A finalized cash sale with figures and a customer with a billing address; `extras` adds the version-12 fields. */
function sale({ extras = true, methodId = undefined as string | undefined } = {}): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: {
    pricesIncludeTax: true, getTaxRatePpm: () => 190000, rounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    getTaxRates: () => [{ id: 1, code: 'VAT', label: 'VAT', rate: '19.0000', priority: 1, compound: false, shipping: true }],
  } });
  builder.addLine({ productId: 'p', name: 'Coffee', unitPrice: { amount: 1190, currency: 'EUR' } });
  builder.setCustomer({ id: '42', name: 'Ann Lee', email: 'ann@example.com', billing });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor, ...(methodId ? { methodId } : {}) });
  let nextId = 0;
  const order = finalizeOrder(builder.getSnapshot(), {
    now: new Date('2026-11-19T10:00:00.000Z'), newId: () => `019f8f66-7800-7000-8000-${String(++nextId).padStart(12, '0')}`,
    capabilities: { orderCreate: 12 },
  });
  // The setters come in later PRs (ADR-092 decision 6): the fields are set on the stored order here.
  return extras ? { ...order, customer: { ...order.customer!, taxIds }, meta,
    lines: order.lines.map((line) => ({ ...line, sku: 'COF-1-EDIT', catalogueSku: 'COF-1' })) } : order;
}
const envelope = (order: PosOrder, maxVersion: number) => toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion });
/** The same order without the version-12 fields. */
const withoutExtras = (order: PosOrder): PosOrder => {
  const { taxIds: _taxIds, ...customer } = order.customer!;
  const { meta: _meta, ...rest } = order;
  return { ...rest, customer, lines: order.lines.map(({ catalogueSku, ...line }) => ({ ...line, sku: catalogueSku ?? line.sku })) };
};
const extrasIn = (sent: unknown) => JSON.stringify(sent).match(/taxIds|"meta"|"sku"/g);

describe('order.create v12: tax ids, a catalogue line\'s edited SKU and order meta (ADR-092)', () => {
  it('W1 matches the golden file byte for byte at cap 12, without any label; it passes the server checks', () => {
    const sent = envelope(sale(), 12);
    expect(sent.version).toBe(12);
    expect(sent.payload.customer!.taxIds).toStrictEqual([{ type: 'eu_vat', value: 'DE123456789', country: 'DE' }, { type: 'us_ein', value: '12-3456789' }]);
    expect(sent.payload.meta).toStrictEqual(meta);
    expect(sent.payload.lines[0].sku).toBe('COF-1-EDIT');
    expect(JSON.stringify(sent)).not.toContain('label');
    expect(JSON.stringify(sent, null, 2) + '\n').toBe(readFileSync(fixturePath, 'utf8'));
    expect(precheckCommand(sent, supported)).toBeUndefined();
    expect(payloadShapeErrors(sent.payload)).toEqual([]);
    expect(payloadBoundErrors(sent.payload)).toEqual([]);
  });

  it('pins the stored maxima and golden version to the till maximum of 12', () => {
    const { properties } = posOrderCollection().schema;
    expect(ORDER_CREATE_MAX_VERSION).toBe(12);
    expect(INFORMATIONAL_EXTRAS_ORDER_CREATE_VERSION).toBe(ORDER_CREATE_MAX_VERSION);
    expect(properties.sentVersion.maximum).toBe(ORDER_CREATE_MAX_VERSION);
    expect(properties.downgradedFrom.maximum).toBe(ORDER_CREATE_MAX_VERSION);
    expect(JSON.parse(readFileSync(fixturePath, 'utf8')).version).toBe(ORDER_CREATE_MAX_VERSION);
  });

  it.each([[4, 4], [9, 4], [10, 4], [11, 11]])('W2 at cap %i sends the sale at version %i, as without the fields, and none of them', (cap, version) => {
    const order = sale(), sent = envelope(order, cap);
    expect(sent.version).toBe(version);
    expect(sent).toStrictEqual(envelope(withoutExtras(order), cap));
    expect(extrasIn(sent)).toBeNull();
  });

  it('W2 never lifts an order whose earlier attempt went out at 11: version 11, none of the fields', () => {
    const order: PosOrder = { ...sale(), sentVersion: 11 };
    const sent = envelope(order, 12);
    expect(sent.version).toBe(11);
    expect(sent).toStrictEqual(envelope(withoutExtras(order), 12));
    expect(extrasIn(sent)).toBeNull();
  });

  it('W3 sends an order without the fields at cap 12 exactly as at cap 11', () => {
    for (const order of [sale({ extras: false }), sale({ extras: false, methodId: 'cod' }), withoutExtras(sale())]) {
      expect(envelope(order, 12)).toStrictEqual(envelope(order, 11));
    }
  });

  it('W4 an unedited or empty sku sends no sku and does not make 12; a custom line never gets a top-level sku', () => {
    const plain = sale({ extras: false });
    for (const sku of [['COF-1', 'COF-1'], ['', 'COF-1']]) {
      const order = { ...plain, lines: plain.lines.map((line) => ({ ...line, sku: sku[0], catalogueSku: sku[1] })) };
      expect(envelope(order, 12)).toStrictEqual(envelope(plain, 12));
      expect(envelope(order, 12).version).toBe(11);
    }
    const custom = { ...plain, meta, lines: plain.lines.map((line) => ({ ...line, custom: { name: 'Coffee', taxStatus: 'taxable' as const },
      sku: 'GIFT', catalogueSku: 'COF-1' })) };
    const sent = envelope(custom, 12);
    expect(sent.version).toBe(12);
    expect(sent.payload.lines[0]).not.toHaveProperty('sku');
  });

  it("W5 at 12 carries an untaxed customer's addresses as at 11 and a payment methodId as at 10", () => {
    const sent = envelope(sale({ methodId: 'cod' }), 12);
    expect(sent.version).toBe(12);
    expect(sent.payload.customer).toMatchObject({ email: 'ann@example.com', customerId: '42', billing: { city: 'Albany', country: 'US' } });
    expect(sent.payload).not.toHaveProperty('taxAddress');
    expect(sent.payload.payments[0].methodId).toBe('cod');
    expect(precheckCommand(sent, supported)).toBeUndefined();
  });

  it('W6 a reopened order with the fields goes as order.update at createVersion 12 and carries them', () => {
    const order = sale();
    const reopened: PosOrder = { ...order, storeOrderId: '4711',
      baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298',
      payments: [{ ...order.payments[0], storePaymentId: '21' }] };
    const sent = toOrderUpdateEnvelope(reopened, 'device_golden', 1, { maxVersion: 12 });
    expect(sent.type).toBe('order.update');
    expect(sent.payload.createVersion).toBe(12);
    expect(sent.payload.customer!.taxIds).toStrictEqual(envelope(order, 12).payload.customer!.taxIds);
    expect(sent.payload.meta).toStrictEqual(meta);
    expect(sent.payload.lines[0].sku).toBe('COF-1-EDIT');
    expect(precheckCommand(sent, supported)).toBeUndefined();
    expect(extrasIn(toOrderUpdateEnvelope(reopened, 'device_golden', 1, { maxVersion: 11 }))).toBeNull();
  });

  it('W7 freezeSentForm cuts each new string at its bound, and a second freeze returns the same object', () => {
    const order = sale();
    const long: PosOrder = { ...order, customer: { ...order.customer!, taxIds: [{ type: 't'.repeat(40), value: 'v'.repeat(70), label: 'l'.repeat(300) }] },
      meta: [{ key: 'k'.repeat(300), value: 'v'.repeat(1100) }], lines: order.lines.map((line) => ({ ...line, sku: 's'.repeat(150) })) };
    const frozen = freezeSentForm(long);
    expect(frozen.customer!.taxIds).toStrictEqual([{ type: `${'t'.repeat(31)}…`, value: `${'v'.repeat(63)}…`, label: `${'l'.repeat(254)}…` }]);
    expect(frozen.meta).toStrictEqual([{ key: `${'k'.repeat(254)}…`, value: `${'v'.repeat(999)}…` }]);
    expect(frozen.lines[0].sku).toBe(`${'s'.repeat(99)}…`);
    expect(freezeSentForm(frozen)).toBe(frozen);
    expect(freezeSentForm(order)).toBe(order);
    for (const field of ['meta', 'taxIds', 'sku'] as const) {
      const one: PosOrder = field === 'meta' ? { ...order, meta: long.meta } : field === 'taxIds' ? { ...order, customer: long.customer } : { ...order, lines: long.lines };
      expect(freezeSentForm(one)).not.toBe(one);
    }
  });

  /** Sale without extras at cap 12 carrying the given tax ids and meta; asserts the store's shape and bound checks pass. */
  const sendExtras = (ids?: NonNullable<PosOrder['customer']>['taxIds'],entries?: PosOrder['meta']) => {
    const plain = sale({ extras: false });
    const sent = envelope({ ...plain, customer: { ...plain.customer!, ...(ids ? { taxIds: ids } : {}) }, ...(entries ? { meta: entries } : {}) }, 12);
    expect(payloadShapeErrors(sent.payload)).toEqual([]);
    expect(payloadBoundErrors(sent.payload)).toEqual([]);
    return sent;
  };

  it('X1 drops a tax id with an empty type or a NUL-only value and upper-cases a country', () => {
    const sent = sendExtras([{ type: '', value: '1' }, { type: 'vat', value: '\u0000' }, { type: 'vat', value: 'GB1', country: 'gb' }]);
    expect(sent.version).toBe(12);
    expect(sent.payload.customer!.taxIds).toStrictEqual([{ type: 'vat', value: 'GB1', country: 'GB' }]);
  });

  it('X2 an order whose only extra is an unsendable tax id goes at 11 without taxIds', () => {
    const sent = sendExtras([{ type: '', value: '' }]);
    expect(sent.version).toBe(envelope(sale({ extras: false }), 12).version);
    expect(sent.version).toBe(11);
    expect(sent.payload.customer).not.toHaveProperty('taxIds');
  });

  it('X3 leaves off a country that is not two letters and still sends the id', () => {
    const sent = sendExtras(['GBR', '1A', ''].map((country, i) => ({ type: 'vat', value: `V${i}`, country })));
    expect(sent.payload.customer!.taxIds).toStrictEqual([{ type: 'vat', value: 'V0' }, { type: 'vat', value: 'V1' }, { type: 'vat', value: 'V2' }]);
  });

  it('X4 sends only the first 10 of 12 tax ids', () => {
    const ids = Array.from({ length: 12 }, (_, i) => ({ type: 'vat', value: `V${i}` }));
    expect(sendExtras(ids).payload.customer!.taxIds).toStrictEqual(ids.slice(0, 10));
  });

  it('X5 drops an empty key, a _ key and a later duplicate key', () => {
    const sent = sendExtras(undefined, [{ key: '', value: 'a' }, { key: '_hidden', value: 'b' }, { key: 'note', value: 'c' }, { key: 'note', value: 'd' }]);
    expect(sent.payload.meta).toStrictEqual([{ key: 'note', value: 'c' }]);
  });

  it('X6 keys equal after the cut send once, and 51 entries send the first 50', () => {
    const long = 'k'.repeat(299);
    expect(sendExtras(undefined, [{ key: `${long}a`, value: '1' }, { key: `${long}b`, value: '2' }]).payload.meta)
      .toStrictEqual([{ key: `${'k'.repeat(254)}…`, value: '1' }]);
    const entries = Array.from({ length: 51 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }));
    expect(sendExtras(undefined, entries).payload.meta).toStrictEqual(entries.slice(0, 50));
  });

  it('X7 an order whose only extra is a _ meta key goes at 11 without meta', () => {
    const sent = sendExtras(undefined, [{ key: '_x', value: 'y' }]);
    expect(sent.version).toBe(11);
    expect(sent.payload).not.toHaveProperty('meta');
  });
});
