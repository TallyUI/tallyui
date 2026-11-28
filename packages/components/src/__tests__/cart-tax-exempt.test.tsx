import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { formatMoney, type ServerCapabilities, type StoreSettings } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { Cart } from '../sale/cart';
import { click, SaleHarness, sale } from './sale-harness';

const settings: StoreSettings = { currency: 'EUR', pricesIncludeTax: false,
  taxRatesPpm: { default: 190000, standard: 190000 }, taxRateCodes: { standard: 'standard' },
  taxRounding: { granularity: 'per_line_items', mode: 'half_up' } };
const capabilities = { orderCreate: 12, taxExempt: true };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' })!;

afterEach(cleanup);

function seed(caps: ServerCapabilities = capabilities, store = settings, taxDisplay: 'itemized' | 'single' = 'itemized') {
  const tree = (currentCaps: ServerCapabilities) => <><SaleHarness settings={store} capabilities={currentCaps}>
    {(sale) => <Cart sale={sale} checkout={{ onCheckout: vi.fn() }} noteSheet={{}} taxDisplay={taxDisplay} />}
  </SaleHarness><PortalHost /></>;
  const { rerender } = render(tree(caps));
  // One €10.00 item = 1000 minor units before tax.
  act(() => { sale.addCustomLine({ name: 'Item', priceMinor: 1000, taxClass: 'standard' }); });
  return (nextCaps: ServerCapabilities) => rerender(tree(nextCaps));
}

function openDetails() {
  click('More actions');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Order details' }));
  return within(screen.getByTestId('order-note-sheet'));
}

const toggle = () => fireEvent.click(screen.getByRole('switch', { name: 'Tax exempt' }));

function refuseAfterPayment() {
  seed();
  // €5.00 cash = 500 minor units toward the taxed order.
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 500 })).not.toBeNull(); });
  const sheet = openDetails();
  toggle();
  return sheet;
}

it('S1 offers the unchecked Tax exempt switch and explains what it removes', { timeout: 20_000 }, () => {
  seed();
  const sheet = openDetails();
  expect(sheet.getByRole('switch', { name: 'Tax exempt', checked: false })).toBe(sheet.getByTestId('order-tax-exempt-switch'));
  expect(sheet.getByText('Removes all tax from this order, including fees and shipping.')).toBeTruthy();
});

it('S2 turning exemption on replaces all itemized tax rows', { timeout: 20_000 }, () => {
  seed(); openDetails(); toggle();
  expect(sale.taxExempt).toBe(true);
  // Exempt tax = 1000 × 0% = 0; total = 1000 + 0 = 1000.
  expect(sale.order.totalMinor).toBe(1000);
  expect(screen.getByTestId('cart-checkout').textContent).toBe(`Checkout ${money(1000)}`);
  expect(screen.getAllByTestId(/^cart-total-tax-/)).toHaveLength(1);
  const row = within(screen.getByTestId('cart-total-tax-0'));
  expect(row.getByText('Tax exempt')).toBeTruthy();
  expect(row.getByText(money(0))).toBeTruthy();
  expect(screen.queryByText('Tax 19%')).toBeNull();
  expect(screen.queryByText('Excluding tax')).toBeNull();
});

it('S3 turning exemption off restores the itemized tax and taxed total', { timeout: 20_000 }, () => {
  seed(); openDetails(); toggle(); toggle();
  // Tax = 1000 × 19% = 190; total = 1000 + 190 = 1190.
  expect(sale.order.totalMinor).toBe(1190);
  const footer = within(screen.getByTestId('cart-footer'));
  const row = within(footer.getByTestId('cart-total-tax-0'));
  expect(row.getByText('Tax 19%')).toBeTruthy();
  expect(row.getByText(money(190))).toBeTruthy();
  expect(footer.queryByText('Tax exempt')).toBeNull();
  expect(footer.getByText('Excluding tax')).toBeTruthy();
});

