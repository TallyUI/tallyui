import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CustomerAddress, StoreSettings } from '@tallyui/core';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import { orderDraftSchema, type CustomerSummary, type Order } from '../order';
import { CUSTOMER_REFUSALS, toOrderCreateEnvelope } from '../pos-order/command';
import { finalizeOrder } from '../pos-order/finalize';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { ADDRESS_CHANGE_REFUSED, META_CHANGE_REFUSED, META_INVALID, useSale } from './use-sale';

const entries = catalogueEntries([{ id: 10, name: 'Shirt', price: '10.00' }], traits, { currency: 'AUD' });
const AU = { id: 1, code: 'AU-GST-1', label: 'GST', rate: '10.0000', priority: 1, compound: false, shipping: true };
const settings: StoreSettings = {
  currency: 'AUD', pricesIncludeTax: false, taxRatesPpm: { default: 100000 }, taxRates: { standard: [AU] },
  taxClassSlugs: ['standard'], shippingTaxClass: 'inherit',
};
const billing: CustomerAddress = { firstName: 'Matt', address1: '1 George St', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' };
const customer: CustomerSummary = { id: '9', name: 'Matt', billing };
const qldAddress: CustomerAddress = { country: 'AU', state: 'QLD' };
const M2 = [{ key: 'table', value: '14' }, { key: 'waiter', value: 'Ana' }];
type Sale = { current: ReturnType<typeof useSale> };

describe('useSale setMeta (ADR-092 6d, tally-woo 08a)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `salemeta${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function saleOn(who: CustomerSummary | null = customer) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(settings)}>{children}</TaxProvider>;
    }
    const { result } = renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 12 }, drafts: db.pos_drafts }), { wrapper: Wrapper });
    if (who) act(() => result.current.setCustomer(who));
    act(() => { result.current.add(entries[0], traits); });
    return result;
  }
  function set(result: Sale, key: string, value: string | null) {
    let done: boolean | undefined;
    act(() => { done = result.current.setMeta(key, value); });
    return done;
  }
  function m2Sale() {
    const result = saleOn();
    set(result, ' table ', '12 ');
    set(result, 'waiter', 'Ana');
    set(result, 'table', '14');
    return result;
  }
  const figures = (order: Order) => ({ lineItems: order.lineItems, display: order.display, subtotalMinor: order.subtotalMinor,
    discountMinor: order.discountMinor, taxMinor: order.taxMinor, totalMinor: order.totalMinor });
  /** The sale's order paid in full in cash, finalized as the existing finalize tests do. */
  function finalized(order: Order) {
    return finalizeOrder({ ...order, payments: [{ id: 'cash-1', method: 'cash', amountMinor: order.totalMinor }],
      paidMinor: order.totalMinor, balanceDueMinor: 0 }, { capabilities: { orderCreate: 12 } });
  }

  it('M1: sets a trimmed key with its value as given, and leaves the lines and totals alone', () => {
    const result = saleOn();
    const before = figures(result.current.order);
    expect(set(result, ' table ', '12 ')).toBe(true);
    expect(result.current.order.meta).toEqual([{ key: 'table', value: '12 ' }]);
    expect(figures(result.current.order)).toEqual(before);
  });

  it('M2: replaces an existing key in place and never duplicates it', () => {
    const result = m2Sale();
    expect(result.current.order.meta).toEqual(M2);
  });

  it('M3: null removes a field, the last removal leaves no meta key, and removing an absent key is true', () => {
    const result = m2Sale();
    expect(set(result, 'table', null)).toBe(true);
    expect(result.current.order.meta).toEqual([{ key: 'waiter', value: 'Ana' }]);
    expect(set(result, 'waiter', null)).toBe(true);
    expect('meta' in result.current.order).toBe(false);
    expect(set(result, 'nothing', null)).toBe(true);
    expect('meta' in result.current.order).toBe(false);
  });

  it('M4: a guest sale takes meta', () => {
    const result = saleOn(null);
    expect(result.current.order.customer).toBeNull();
    expect(set(result, 'table', '1')).toBe(true);
    expect(result.current.order.meta).toEqual([{ key: 'table', value: '1' }]);
  });

  it('M5: refuses in tender, then sets once the tender is cancelled and clears the refusal', () => {
    const result = m2Sale();
    act(() => result.current.startTender('cash'));
    expect(set(result, 'table', '15')).toBe(false);
    expect(result.current.error).toBe(META_CHANGE_REFUSED);
    expect(result.current.order.meta).toEqual(M2);
    act(() => result.current.cancelTender());
    expect(set(result, 'table', '15')).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.order.meta).toEqual([{ key: 'table', value: '15' }, { key: 'waiter', value: 'Ana' }]);
  });

  const fill = (result: Sale) => act(() => { for (let i = 0; i < 50; i++) result.current.setMeta(`k${i}`, `v${i}`); });
  it.each([
    ['a key starting with _', '_secret', false],
    ['a blank key', '  ', false],
    ['a 256-character key', 'k'.repeat(256), false],
    ['a 51st new key', 'k50', true],
  ])('M6: refuses %s, keeps the meta, and a valid call clears the error', (_name, key, full) => {
    const result = saleOn();
    if (full) fill(result);
    const before = result.current.order.meta;
    expect(set(result, key, 'x')).toBe(false);
    expect(result.current.error).toBe(META_INVALID);
    expect(result.current.order.meta).toEqual(before);
    expect(set(result, 'k0', 'again')).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('M6: with 50 set, replaces and removes; a 255-character key is accepted', () => {
    const result = saleOn();
    fill(result);
    expect(result.current.order.meta).toHaveLength(50);
    expect(set(result, 'k3', 'replaced')).toBe(true);
    expect(result.current.order.meta![3]).toEqual({ key: 'k3', value: 'replaced' });
    expect(set(result, 'k49', null)).toBe(true);
    expect(result.current.order.meta).toHaveLength(49);
    const long = 'k'.repeat(255);
    expect(set(result, long, 'ok')).toBe(true);
    expect(result.current.order.meta![49]).toEqual({ key: long, value: 'ok' });
    expect(result.current.error).toBeNull();
  });

  it('M7: a successful setMeta leaves another error in place', () => {
    const result = saleOn();
    act(() => result.current.startTender('cash'));
    act(() => { expect(result.current.setAddresses(undefined, qldAddress)).toBe(false); });
    expect(result.current.error).toBe(ADDRESS_CHANGE_REFUSED);
    act(() => result.current.cancelTender());
    // cancelTender clears the address refusal itself, so the other error is setCustomer's refusal of an unsendable email.
    expect(result.current.error).toBeNull();
    act(() => result.current.setCustomer({ id: '10', name: 'Bad', email: 'x'.repeat(255) }));
    expect(result.current.error).toBe(CUSTOMER_REFUSALS[0]);
    expect(set(result, 'table', '1')).toBe(true);
    expect(result.current.error).toBe(CUSTOMER_REFUSALS[0]);
  });

  it('M9: parks and resumes the meta with the sale', async () => {
    const result = m2Sale();
    const draftId = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    expect('meta' in result.current.order).toBe(false);
    await act(async () => { expect(await result.current.resume(draftId)).toBeNull(); });
    expect(result.current.order.id).toBe(draftId);
    expect(result.current.order.meta).toEqual(M2);
  });

  it('M10, M11: finalize stores the meta, sent at 12 and dropped at 11', () => {
    const result = m2Sale();
    const stored = finalized(result.current.order);
    expect(stored.meta).toEqual(M2);
    const at12 = toOrderCreateEnvelope(stored, 'device_meta', 1, { maxVersion: 12 });
    expect(at12.version).toBe(12);
    expect(at12.payload.meta).toEqual(M2);
    const at11 = toOrderCreateEnvelope(stored, 'device_meta', 1, { maxVersion: 11 });
    expect(at11.version).toBe(11);
    expect('meta' in at11.payload).toBe(false);
  });

  it('M12: a sale with no meta stores no meta key', () => {
    const result = saleOn();
    const stored = finalized(result.current.order);
    expect('meta' in stored).toBe(false);
  });
});
