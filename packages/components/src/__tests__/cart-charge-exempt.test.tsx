import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import { Cart } from '../sale/cart';
import { click, SaleHarness, sale } from './sale-harness';

const settings: StoreSettings = { currency: 'EUR', pricesIncludeTax: false,
  taxRatesPpm: { default: 190000, standard: 190000, fee: 210000, post: 77000 },
  taxRateCodes: { standard: 'standard', fee: 'fee', post: 'post' },
  taxRounding: { granularity: 'per_line_items', mode: 'half_up' } };
const capabilities = { orderCreate: 12, taxExempt: true };

afterEach(cleanup);

function seed() {
  render(<SaleHarness settings={settings} capabilities={capabilities}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
  act(() => {
    sale.addCustomLine({ name: 'Item', priceMinor: 1000, taxClass: 'standard' });
    sale.addFee({ name: 'Bag', amountMinor: 1000, amountIncludesTax: true, taxClass: 'fee' });
    sale.addShipping({ name: 'Post', amountMinor: 999, amountIncludesTax: true, taxClass: 'post' });
  });
}

function edit(name: string) {
  click(`Edit total of ${name}`);
  click(`Edit ${name}`);
  return within(screen.getByRole('group', { name: `Edit ${name}` }));
}

function rename(name: string, value: string) {
  fireEvent.change(edit(name).getByRole('textbox', { name: 'Name' }), { target: { value } });
  click('Save');
}

it('C1 restores the entered gross of both renamed exempt charges', { timeout: 20_000 }, () => {
  seed();
  act(() => { expect(sale.setTaxExempt(true)).toBe(true); });
  rename('Bag', 'Tote');
  rename('Post', 'Courier');
  act(() => { expect(sale.setTaxExempt(false)).toBe(true); });
  // Item 1000 × 1.19 + entered fee 1000 + entered shipping 999 = 3189.
  expect(sale.order.totalMinor).toBe(3189);
  expect(sale.order.fees).toMatchObject([{ name: 'Tote', amountMinor: 1000, amountIncludesTax: true }]);
  expect(sale.order.shipping).toMatchObject([{ name: 'Courier', amountMinor: 999, amountIncludesTax: true }]);
});

it('C2 closes an untouched exempt fee without updating it', () => {
  seed();
  const fees = sale.order.fees;
  act(() => { expect(sale.setTaxExempt(true)).toBe(true); });
  edit('Bag');
  const updateFee = vi.spyOn(sale, 'updateFee');
  click('Save');
  expect(updateFee).not.toHaveBeenCalled();
  expect(screen.queryByRole('group', { name: 'Edit Bag' })).toBeNull();
  act(() => { expect(sale.setTaxExempt(false)).toBe(true); });
  // Item 1190 + untouched fee 1000 + shipping 999 = 3189.
  expect(sale.order.totalMinor).toBe(3189);
  expect(sale.order.fees).toEqual(fees);
});

it('C3 re-prices the edited exempt fee in the form’s tax mode', () => {
  seed();
  act(() => { expect(sale.setTaxExempt(true)).toBe(true); });
  fireEvent.change(edit('Bag').getByRole('textbox', { name: 'Amount' }), { target: { value: '9.00' } });
  click('Save');
  act(() => { expect(sale.setTaxExempt(false)).toBe(true); });
  // The form shows a net price: item 1190 + fee 900 × 1.21 + shipping 999 = 3278.
  expect(sale.order.totalMinor).toBe(3278);
  expect(sale.order.fees).toMatchObject([{ amountMinor: 900 }]);
  expect(sale.order.shipping).toMatchObject([{ amountMinor: 999, amountIncludesTax: true }]);
});

it('C4 uses the exempt fee’s displayed amount as gross when the switch is flipped', () => {
  seed();
  act(() => { expect(sale.setTaxExempt(true)).toBe(true); });
  fireEvent.click(edit('Bag').getByRole('switch', { name: 'Amount Includes Tax' }));
  click('Save');
  act(() => { expect(sale.setTaxExempt(false)).toBe(true); });
  // The displayed round(1000 / 1.21) = 826 becomes gross: 1190 + 826 + 999 = 3015.
  expect(sale.order.totalMinor).toBe(3015);
  expect(sale.order.fees).toMatchObject([{ amountMinor: 826, amountIncludesTax: true }]);
});

it('C5 renames both taxed charges without changing the total', { timeout: 20_000 }, () => {
  seed();
  rename('Bag', 'Tote');
  rename('Post', 'Courier');
  // Item 1190 + fee 1000 + shipping 999 = 3189.
  expect(sale.order.totalMinor).toBe(3189);
  expect(sale.order.fees).toMatchObject([{ name: 'Tote' }]);
  expect(sale.order.shipping).toMatchObject([{ name: 'Courier' }]);
});

it('C6 changes the taxed fee’s entered amount', () => {
  seed();
  fireEvent.change(edit('Bag').getByRole('textbox', { name: 'Amount' }), { target: { value: '12.00' } });
  click('Save');
  // Item 1190 + edited gross fee 1200 + shipping 999 = 3389.
  expect(sale.order.totalMinor).toBe(3389);
  expect(sale.order.fees).toMatchObject([{ amountMinor: 1200 }]);
});

it('C7 renames a percent fee without sending the form’s placeholder price', () => {
  seed();
  act(() => { sale.addFee({ name: 'Service', amountMinor: 0, percent: 10, taxClass: 'fee' }); });
  const fee = sale.order.fees!.find((charge) => charge.name === 'Service')!;
  // 10% of the net item price of 1000 = 100, excluding the other charges.
  expect(fee.amountMinor).toBe(100);
  const updateFee = vi.spyOn(sale, 'updateFee');
  rename('Service', 'Handling');
  expect(updateFee.mock.calls).toStrictEqual([[fee.id, { name: 'Handling' }]]);
  expect(sale.order.fees!.find((charge) => charge.id === fee.id)).toMatchObject({
    name: 'Handling', percent: 10, amountMinor: fee.amountMinor,
  });
});
