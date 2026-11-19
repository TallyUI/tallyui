import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import { AddressEditor, type AddressEditorProps, type AddressEditorValue } from '../customer/address-editor';

afterEach(() => cleanup());

type Extra = Omit<Partial<AddressEditorProps>, 'value' | 'onChange'>;
const type = (label: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
const press = (testID: string) => fireEvent.click(screen.getByTestId(testID));
const ids = (pattern: RegExp) => screen.queryAllByTestId(pattern).map((node) => node.getAttribute('data-testid'));
const last = (spy: Mock) => spy.mock.calls.at(-1)?.[0];

function Harness({ initial, onChange, ...props }: { initial: AddressEditorValue; onChange: Mock } & Extra) {
  const [value, setValue] = useState(initial);
  return <><AddressEditor {...props} value={value} onChange={(next) => { onChange(next); setValue(next); }} /><PortalHost /></>;
}
function mount(initial: AddressEditorValue, props: Extra = {}) {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} {...props} />);
  return onChange;
}

const BILLING = { firstName: 'Ada', address1: '1 High St', city: 'Leeds', postcode: 'LS1', country: 'GB', email: 'a@b.co' };

describe('AddressEditor', { timeout: 20_000 }, () => {
  it('E1 billing is an add button that starts the address in defaultCountry and opens its parts', () => {
    const onChange = mount({}, { defaultCountry: 'GB' });
    expect(screen.getByTestId('address-editor-billing-add').textContent).toBe('Add Billing Address');
    expect(ids(/^address-editor-billing-address1$/)).toStrictEqual([]);
    press('address-editor-billing-add');
    expect(last(onChange)).toStrictEqual({ billing: { country: 'GB' } });
    expect(screen.getByTestId('address-editor-billing-address1')).toBeTruthy();
    expect(screen.queryByTestId('address-editor-billing-add')).toBeNull();
    cleanup();
    const plain = mount({});
    press('address-editor-billing-add');
    expect(last(plain)).toStrictEqual({ billing: {} });
    expect(screen.getByTestId('address-editor-billing-address1')).toBeTruthy();
  });

  it('E2 the summary joins the set parts with ", " in order, else the name', () => {
    mount({ billing: { address2: 'Flat 2', country: 'GB', city: 'Leeds', address1: '1 High St', state: 'West Yorks', postcode: 'LS1', firstName: 'Ada' } });
    expect(screen.getByTestId('address-editor-billing-summary').textContent).toBe('1 High St, Flat 2, Leeds, West Yorks, LS1, GB');
    cleanup();
    mount({ billing: { firstName: 'Ada', lastName: 'Lovelace', company: 'Engines' } });
    expect(screen.getByTestId('address-editor-billing-summary').textContent).toBe('Ada Lovelace');
    cleanup();
    mount({ billing: { company: 'Engines' } });
    expect(screen.getByTestId('address-editor-billing-summary').textContent).toBe('Engines');
  });

  it('E3 Edit toggles the parts; Remove clears billing and keeps shipping', () => {
    const shipping = { address1: '9 Low Rd', city: 'York' };
    const onChange = mount({ billing: BILLING, shipping });
    expect(screen.queryByTestId('address-editor-billing-address1')).toBeNull();
    press('address-editor-billing-edit');
    expect(screen.getByTestId('address-editor-billing-address1')).toBeTruthy();
    press('address-editor-billing-edit');
    expect(screen.queryByTestId('address-editor-billing-address1')).toBeNull();
    press('address-editor-billing-edit');
    press('address-editor-billing-remove');
    expect(last(onChange)).toStrictEqual({ billing: undefined, shipping });
    expect(screen.queryByTestId('address-editor-billing-address1')).toBeNull();
    expect(screen.getByTestId('address-editor-billing-add')).toBeTruthy();
  });

  it('E4 a billing part writes the merged billing, and billing has Email', () => {
    const onChange = mount({ billing: BILLING });
    press('address-editor-billing-edit');
    expect(screen.getByTestId('address-editor-billing-email')).toBeTruthy();
    type('City', 'York');
    expect(last(onChange)).toStrictEqual({ billing: { ...BILLING, city: 'York' } });
    type('Email', 'z@y.co');
    expect(last(onChange)).toStrictEqual({ billing: { ...BILLING, city: 'York', email: 'z@y.co' } });
  });

  it('E5 with billing, shipping is Same as billing until a different address copies billing without email', () => {
    const onChange = mount({ billing: BILLING });
    expect(screen.getByTestId('address-editor-shipping-linked').textContent).toBe('Same as billing');
    expect(screen.queryByTestId('address-editor-shipping-add')).toBeNull();
    press('address-editor-shipping-different');
    const { email: _email, ...own } = BILLING;
    expect(last(onChange)).toStrictEqual({ billing: BILLING, shipping: own });
    expect(screen.getByTestId('address-editor-shipping-fields-address1')).toHaveProperty('value', '1 High St');
  });

  it('E6 without billing, shipping has its own add button, and then a row with Remove and no Email', () => {
    const onChange = mount({}, { defaultCountry: 'AU' });
    expect(screen.getByTestId('address-editor-shipping-add').textContent).toBe('Add Shipping Address');
    press('address-editor-shipping-add');
    expect(last(onChange)).toStrictEqual({ shipping: { country: 'AU' } });
    cleanup();
    const shipping = { address1: '9 Low Rd', city: 'York' };
    const again = mount({ shipping });
    expect(screen.getByTestId('address-editor-shipping-summary').textContent).toBe('9 Low Rd, York');
    expect(screen.getByTestId('address-editor-billing-add')).toBeTruthy();
    press('address-editor-shipping-edit');
    expect(screen.getByTestId('address-editor-shipping-address1')).toHaveProperty('value', '9 Low Rd');
    expect(screen.queryByTestId('address-editor-shipping-email')).toBeNull();
    press('address-editor-shipping-remove');
    expect(last(again)).toStrictEqual({ shipping: undefined });
    expect(screen.getByTestId('address-editor-shipping-add')).toBeTruthy();
  });

  it('E7 testID prefixes every id', () => {
    mount({ billing: BILLING }, { testID: 'order-1' });
    press('order-1-billing-edit');
    const all = screen.queryAllByTestId(/./).map((node) => node.getAttribute('data-testid'));
    expect(all.length).toBeGreaterThan(5);
    expect(all.filter((id) => !id?.startsWith('order-1-'))).toStrictEqual([]);
    expect(screen.queryAllByTestId(/^address-editor-/)).toStrictEqual([]);
  });
});
