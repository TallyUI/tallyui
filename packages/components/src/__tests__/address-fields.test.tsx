import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import type { CustomerAddress } from '@tallyui/core';
import { AddressFields, ShippingAddressFields, type AddressFieldsProps } from '../customer/address-fields';
import { I18nProvider } from '../i18n';

afterEach(() => cleanup());

const COUNTRIES = [{ value: 'AU', label: 'Australia' }, { value: 'NZ', label: 'New Zealand' },
  { value: 'GB', label: 'United Kingdom' }, { value: 'XX', label: 'Testland' }];
const STATES: Record<string, { value: string; label: string }[]> = {
  AU: [{ value: 'VIC', label: 'Victoria' }, { value: 'NSW', label: 'New South Wales' }],
  NZ: [{ value: 'AUK', label: 'Auckland' }],
  XX: [{ value: 'VIC', label: 'Vic test' }],
};
const statesFor = (country: string) => STATES[country];
const PARTS = ['firstName', 'lastName', 'company', 'phone', 'address1', 'address2', 'city', 'postcode', 'country', 'state'];

const type = (label: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
const press = (testID: string) => fireEvent.click(screen.getByTestId(testID));
const ids = (pattern: RegExp) => screen.queryAllByTestId(pattern).map((node) => node.getAttribute('data-testid'));
const last = (spy: Mock) => spy.mock.calls.at(-1)?.[0];

function Harness({ initial, onChange, ...props }: { initial: CustomerAddress; onChange: Mock } & Omit<Partial<AddressFieldsProps>, 'value' | 'onChange'>) {
  const [value, setValue] = useState(initial);
  return <><AddressFields {...props} value={value} onChange={(next) => { onChange(next); setValue(next); }} /><PortalHost /></>;
}
function mount(initial: CustomerAddress, props: Omit<Partial<AddressFieldsProps>, 'value' | 'onChange'> = {}) {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} {...props} />);
  return onChange;
}

function Shipping({ billing, initial, onChange }: { billing?: CustomerAddress; initial?: CustomerAddress; onChange: Mock }) {
  const [value, setValue] = useState(initial);
  return <ShippingAddressFields billing={billing} value={value} onChange={(next) => { onChange(next); setValue(next); }} />;
}
const BILLING = { address1: '1 Main St', city: 'M', email: 'a@b.co' };
function ship(initial?: CustomerAddress, wrap: (children: ReactNode) => ReactNode = (children) => children) {
  const onChange = vi.fn();
  render(wrap(<Shipping billing={BILLING} initial={initial} onChange={onChange} />));
  return onChange;
}
const expectLinked = () => {
  expect(screen.getByTestId('shipping-address-linked').textContent).toBe('Same as billing');
  expect(screen.getByTestId('shipping-address-different').textContent).toBe('Use a different address');
  expect(ids(/^shipping-address-fields-/)).toStrictEqual([]);
};