it('S4 replaces Total Tax with the exemption in single display mode', { timeout: 20_000 }, () => {
  seed(capabilities, settings, 'single'); openDetails(); toggle();
  expect(screen.getAllByTestId(/^cart-total-tax-/)).toHaveLength(1);
  const row = within(screen.getByTestId('cart-total-tax-0'));
  expect(row.getByText('Tax exempt')).toBeTruthy();
  // Single exempt tax = 1000 × 0% = 0.
  expect(row.getByText(money(0))).toBeTruthy();
  expect(screen.queryByText('Total Tax')).toBeNull();
  expect(screen.queryByText('Excluding tax')).toBeNull();
});

it('S5 hides the switch without the taxExempt capability', { timeout: 20_000 }, () => {
  seed({ orderCreate: 12 });
  expect(openDetails().queryByTestId('order-tax-exempt-switch')).toBeNull();
});

it('S6 hides the switch when store prices include tax', { timeout: 20_000 }, () => {
  seed(capabilities, { ...settings, pricesIncludeTax: true });
  expect(openDetails().queryByTestId('order-tax-exempt-switch')).toBeNull();
});

it('S7 shows the payment refusal and keeps the switch off', { timeout: 20_000 }, () => {
  const sheet = refuseAfterPayment();
  expect(sale.taxExempt).toBe(false);
  expect(sheet.getByRole('switch', { name: 'Tax exempt', checked: false })).toBeTruthy();
  const alert = sheet.getByRole('alert');
  expect(alert).toBe(sheet.getByTestId('order-tax-exempt-error'));
  expect(alert.textContent).toBe('Tax exemption can only be turned on before a payment is taken.');
});

it('S8 clears the refusal when Order details is reopened', { timeout: 20_000 }, () => {
  const sheet = refuseAfterPayment();
  expect(sheet.getByTestId('order-tax-exempt-error')).toBeTruthy();
  fireEvent.click(sheet.getByTestId('order-note-close'));
  expect(openDetails().queryByRole('alert')).toBeNull();
});

it('S10 allows exemption after the refused cash leg is voided', { timeout: 20_000 }, () => {
  const sheet = refuseAfterPayment();
  expect(sheet.getByTestId('order-tax-exempt-error')).toBeTruthy();
  act(() => { expect(sale.voidTender(sale.order.payments[0].id)).toBe(true); });
  toggle();
  expect(sheet.queryByTestId('order-tax-exempt-error')).toBeNull();
  expect(sale.taxExempt).toBe(true);
  expect(sale.order.totalMinor).toBe(1000);
});

it('S11 restores the taxed total and footer tax after a partial cash payment', { timeout: 20_000 }, () => {
  seed(); openDetails(); toggle();
  expect(sale.taxExempt).toBe(true);
  expect(sale.order.totalMinor).toBe(1000);
  act(() => { expect(sale.addTender({ method: 'cash', amountMinor: 500 })).not.toBeNull(); });
  toggle();
  expect(sale.taxExempt).toBe(false);
  expect(sale.order.totalMinor).toBe(1190);
  const footer = within(screen.getByTestId('cart-footer'));
  const row = within(footer.getByTestId('cart-total-tax-0'));
  expect(row.getByText('Tax 19%')).toBeTruthy();
  expect(row.getByText(money(190))).toBeTruthy();
});

it('S12 lets the cashier turn exemption off after the capability is removed', { timeout: 20_000 }, () => {
  const rerender = seed();
  const sheet = openDetails();
  toggle();
  expect(sale.order.totalMinor).toBe(1000);
  fireEvent.click(sheet.getByTestId('order-note-close'));
  rerender({ orderCreate: 12 });
  expect(sale.taxExempt).toBe(true);
  expect(openDetails().getByRole('switch', { name: 'Tax exempt', checked: true })).toBeTruthy();
  toggle();
  expect(sale.taxExempt).toBe(false);
  expect(sale.order.totalMinor).toBe(1190);
});
