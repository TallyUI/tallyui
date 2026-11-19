import { describe, expect, it } from 'vitest';
import type { Customer, CustomerAddress } from '@tallyui/core';
import { shipsToBilling, toCustomerInput, toCustomerPatch, type CustomerEditValues } from './customer-patch';

const values = (over: Partial<CustomerEditValues> = {}): CustomerEditValues => ({ firstName: '', lastName: '', email: '', phone: '', ...over });
const customer = (over: Partial<Customer> = {}): Customer => ({ id: 'c1', name: 'x', ...over });

describe('shipsToBilling', () => {
  const billing: CustomerAddress = { firstName: 'Ann', city: 'York' };

  it('S1: an absent or empty shipping follows billing', () => {
    expect(shipsToBilling(undefined, billing)).toBe(true);
    expect(shipsToBilling({}, billing)).toBe(true);
    expect(shipsToBilling({ city: '' }, billing)).toBe(true);
  });

  it("S2: billing's copy follows billing, email not compared", () => {
    expect(shipsToBilling({ firstName: 'Ann', city: 'York' }, { ...billing, email: 'a@x.io' })).toBe(true);
  });

  it('S3: an own shipping does not follow billing', () => {
    expect(shipsToBilling({ city: 'Leeds' }, { city: 'York' })).toBe(false);
  });
});

describe('toCustomerInput', () => {
  const ann = { firstName: 'Ann', lastName: 'Lee', email: 'a@x.io' };

  it('I1: billing is filled from the top level and a linked shipping is its copy without email', () => {
    expect(toCustomerInput(values({ ...ann, billing: { city: 'York' } }))).toEqual({
      email: 'a@x.io', firstName: 'Ann', lastName: 'Lee',
      billing: { firstName: 'Ann', lastName: 'Lee', email: 'a@x.io', city: 'York' },
      shipping: { firstName: 'Ann', lastName: 'Lee', city: 'York' },
    });
  });

  it("I2: billing's own first name is kept", () => {
    const input = toCustomerInput(values({ ...ann, billing: { firstName: 'Annie', city: 'York' } }));
    expect(input.billing).toEqual({ firstName: 'Annie', lastName: 'Lee', email: 'a@x.io', city: 'York' });
  });

  it('I3: an own shipping is kept', () => {
    const input = toCustomerInput(values({ ...ann, billing: { city: 'York' }, shipping: { city: 'Leeds' } }));
    expect(input.shipping).toEqual({ city: 'Leeds' });
  });

  it('I4: email only sends email and a billing email, no empty fields', () => {
    expect(toCustomerInput(values({ email: 'a@x.io', phone: '' }))).toEqual({ email: 'a@x.io', billing: { email: 'a@x.io' } });
  });
});

describe('toCustomerPatch', () => {
  const york: CustomerAddress = { firstName: 'Ann', email: 'a@x.io', city: 'York' };
  const yorkShipping: CustomerAddress = { firstName: 'Ann', city: 'York' };

  it('E1: no change is an empty patch', () => {
    const billing = { firstName: 'Ann', city: 'York' };
    const before = customer({ billing, shipping: { ...billing } });
    expect(toCustomerPatch(before, values({ billing: { ...billing }, shipping: { ...billing } }))).toEqual({});
  });

  it('E2: only the changed phone is sent', () => {
    expect(toCustomerPatch(customer(), values({ phone: '0123' }))).toEqual({ phone: '0123' });
  });

  it("E3: clearing a field sends ''", () => {
    expect(toCustomerPatch(customer({ lastName: 'Lee' }), values())).toEqual({ lastName: '' });
  });

  it("E4: an absent company equals ''", () => {
    expect(toCustomerPatch(customer(), values({ company: '' }))).toEqual({});
  });

  it("E5: a changed billing is sent whole and a linked shipping as billing's copy", () => {
    const before = customer({ firstName: 'Ann', email: 'a@x.io', billing: york, shipping: yorkShipping });
    const patch = toCustomerPatch(before, values({ firstName: 'Ann', email: 'a@x.io', billing: { ...york, city: 'Hull' } }));
    expect(patch).toEqual({
      billing: { firstName: 'Ann', email: 'a@x.io', city: 'Hull' },
      shipping: { firstName: 'Ann', city: 'Hull' },
    });
  });

  it('E6: an own shipping that did not change is not sent', () => {
    const before = customer({ firstName: 'Ann', email: 'a@x.io', billing: york, shipping: { city: 'Leeds' } });
    const patch = toCustomerPatch(before, values({
      firstName: 'Ann', email: 'a@x.io', billing: { ...york, city: 'Hull' }, shipping: { city: 'Leeds' },
    }));
    expect(patch).toEqual({ billing: { firstName: 'Ann', email: 'a@x.io', city: 'Hull' } });
  });

  it('E7: an unchanged top level fills nothing', () => {
    const before = customer({ firstName: 'Ann', billing: { city: 'York' }, shipping: {} });
    expect(toCustomerPatch(before, values({ firstName: 'Ann', billing: { city: 'York' }, shipping: {} }))).toEqual({});
  });

  it('E8: a billing name that followed the old one follows the new one, and so does a linked shipping', () => {
    const before = customer({ firstName: 'Jo', billing: { firstName: 'Jo', city: 'York' }, shipping: { firstName: 'Jo', city: 'York' } });
    const patch = toCustomerPatch(before, values({ firstName: 'Joe', billing: { firstName: 'Jo', city: 'York' } }));
    expect(patch).toEqual({
      firstName: 'Joe',
      billing: { firstName: 'Joe', city: 'York' },
      shipping: { firstName: 'Joe', city: 'York' },
    });
  });

  it("E9: billing's own name is not overwritten", () => {
    const billing = { firstName: 'Joanna', city: 'York' };
    const before = customer({ firstName: 'Jo', billing, shipping: { ...billing } });
    expect(toCustomerPatch(before, values({ firstName: 'Joe', billing: { ...billing } }))).toEqual({ firstName: 'Joe' });
  });

  it("E10: linking an own shipping sends billing's copy", () => {
    const before = customer({ firstName: 'Ann', email: 'a@x.io', billing: york, shipping: { city: 'Leeds' } });
    const patch = toCustomerPatch(before, values({ firstName: 'Ann', email: 'a@x.io', billing: { ...york } }));
    expect(patch).toEqual({ shipping: { firstName: 'Ann', city: 'York' } });
  });

  it('E11: a changed own shipping is sent whole, cleaned', () => {
    const before = customer({ billing: { city: 'York' }, shipping: { city: 'Leeds', postcode: '' } });
    const patch = toCustomerPatch(before, values({ billing: { city: 'York' }, shipping: { city: 'Bath', postcode: '' } }));
    expect(patch).toEqual({ shipping: { city: 'Bath' } });
  });

  it('E12: the sent billing has no empty parts', () => {
    const before = customer({ billing: { city: 'York', address2: '' }, shipping: { city: 'Leeds' } });
    const patch = toCustomerPatch(before, values({ billing: { city: 'Hull', address2: '' }, shipping: { city: 'Leeds' } }));
    expect(patch.billing).toEqual({ city: 'Hull' });
    expect(patch.billing).not.toHaveProperty('address2');
  });

  it('E13: an emptied billing is sent as {}', () => {
    const before = customer({ billing: { city: 'York' }, shipping: { city: 'Leeds' } });
    expect(toCustomerPatch(before, values({ billing: { city: '' }, shipping: { city: 'Leeds' } }))).toEqual({ billing: {} });
  });
});