describe('AddressFields', { timeout: 20_000 }, () => {
  it('F1 renders the parts in order, email after lastName with showEmail', () => {
    mount({});
    expect(ids(/^address-fields-/)).toStrictEqual(PARTS.map((part) => `address-fields-${part}`));
    cleanup();
    mount({}, { showEmail: true });
    expect(ids(/^address-fields-/)).toStrictEqual(['firstName', 'lastName', 'email', ...PARTS.slice(2)].map((part) => `address-fields-${part}`));
  });

  it('F2 every write is the whole next address', () => {
    const onChange = mount({ city: 'Melbourne' });
    type('City', 'Sydney');
    type('Address 1', '1 Main St');
    expect(last(onChange)).toStrictEqual({ city: 'Sydney', address1: '1 Main St' });
  });

  it('F3 an emptied part leaves the address', () => {
    const onChange = mount({ city: 'Melbourne', postcode: '3000' });
    type('City', '');
    expect(last(onChange)).toStrictEqual({ postcode: '3000' });
    expect('city' in last(onChange)).toBe(false);
  });

  it('F4 Country and State are text parts without options', () => {
    const onChange = mount({});
    expect(screen.getByRole('textbox', { name: 'State' })).toBeTruthy();
    type('Country', 'NZ');
    expect(last(onChange)).toStrictEqual({ country: 'NZ' });
    cleanup();
    mount({ country: 'GB' }, { statesFor });
    expect(screen.getByRole('textbox', { name: 'State' })).toBeTruthy();
  });

  it('F5 Country is a searchable picker with countries', () => {
    const onChange = mount({ country: 'NZ' }, { countries: COUNTRIES });
    expect(screen.getByTestId('address-fields-country').textContent).toBe('New Zealand');
    press('address-fields-country');
    fireEvent.change(screen.getByTestId('address-fields-country-search'), { target: { value: 'unit' } });
    expect(ids(/^address-fields-country-[A-Z]+$/)).toStrictEqual(['address-fields-country-GB']);
    press('address-fields-country-GB');
    expect(last(onChange)).toStrictEqual({ country: 'GB' });
  });

  it("F6 a country whose list lacks the state drops it", () => {
    const onChange = mount({ country: 'AU', state: 'VIC', city: 'M' }, { countries: COUNTRIES, statesFor });
    press('address-fields-country');
    press('address-fields-country-NZ');
    expect(last(onChange)).toStrictEqual({ country: 'NZ', city: 'M' });
  });

  it('F7 a country with no list, or a list with the state, keeps it', () => {
    const onChange = mount({ country: 'AU', state: 'VIC', city: 'M' }, { countries: COUNTRIES, statesFor });
    press('address-fields-country');
    press('address-fields-country-GB');
    expect(last(onChange)).toStrictEqual({ country: 'GB', state: 'VIC', city: 'M' });
    cleanup();
    const again = mount({ country: 'AU', state: 'VIC', city: 'M' }, { countries: COUNTRIES, statesFor });
    press('address-fields-country');
    press('address-fields-country-XX');
    expect(last(again)).toStrictEqual({ country: 'XX', state: 'VIC', city: 'M' });
  });

  it("F8 State is a picker over the country's list", () => {
    const onChange = mount({ country: 'AU' }, { statesFor });
    expect(screen.queryByRole('textbox', { name: 'State' })).toBeNull();
    press('address-fields-state');
    press('address-fields-state-NSW');
    expect(last(onChange)).toStrictEqual({ country: 'AU', state: 'NSW' });
  });

  it('F9 Email shows only with showEmail', () => {
    mount({});
    expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
    cleanup();
    const onChange = mount({}, { showEmail: true });
    type('Email', 'a@b.co');
    expect(last(onChange)).toStrictEqual({ email: 'a@b.co' });
  });
});

describe('ShippingAddressFields', { timeout: 20_000 }, () => {
  it('S1 is linked while shipping is absent', () => {
    ship();
    expectLinked();
  });

  it("S2 is linked while shipping is billing's copy without email, and own otherwise", () => {
    ship({ address1: '1 Main St', city: 'M' });
    expectLinked();
    cleanup();
    ship({ city: 'Perth' });
    expect(screen.getByRole('textbox', { name: 'City' })).toHaveProperty('value', 'Perth');
    expect(screen.getByTestId('shipping-address-same').textContent).toBe('Same as billing');
  });

  it("S3 Use a different address copies billing without email and keeps the parts open", () => {
    const onChange = ship();
    press('shipping-address-different');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(last(onChange)).toStrictEqual({ address1: '1 Main St', city: 'M' });
    expect(screen.getByRole('textbox', { name: 'Address 1' })).toHaveProperty('value', '1 Main St');
    expect(screen.getByRole('textbox', { name: 'City' })).toHaveProperty('value', 'M');
    expect(screen.queryByTestId('shipping-address-fields-email')).toBeNull();
    expect(screen.queryByTestId('shipping-address-linked')).toBeNull();
  });

  it('S4 Same as billing folds shipping back to undefined', () => {
    const onChange = ship();
    press('shipping-address-different');
    press('shipping-address-same');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(last(onChange)).toBeUndefined();
    expectLinked();
  });

  it("S5 reads the app's catalogue", () => {
    ship(undefined, (children) => <I18nProvider locale="fr" resources={{ fr: { 'pos_cart.same_as_billing': 'Comme la facturation' } }}>{children}</I18nProvider>);
    expect(screen.getByTestId('shipping-address-linked').textContent).toBe('Comme la facturation');
  });
});
