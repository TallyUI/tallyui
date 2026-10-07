import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import { orderDraftSchema } from '../order';
import { TaxProvider } from '../tax';
import { catalogueEntries } from './catalogue';
import { COUPONS_UNSUPPORTED, type SaleDiscountCodes } from './discount-codes';
import { useSale } from './use-sale';

const entries = catalogueEntries([
  { id: 10, name: 'Shirt', price: '10.00', categories: [{ id: 7, name: 'Clothes' }] },
], traits, { currency: 'GBP' });
const rounding = { granularity: 'woocommerce' as const, roundAtSubtotal: false };
const taxProps = { pricesIncludeTax: false, ratesPpm: { default: 200000 }, taxRates: { standard: [
  { id: 1, code: 'rate-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true },
] } };
type DiscountCodes = SaleDiscountCodes<{ label: string }>;
function fake() {
  return {
    supports: vi.fn<DiscountCodes['supports']>(() => true),
    find: vi.fn<DiscountCodes['find']>(async (code) => ({ found: { label: code } })),
    check: vi.fn<DiscountCodes['check']>(() => null),
    apply: vi.fn<DiscountCodes['apply']>(() => {}),
  } satisfies DiscountCodes;
}

describe('useSale discount codes', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `salediscountcodes${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function renderSale(discountCodes: DiscountCodes) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProps} rounding={rounding}>{children}</TaxProvider>;
    }
    const hook = renderHook(() => useSale({ currency: 'GBP' }, {
      registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 6, coupons: true }, drafts: db.pos_drafts, discountCodes,
    }), { wrapper: Wrapper });
    act(() => hook.result.current.add(entries[0], traits));
    return hook;
  }

  it('passes the normalized code to find and shows its refusal as given', async () => {
    const codes = fake();
    codes.find.mockResolvedValue({ refusal: 'Promotion SPRING is not active' });
    const { result } = renderSale(codes);
    await act(async () => { expect(await result.current.applyCoupon('  SPRING ')).toBe('Promotion SPRING is not active'); });
    expect(codes.find).toHaveBeenCalledWith('spring', expect.anything());
    expect(codes.check).not.toHaveBeenCalled();
    expect(codes.apply).not.toHaveBeenCalled();
  });

  it('shows the check refusal as given and does not apply', async () => {
    const codes = fake();
    codes.check.mockReturnValue('Needs two items');
    const { result } = renderSale(codes);
    await act(async () => { expect(await result.current.applyCoupon('x')).toBe('Needs two items'); });
    expect(codes.check).toHaveBeenCalledWith('x', { label: 'x' }, expect.objectContaining({ accepted: new Map() }));
    expect(codes.check.mock.calls[0][2].order).toBe(result.current.order);
    expect(codes.apply).not.toHaveBeenCalled();
  });

  it('applies accepted codes in order through apply', async () => {
    const codes = fake();
    const { result } = renderSale(codes);
    await act(async () => {
      expect(await result.current.applyCoupon('a')).toBeNull();
      expect(await result.current.applyCoupon('b')).toBeNull();
    });
    const [builder, state] = codes.apply.mock.calls[1];
    expect(builder.setCoupons).toEqual(expect.any(Function));
    expect([...state.accepted]).toEqual([['a', { label: 'a' }], ['b', { label: 'b' }]]);
  });

  it('refuses with COUPONS_UNSUPPORTED when the implementation does not support the store', async () => {
    const codes = fake();
    codes.supports.mockReturnValue(false);
    const { result } = renderSale(codes);
    await act(async () => { expect(await result.current.applyCoupon('x')).toBe(COUPONS_UNSUPPORTED); });
    expect(codes.find).not.toHaveBeenCalled();
    expect(codes.supports).toHaveBeenCalledWith({ capabilities: { orderCreate: 6, coupons: true }, rounding });
  });

  it('returns the apply error and keeps the code off the sale', async () => {
    const codes = fake();
    codes.apply.mockImplementationOnce(() => { throw new Error('No room'); });
    const { result } = renderSale(codes);
    await act(async () => {
      expect(await result.current.applyCoupon('a')).toBe('No room');
      expect(await result.current.applyCoupon('b')).toBeNull();
    });
    expect([...codes.apply.mock.calls[1][1].accepted.keys()]).toEqual(['b']);
  });

  it('removes a code through apply with the remaining codes', async () => {
    const codes = fake();
    const { result } = renderSale(codes);
    await act(async () => {
      expect(await result.current.applyCoupon('a')).toBeNull();
      expect(await result.current.applyCoupon('b')).toBeNull();
    });
    act(() => { expect(result.current.removeCoupon('A')).toBeNull(); });
    expect([...codes.apply.mock.lastCall![1].accepted.keys()]).toEqual(['b']);
  });

  it('refuses a code whose sale was replaced while find was pending', async () => {
    const codes = fake();
    let resolve!: (value: { found: { label: string } }) => void;
    codes.find.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { result } = renderSale(codes);
    let applying!: Promise<string | null>;
    act(() => { applying = result.current.applyCoupon('x'); });
    act(() => result.current.newSale());
    await act(async () => {
      resolve({ found: { label: 'x' } });
      expect(await applying).toBe('The sale changed while the coupon was being checked; apply it again');
    });
    expect(codes.apply).not.toHaveBeenCalled();
  });
});
