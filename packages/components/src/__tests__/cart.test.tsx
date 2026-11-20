import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { formatMoney } from '@tallyui/core';
import { SALE_SAVING, SPLIT_FIXED_DISCOUNT } from '@tallyui/pos';
import { PortalHost } from '@tallyui/primitives';
import { Cart } from '../sale/cart';
import { blue, click, discount, pricing, SaleHarness, sale, totals, traits } from './sale-harness';

// jsdom has no window size; the Cart sees a tablet so its Price column shows, unless a test sets a phone.
const tablet = { width: 1024, height: 768, scale: 1, fontScale: 1 };
let dimensions = tablet;
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  useWindowDimensions: () => dimensions,
}));

const money = (amount: number) => formatMoney({ amount, currency: 'EUR' })!;
// The line's Price action, not the Price column head.
const notHead = { ignore: '[role="columnheader"] *' };
// A cart line's row: the name's cell, then its row.
const row = (name: string) => screen.getByText(name).parentElement!.parentElement!;

afterEach(() => { cleanup(); dimensions = tablet; });

describe('Cart', () => {
  it.each([undefined, 1, 2, 3, 4])('hides Add charge below orderCreate 5 (%s)', (orderCreate) => {
    render(<SaleHarness capabilities={orderCreate === undefined ? undefined : { orderCreate }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    expect(screen.queryByRole('button', { name: 'Add charge' })).toBeNull();
    act(() => sale.add(blue, traits));
    expect(screen.queryByRole('button', { name: 'Add charge' })).toBeNull();
  });

  it.each([false, true])('adds each kind, shows display amounts and totals, and removes charges (inclusive: %s)', { timeout: 20_000 }, (inclusive) => {
    render(<SaleHarness settings={{ ...pricing, pricesIncludeTax: inclusive }} capabilities={{ orderCreate: 5 }}>
      {(sale) => <Cart sale={sale} />}</SaleHarness>);
    expect(screen.getByRole('button', { name: 'Add charge' })).toBeTruthy();
    act(() => sale.add(blue, traits));
    const before = totals(sale.order);
    for (const [kind, name, amount] of [['Fee', 'Bag', '1.20'], ['Shipping', 'Delivery', '2.40'], ['Custom item', 'Alteration', '3.60']]) {
      click('Add charge');
      click(kind);
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: name } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: amount } });
      click('Apply');
      expect(screen.queryByTestId('charge-form')).toBeNull();
    }
    expect(sale.order.fees).toMatchObject([{ name: 'Bag', amountMinor: 120 }]);
    expect(sale.order.shipping).toMatchObject([{ name: 'Delivery', amountMinor: 240 }]);
    expect(sale.order.lineItems[1]).toMatchObject({ name: 'Alteration', unitPriceMinor: 360, quantity: 1, custom: true });
    const fee = screen.getByTestId('cart-fee-0');
    const shipping = screen.getByTestId('cart-shipping-0');
    expect(within(fee).getByText('Bag')).toBeTruthy();
    expect(within(fee).getByTestId('cart-charge-price').textContent).toBe(money(sale.order.fees![0].amountMinor));
    expect(within(fee).getByTestId('cart-charge-total').textContent).toBe(money(sale.order.display.fees![0].amountMinor));
    expect(within(shipping).getByText('Delivery')).toBeTruthy();
    expect(within(shipping).getByTestId('cart-charge-price').textContent).toBe(money(sale.order.shipping![0].amountMinor));
    expect(within(shipping).getByTestId('cart-charge-total').textContent).toBe(money(sale.order.display.shipping![0].amountMinor));
    expect(within(row('Alteration')).getAllByText(money(360))).toHaveLength(2);
    expect(screen.getByText('Alteration').compareDocumentPosition(fee) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fee.compareDocumentPosition(shipping) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const footer = within(screen.getByTestId('cart-footer'));
    expect(within(footer.getByText('Subtotal').parentElement!).getByText(money(sale.order.display.subtotalMinor))).toBeTruthy();
    const taxRow = within(footer.getByTestId('cart-total-tax-0'));
    expect(taxRow.getByText('Tax 25%')).toBeTruthy();
    expect(taxRow.getByText(inclusive ? 'Including tax' : 'Excluding tax')).toBeTruthy();
    expect(taxRow.getByText(money(sale.order.display.taxMinor))).toBeTruthy();
    expect(within(footer.getByText('Total').parentElement!).getByText(money(sale.order.display.totalMinor))).toBeTruthy();
    expect(within(footer.getByTestId('cart-total-fees')).getByText(money(sale.order.display.fees![0].amountMinor))).toBeTruthy();
    expect(within(footer.getByTestId('cart-total-shipping')).getByText(money(sale.order.display.shipping![0].amountMinor))).toBeTruthy();
    click('Edit total of Bag');
    click('Remove Bag');
    expect(screen.queryByTestId('cart-fee-0')).toBeNull();
    expect(sale.order.fees ?? []).toEqual([]);
    expect(footer.queryByTestId('cart-total-fees')).toBeNull();
    click('Edit total of Delivery');
    click('Remove Delivery');
    expect(screen.queryByTestId('cart-shipping-0')).toBeNull();
    expect(sale.order.shipping ?? []).toEqual([]);
    expect(footer.queryByTestId('cart-total-shipping')).toBeNull();
    click('Remove Alteration');
    expect(totals(sale.order)).toEqual(before);
    expect(within(footer.getByText('Total').parentElement!).getByText(money(sale.order.display.totalMinor))).toBeTruthy();
  });

  it("draws each charge in the cart's columns, after the lines", () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    for (const [kind, name, amount] of [['Fee', 'Bag', '1.20'], ['Shipping', 'Delivery', '2.40']]) {
      click('Add charge');
      click(kind);
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: name } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: amount } });
      click('Apply');
    }
    const fee = screen.getByTestId('cart-fee-0');
    const shipping = screen.getByTestId('cart-shipping-0');
    for (const charge of [fee, shipping]) {
      const chargeRow = within(charge).getByTestId('cart-charge-line');
      expect(chargeRow.children).toHaveLength(screen.getAllByRole('columnheader').length);
      expect(chargeRow.firstElementChild!.textContent).toBe('');
    }
    expect(screen.getByText('Shirt').compareDocumentPosition(fee) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fee.compareDocumentPosition(shipping) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("edits a fee and a shipping charge from the row's strip", { timeout: 20_000 }, () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    for (const [kind, name, amount] of [['Fee', 'Bag', '1.20'], ['Shipping', 'Delivery', '2.40']]) {
      click('Add charge');
      click(kind);
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: name } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: amount } });
      click('Apply');
    }
    click('Edit total of Bag');
    click('Edit Bag');
    const feeForm = within(screen.getByRole('group', { name: 'Edit Bag' }));
    expect(feeForm.getByRole<HTMLInputElement>('textbox', { name: 'Name' }).value).toBe('Bag');
    expect(feeForm.getByRole<HTMLInputElement>('textbox', { name: 'Amount' }).value).toBe('1.20');
    fireEvent.change(feeForm.getByRole('textbox', { name: 'Amount' }), { target: { value: '2.00' } });
    click('Apply');
    expect(sale.order.fees).toMatchObject([{ name: 'Bag', amountMinor: 200 }]);
    expect(sale.order.shipping).toMatchObject([{ name: 'Delivery', amountMinor: 240 }]);
    expect(within(screen.getByTestId('cart-fee-0')).getByTestId('cart-charge-price').textContent).toBe(money(200));
    click('Edit total of Delivery');
    click('Edit Delivery');
    const shippingForm = within(screen.getByRole('group', { name: 'Edit Delivery' }));
    fireEvent.change(shippingForm.getByRole('textbox', { name: 'Name' }), { target: { value: 'Courier' } });
    fireEvent.change(shippingForm.getByRole('textbox', { name: 'Amount' }), { target: { value: '3.00' } });
    click('Apply');
    expect(sale.order.shipping).toMatchObject([{ name: 'Courier', amountMinor: 300 }]);
    expect(sale.order.fees).toMatchObject([{ name: 'Bag', amountMinor: 200 }]);
  });

  it("folds a charge's Price cell on a phone, as the heads do", () => {
    dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    click('Add charge');
    click('Fee');
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Bag' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: '1.20' } });
    click('Apply');
    expect(screen.queryByRole('columnheader', { name: 'Price' })).toBeNull();
    const fee = within(screen.getByTestId('cart-fee-0'));
    expect(fee.queryByTestId('cart-charge-price')).toBeNull();
    expect(fee.getByTestId('cart-charge-total')).toBeTruthy();
  });

  it('keeps only one charge, discount or price form open', () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} canEditPrice />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    click('Order discount');
    click('Add charge');
    expect(screen.queryByRole('group', { name: 'Order discount' })).toBeNull();
    fireEvent.click(screen.getByText('Price', notHead));
    expect(screen.queryByTestId('charge-form')).toBeNull();
    click('Add charge');
    expect(screen.queryByTestId('price-form')).toBeNull();
    fireEvent.click(screen.getByText('Discount'));
    expect(screen.queryByTestId('charge-form')).toBeNull();
    expect(screen.getAllByRole('group')).toHaveLength(1);
  });

  it.each(['Fee', 'Shipping', 'Custom item'])('passes tax choices through to %s', (kind) => {
    render(<SaleHarness capabilities={{ orderCreate: 5, lineTax: { none: true, classes: true } }}>
      {(sale) => <Cart sale={sale} taxClasses={[{ id: 'reduced', label: 'Reduced' }]} />}</SaleHarness>);
    click('Add charge');
    click(kind);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Extra' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: '1' } });
    click('Reduced');
    fireEvent.click(screen.getByRole('switch', { name: 'No tax' }));
    click('Apply');
    const charge = kind === 'Fee' ? sale.order.fees![0] : kind === 'Shipping' ? sale.order.shipping![0] : sale.order.lineItems[0];
    expect(charge).toMatchObject({ name: 'Extra', taxStatus: 'none', taxClass: 'reduced' });
    expect(sale.order.totalMinor).toBe(100);
  });

  it('uses the WooCommerce shipping-tax note and hides tax overrides', () => {
    render(<SaleHarness capabilities={{ orderCreate: 5, lineTax: { none: true, classes: true },
      taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false } }}>
      {(sale) => <Cart sale={sale} taxClasses={[{ id: 'reduced', label: 'Reduced' }]} />}</SaleHarness>);
    click('Add charge');
    click('Shipping');
    expect(screen.getByText("Shipping is taxed at the store's shipping tax class.")).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'No tax' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Tax class' })).toBeNull();
  });

  it('K1: at order.create 6 a WooCommerce store offers No tax on shipping, and sends it (#1115)', () => {
    render(<SaleHarness capabilities={{ orderCreate: 6, lineTax: { none: true, classes: true },
      taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false } }}>
      {(sale) => <Cart sale={sale} taxClasses={[{ id: 'reduced', label: 'Reduced' }]} />}</SaleHarness>);
    click('Add charge');
    click('Shipping');
    expect(screen.getByRole('switch', { name: 'No tax' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Tax class' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Delivery' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('switch', { name: 'No tax' }));
    click('Apply');
    expect(sale.order.shipping![0].taxStatus).toBe('none');
  });

  it.each([undefined, false])('hides Price without permission (%s)', (canEditPrice) => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} canEditPrice={canEditPrice} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.queryByText('Price', notHead)).toBeNull();
    expect(screen.queryByTestId('price-form')).toBeNull();
  });

  it('edits a line price with permission and reports the applied change for audit', () => {
    const onPriceChange = vi.fn();
    render(<SaleHarness>{(sale) => <Cart sale={sale} canEditPrice onPriceChange={onPriceChange} />}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    const lineId = sale.order.lineItems[0].id;
    fireEvent.click(screen.getByText('Discount'));
    fireEvent.click(screen.getByText('Price', notHead));
    expect(screen.queryByRole('group', { name: 'Discount on Shirt' })).toBeNull();
    expect(screen.getAllByRole('group')).toHaveLength(1);
    fireEvent.change(screen.getByTestId('price-input'), { target: { value: '10.00' } });
    fireEvent.change(screen.getByTestId('price-reason'), { target: { value: ' Damaged ' } });
    fireEvent.click(screen.getByTestId('price-apply'));
    expect(sale.order.lineItems[0].unitPriceMinor).toBe(1000);
    // A manual price below the regular price shows the regular price struck above it.
    expect(within(row('Shirt')).getByText(money(1000))).toBeTruthy();
    expect(screen.getByLabelText(`Regular price ${money(1250)}`)).toBeTruthy();
    expect(screen.getAllByText(money(2000))).toHaveLength(2);
    expect(onPriceChange).toHaveBeenCalledExactlyOnceWith({ lineId, fromMinor: 1250, toMinor: 1000, reason: 'Damaged' });
    expect(screen.queryByTestId('price-form')).toBeNull();
  });

  it("applies a line's quick-discount key through the price path, and draws no keys without the prop", () => {
    const onPriceChange = vi.fn();
    const { rerender } = render(<SaleHarness>{(sale) => <Cart sale={sale} canEditPrice />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    fireEvent.click(screen.getByText('Price', notHead));
    expect(screen.queryByTestId('price-quick-discounts')).toBeNull();
    rerender(<SaleHarness>{(sale) => <Cart sale={sale} canEditPrice quickDiscounts={[5, 10, 15]} onPriceChange={onPriceChange} />}</SaleHarness>);
    const lineId = sale.order.lineItems[0].id;
    fireEvent.click(screen.getByRole('button', { name: 'Discount (10%)' }));
    fireEvent.click(screen.getByTestId('price-apply'));
    expect(sale.order.lineItems[0].unitPriceMinor).toBe(1125);
    expect(onPriceChange).toHaveBeenCalledExactlyOnceWith({ lineId, fromMinor: 1250, toMinor: 1125, reason: undefined });
  });

  it('keeps the inline editors by default: no line popovers, and Price opens the inline form', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} canEditPrice />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.queryByRole('button', { name: 'Edit quantity of Shirt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit price of Shirt' })).toBeNull();
    fireEvent.click(screen.getByText('Price', notHead));
    expect(screen.getByTestId('price-form')).toBeTruthy();
  });

  it("lineEditor popover: the quantity keypad sets the quantity and the price one's quick key goes through the price path", () => {
    const onPriceChange = vi.fn();
    render(<><SaleHarness>{(sale) => <Cart sale={sale} canEditPrice lineEditor="popover" quickDiscounts={[5, 10, 15]}
      onPriceChange={onPriceChange} />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    const lineId = sale.order.lineItems[0].id;
    expect(screen.queryByText('Price', notHead)).toBeNull();
    click('Edit quantity of Shirt');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Quantity for Shirt' })).getByRole('button', { name: '3' }));
    click('Apply');
    expect(sale.order.lineItems[0].quantity).toBe(3);
    click('Edit price of Shirt');
    click('Discount (10%)');
    click('Apply');
    expect(sale.order.lineItems[0].unitPriceMinor).toBe(1125);
    expect(onPriceChange).toHaveBeenCalledExactlyOnceWith({ lineId, fromMinor: 1250, toMinor: 1125, reason: undefined });
  });

  it('lineEditor popover without canEditPrice: the quantity popover only, and no Price action', () => {
    render(<><SaleHarness>{(sale) => <Cart sale={sale} lineEditor="popover" />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    expect(screen.getByRole('button', { name: 'Edit quantity of Shirt' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit price of Shirt' })).toBeNull();
    expect(screen.queryByText('Price', notHead)).toBeNull();
  });

  // The web keyboard's Escape, and keys pressed on the open price keypad.
  const escape = () => act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
  const priceKeys = (...names: string[]) => names.forEach((name) =>
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Price for Shirt' })).getByRole('button', { name })));
  // The actions a line's open popover lists, by their accessible names.
  const popoverActions = (dialog: string) => within(screen.getByRole('dialog', { name: dialog })).getAllByRole('button')
    .map((button) => button.getAttribute('aria-label')).filter((name) => / Shirt$/.test(name ?? ''));

  it('lineEditor popover: the line is one row, and the quantity popover removes it', () => {
    render(<><SaleHarness>{(sale) => <Cart sale={sale} canEditPrice lineEditor="popover" />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    for (const name of ['Increase Shirt', 'Decrease Shirt', 'Remove Shirt']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByText('Discount')).toBeNull();
    click('Edit quantity of Shirt');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove Shirt' }));
    expect(sale.order.lineItems).toEqual([]);
  });

  it("lineEditor popover: the price popover's Discount opens the line's discount form, and its chip can be removed", () => {
    render(<><SaleHarness capabilities={{ orderCreate: 2 }}>{(sale) => <Cart sale={sale} canEditPrice lineEditor="popover" />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    click('Edit price of Shirt');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Price for Shirt' })).getByRole('button', { name: 'Discount Shirt' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Discount on Shirt' })).toBeTruthy();
    click('Percent');
    fireEvent.change(screen.getByRole('textbox', { name: 'Discount value' }), { target: { value: '10' } });
    click('Apply');
    expect(sale.order.lineItems[0].discounts).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Remove discount/ })).toBeTruthy();
  });

  it('lineEditor popover without canEditPrice: the quantity popover lists Discount and Remove, no Price', () => {
    render(<><SaleHarness>{(sale) => <Cart sale={sale} lineEditor="popover" />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    click('Edit quantity of Shirt');
    expect(popoverActions('Quantity for Shirt')).toEqual(['Discount Shirt', 'Remove Shirt']);
  });

  it('lineEditor popover on a phone: the quantity popover lists Discount, Price and Remove, and Price opens the price form', () => {
    dimensions = { ...tablet, width: 400, height: 800 };
    render(<><SaleHarness>{(sale) => <Cart sale={sale} canEditPrice lineEditor="popover" />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    click('Edit quantity of Shirt');
    expect(popoverActions('Quantity for Shirt')).toEqual(['Discount Shirt', 'Price Shirt', 'Remove Shirt']);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Price Shirt' }));
    expect(screen.getByTestId('price-form')).toBeTruthy();
  });

  it('lineCommit="close" opens the quantity keypad with steppers and no Remove action; the price popover draws Done, not Apply', () => {
    render(<><SaleHarness>{(sale) => <Cart sale={sale} canEditPrice lineEditor="popover" lineCommit="close" />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    click('Edit price of Shirt');
    expect(screen.getByTestId('price-popover-done')).toBeTruthy();
    expect(screen.queryByTestId('price-popover-apply')).toBeNull();
    escape();
    expect(screen.queryByRole('dialog')).toBeNull();
    click('Edit quantity of Shirt');
    expect(screen.queryByTestId('quantity-popover-action-remove')).toBeNull();
    fireEvent.click(screen.getByTestId('quantity-popover-step-up'));
    expect(sale.order.lineItems[0].quantity).toBe(2);
    fireEvent.click(screen.getByTestId('quantity-popover-step-down'));
    expect(sale.order.lineItems[0].quantity).toBe(1);
    fireEvent.click(screen.getByTestId('quantity-popover-remove'));
    expect(sale.order.lineItems).toEqual([]);
  });

  it('lineCommit="close": a price typed in the price popover is written on a press outside, and reported once', () => {
    const onPriceChange = vi.fn();
    render(<><SaleHarness>{(sale) => <Cart sale={sale} canEditPrice lineEditor="popover" lineCommit="close"
      onPriceChange={onPriceChange} />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    const lineId = sale.order.lineItems[0].id;
    click('Edit price of Shirt');
    priceKeys('1', '0');
    fireEvent.click(screen.getByTestId('price-popover-overlay'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sale.order.lineItems[0].unitPriceMinor).toBe(1000);
    expect(onPriceChange).toHaveBeenCalledExactlyOnceWith({ lineId, fromMinor: 1250, toMinor: 1000, reason: undefined });
  });

  it('lineCommit="close": a price refused on a press outside shows under the line until a later write goes through', () => {
    // The harness's real sale refuses only while saving, so Cart gets the sale with setUnitPrice wrapped to refuse.
    let refuse = true;
    render(<><SaleHarness>{(sale) => <Cart canEditPrice lineEditor="popover" lineCommit="close" sale={{ ...sale,
      setUnitPrice: (lineId, amountMinor) => (refuse ? SALE_SAVING : sale.setUnitPrice(lineId, amountMinor)) }} />}</SaleHarness>
      <PortalHost /></>);
    act(() => sale.add(blue, traits));
    click('Edit price of Shirt');
    priceKeys('9');
    fireEvent.click(screen.getByTestId('price-popover-overlay'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('cart-line-price-error').textContent).toBe(SALE_SAVING);
    expect(sale.order.lineItems[0].unitPriceMinor).toBe(1250);
    refuse = false;
    click('Edit price of Shirt');
    priceKeys('9');
    fireEvent.click(screen.getByTestId('price-popover-done'));
    expect(sale.order.lineItems[0].unitPriceMinor).toBe(900);
    expect(screen.queryByTestId('cart-line-price-error')).toBeNull();
  });

  it('without lineCommit, the price popover draws Apply and Cancel', () => {
    render(<><SaleHarness>{(sale) => <Cart sale={sale} canEditPrice lineEditor="popover" />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    click('Edit price of Shirt');
    expect(screen.getByTestId('price-popover-apply')).toBeTruthy();
    expect(screen.getByTestId('price-popover-cancel')).toBeTruthy();
    expect(screen.queryByTestId('price-popover-done')).toBeNull();
  });

  it('renders lines with their display amount, each discount chip with its own display amount, and the order chip with orderDiscountMinor', () => {
    render(<SaleHarness capabilities={{ orderCreate: 2 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    discount('Discount', 'Percent', '10');
    discount('Order discount', 'Amount', '0.50');
    // The line before its discounts (2 × €12.50 = €25.00): CartLine shows the display amount, not the net-after-discount.
    expect(screen.getByText('Shirt')).toBeTruthy();
    expect(within(row('Shirt')).getByText(money(1250))).toBeTruthy();
    expect(screen.queryByLabelText(/^Regular price/)).toBeNull();
    // The line's display amount (before its own discount) and the footer's Subtotal both read €25.00.
    expect(screen.getAllByText(money(2500))).toHaveLength(2);
    // The line's own 10% discount, shown by its own display amount (10% of €25.00).
    expect(screen.getByText(`10% −${money(250)}`)).toBeTruthy();
    // A single order discount's chip carries order.display.orderDiscountMinor.
    expect(screen.getByText(`Order discount −${money(50)}`)).toBeTruthy();
  });

  it('shows the column heads', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual(['Qty', 'Item', 'Price', 'Total']);
  });

  it('folds the Price head and price cells on a phone window, keeping Total', () => {
    dimensions = { ...tablet, width: 400, height: 800 };
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual(['Qty', 'Item', 'Total']);
    expect(within(row('Shirt')).getAllByText(money(1250))).toHaveLength(1);
  });

  it('folds the Price column when the cart lays out under 300 wide', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(within(row('Shirt')).getAllByText(money(1250))).toHaveLength(2);
    // react-native-web keeps a View's onLayout on its node (useElementLayout); jsdom has no ResizeObserver to call it.
    const wrapper = screen.getByRole('row').parentElement as HTMLElement & { __reactLayoutHandler: (event: unknown) => void };
    act(() => wrapper.__reactLayoutHandler({ nativeEvent: { layout: { x: 0, y: 0, width: 299, height: 600 } } }));
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual(['Qty', 'Item', 'Total']);
    expect(within(row('Shirt')).getAllByText(money(1250))).toHaveLength(1);
  });

  it("shows a line's attributes as rows", () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add({ ...blue, variant: { ...blue.variant, options: { Size: 'M' } } }, traits));
    expect(screen.getByText('Size: M')).toBeTruthy();
  });

  it('passes taxInclusive to CartTotal, and labels each tax row with taxLabel', () => {
    render(<SaleHarness settings={{ ...pricing, pricesIncludeTax: true }}>
      {(sale) => <Cart sale={sale} taxLabel={(ratePpm) => `VAT ${ratePpm / 10000}%`} />}
    </SaleHarness>);
    act(() => sale.add(blue, traits));
    const taxRow = within(screen.getByTestId('cart-total-tax-0'));
    expect(taxRow.getByText('VAT 25%')).toBeTruthy();
    expect(taxRow.getByText('Including tax')).toBeTruthy();
  });

  it('renders afterSubtotal inside the footer', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} afterSubtotal={<Text testID="cart-coupon-row">SAVE10</Text>} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(within(screen.getByTestId('cart-footer')).getByTestId('cart-coupon-row')).toBeTruthy();
  });

  it('defaults taxLabel to `Tax ${ratePpm / 10000}%`', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.getByText('Tax 25%')).toBeTruthy();
  });

  it('renders the order-discount section in afterItems only when the cart has lines', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    expect(screen.queryByRole('button', { name: 'Order discount' })).toBeNull();
    act(() => sale.add(blue, traits));
    expect(screen.getByRole('button', { name: 'Order discount' })).toBeTruthy();
  });

  it('shows Order discount and Add charge by default', () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.getByRole('button', { name: 'Order discount' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add charge' })).toBeTruthy();
  });

  it('leaves out Order discount and Add charge with orderActions false', () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} orderActions={false} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.queryByRole('button', { name: 'Order discount' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add charge' })).toBeNull();
  });

  it('still shows and removes an applied order discount with orderActions false', () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} orderActions={false} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => { sale.applyDiscount(null, { type: 'fixed', value: 50 }); });
    const chip = `Remove discount Order discount −${money(50)}`;
    expect(screen.getByRole('button', { name: chip })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Order discount' })).toBeNull();
    click(chip);
    expect(sale.order.discounts).toEqual([]);
    expect(screen.queryByRole('button', { name: chip })).toBeNull();
  });

  it('hides the order discount chips under the lines with orderDiscountChips false', () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} orderActions={false} orderDiscountChips={false} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => { sale.applyDiscount(null, { type: 'fixed', value: 50 }); });
    expect(screen.queryByRole('button', { name: `Remove discount Order discount −${money(50)}` })).toBeNull();
    expect(within(screen.getByTestId('cart-footer')).getByText(`−${money(50)}`)).toBeTruthy();
  });

  it("keeps each line's discount chips with orderDiscountChips false", () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} orderActions={false} orderDiscountChips={false} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => { sale.applyDiscount(sale.order.lineItems[0].id, { type: 'fixed', value: 50 }); });
    expect(screen.getByRole('button', { name: `Remove discount −${money(50)}` })).toBeTruthy();
  });

  it('keeps the Order discount button with orderDiscountChips false and orderActions true', () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} orderDiscountChips={false} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => { sale.applyDiscount(null, { type: 'fixed', value: 50 }); });
    expect(screen.getByRole('button', { name: 'Order discount' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: `Remove discount Order discount −${money(50)}` })).toBeNull();
  });

  it('lets afterSubtotal carry the order discount without a second Discount row', () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} orderActions={false} orderDiscountChips={false}
      afterSubtotal={<Text testID="order-discount-row">Discount</Text>} couponDiscountMinor={sale.order.display.orderDiscountMinor} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => { sale.applyDiscount(null, { type: 'fixed', value: 50 }); });
    const footer = within(screen.getByTestId('cart-footer'));
    expect(footer.getByTestId('order-discount-row')).toBeTruthy();
    expect(footer.queryByText(`−${money(50)}`)).toBeNull();
    expect(footer.getAllByText('Discount')).toHaveLength(1);
  });

  it("centres the empty cart's icon and line in the cart, as v2 does", () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    expect(screen.getByTestId('cart-empty-text').textContent).toBe('Tap a product to start a sale');
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../sale/cart.tsx'), 'utf8');
    expect(source).toContain('testID="cart-empty" className="flex-1 items-center justify-center gap-3 px-3 py-6"');
    expect(source).toContain('testID="cart-empty-text" className="text-center text-muted-foreground"');
  });

  it('has no Cash or Card terminal on an empty cart, and enabled ones once it has lines', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    expect(screen.queryByRole('button', { name: 'Cash' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Card terminal' })).toBeNull();
    act(() => sale.add(blue, traits));
    expect(screen.getByRole('button', { name: 'Cash' }).getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.getByRole('button', { name: 'Card terminal' }).getAttribute('aria-disabled')).not.toBe('true');
  });

  // Ported from medusapos/app `388495b1c` `tests/discount.test.tsx` (ADR-052, TV6a); the discount-engine
  // refusal logic ('The discount is more than the line/order') is already covered at the hook level by
  // pos/src/sale/use-sale.test.tsx's "a fixed discount larger than the line or the order is refused and
  // removed" (TV5) — this keeps the UI-only behaviour: the inline alert, no chip, and Cancel.
  // Several form round trips: past the 5 s default under a full suite on the shared host (medusapos's own note).
  it('refuses a fixed amount above the line, and above what the order has left', { timeout: 20_000 }, () => {
    render(<SaleHarness capabilities={{ orderCreate: 2 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    const plain = totals(sale.order);
    discount('Discount', 'Amount', '50');
    expect(within(screen.getByRole('group', { name: 'Discount on Shirt' })).getByRole('alert').textContent).toBe('The discount is more than the line');
    expect(totals(sale.order)).toEqual(plain);
    expect(sale.order.lineItems[0].discounts).toEqual([]);
    expect(screen.queryByRole('button', { name: /^Remove discount/ })).toBeNull();
    click('Cancel');
    discount('Order discount', 'Amount', '25');
    expect(sale.order.totalMinor).toBe(0);
    discount('Order discount', 'Amount', '1');
    expect(within(screen.getByRole('group', { name: 'Order discount' })).getByRole('alert').textContent).toBe('The discount is more than the order');
    expect(sale.order.discounts).toHaveLength(1);
  });

  it("gives the builder's totals for a line discount plus an order discount, and removing them restores the totals", { timeout: 20_000 }, () => {
    render(<SaleHarness capabilities={{ orderCreate: 2 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    const plain = totals(sale.order);
    discount('Discount', 'Percent', '10');
    discount('Order discount', 'Amount', '0.50');
    expect(sale.order.lineItems[0]).toMatchObject({ discountMinor: 300, orderDiscountMinor: 50, netMinor: 2200 });
    const footer = within(screen.getByTestId('cart-footer'));
    expect(footer.getByText('Discount')).toBeTruthy();
    expect(footer.getByText(`−${money(300)}`)).toBeTruthy();
    expect(screen.getByText(`10% −${money(250)}`)).toBeTruthy();
    expect(screen.getByText(`Order discount −${money(50)}`)).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull();
    click(`Remove discount 10% −${money(250)}`);
    click(`Remove discount Order discount −${money(50)}`);
    expect(totals(sale.order)).toEqual(plain);
    expect(footer.queryByText('Discount')).toBeNull();
  });

  it('shows invalid input inline and applies nothing', () => {
    render(<SaleHarness capabilities={{ orderCreate: 2 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    const before = sale.order;
    discount('Discount', 'Percent', '120');
    expect(screen.getByRole('alert').textContent).toBe('A percentage can be at most 100.');
    expect(sale.order).toBe(before);
    expect(screen.getByRole('group', { name: 'Discount on Shirt' })).toBeTruthy();
  });

  describe('couponDiscountMinor', () => {
    const capabilities = { orderCreate: 2 };
    const footer = () => within(screen.getByTestId('cart-footer'));
    const row = (label: string) => footer().getByText(label).parentElement!;
    const addAndDiscount = () => {
      act(() => sale.add(blue, traits));
      discount('Order discount', 'Amount', '5');
      expect(sale.order.display.discountMinor).toBeGreaterThan(100);
    };

    it('shows the whole discount without couponDiscountMinor', () => {
      render(<SaleHarness capabilities={capabilities}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
      addAndDiscount();
      expect(within(row('Discount')).getByText(`−${money(sale.order.display.discountMinor)}`)).toBeTruthy();
    });

    it('shows the discount less the itemised coupons', () => {
      const { rerender } = render(<SaleHarness capabilities={capabilities}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
      addAndDiscount();
      const subtotal = row('Subtotal').textContent;
      const total = row('Total').textContent;
      rerender(<SaleHarness capabilities={capabilities}>{(sale) => <Cart sale={sale} couponDiscountMinor={50} />}</SaleHarness>);
      expect(within(row('Discount')).getByText(`−${money(sale.order.display.discountMinor - 50)}`)).toBeTruthy();
      expect(row('Subtotal').textContent).toBe(subtotal);
      expect(row('Total').textContent).toBe(total);
    });

    it('hides the Discount row when the coupons are the whole discount', () => {
      render(<SaleHarness capabilities={capabilities}>{(sale) => <Cart sale={sale} couponDiscountMinor={sale.order.display.discountMinor} />}</SaleHarness>);
      addAndDiscount();
      expect(footer().queryByText('Discount')).toBeNull();
    });

    it('hides the Discount row when the coupons exceed it', () => {
      render(<SaleHarness capabilities={capabilities}>{(sale) => <Cart sale={sale} couponDiscountMinor={sale.order.display.discountMinor + 1} />}</SaleHarness>);
      addAndDiscount();
      expect(footer().queryByText('Discount')).toBeNull();
      expect(footer().queryByText(/^−/)).toBeNull();
    });
  });
});

describe('Cart checkout', () => {
  const checkoutButton = () => screen.getByRole('button', { name: /^Checkout / });

  it("noteSheet: Order details opens the sheet, typing sets the sale's note and the row shows it", () => {
    render(<><SaleHarness>{(sale) => <Cart sale={sale} noteSheet={{}}
      checkout={{ onCheckout: () => {}, actions: [{ label: 'Void', onPress: vi.fn(), destructive: true }] }} />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    expect(screen.queryByTestId('cart-note-row')).toBeNull();
    click('More actions');
    const menu = screen.getByRole('menu', { name: 'More actions' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Order details', 'Void']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Order details' }));
    expect(screen.getByTestId('order-note-sheet')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Customer note' }), { target: { value: 'Leave at door' } });
    expect(sale.order.note).toBe('Leave at door');
    fireEvent.click(screen.getByTestId('order-note-close'));
    expect(screen.queryByTestId('order-note-sheet')).toBeNull();
    expect(screen.getByTestId('cart-note-row').textContent).toBe('Leave at door');
  });

  it("noteSheet: the note row opens the sheet holding the note, under the platform's label", () => {
    render(<><SaleHarness>{(sale) => <Cart sale={sale} noteSheet={{ label: 'Order note' }}
      checkout={{ onCheckout: () => {} }} />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    act(() => sale.setNote('Gift wrap'));
    click('Edit note: Gift wrap');
    expect((screen.getByRole('textbox', { name: 'Order note' }) as HTMLTextAreaElement).value).toBe('Gift wrap');
  });

  it("without noteSheet the ⋮ has only the host's actions", () => {
    render(<><SaleHarness>{(sale) => <Cart sale={sale}
      checkout={{ onCheckout: () => {}, actions: [{ label: 'Void', onPress: vi.fn() }] }} />}</SaleHarness><PortalHost /></>);
    act(() => sale.add(blue, traits));
    click('More actions');
    const menu = screen.getByRole('menu', { name: 'More actions' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Void']);
  });

  it('keeps Cash and Card terminal, and no Checkout, without the prop', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.getByRole('button', { name: 'Cash' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Card terminal' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Checkout / })).toBeNull();
  });

  it('swaps Cash and Card terminal for Checkout and the total, which calls onCheckout', () => {
    const onCheckout = vi.fn();
    render(<SaleHarness>{(sale) => <Cart sale={sale} checkout={{ onCheckout }} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(checkoutButton().textContent).toBe(`Checkout ${money(sale.order.totalMinor)}`);
    expect(screen.queryByRole('button', { name: 'Cash' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Card terminal' })).toBeNull();
    fireEvent.click(checkoutButton());
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it('passes the checkout note to the foot for a non-empty sale', () => {
    const onCheckout = vi.fn();
    const onPress = vi.fn();
    render(<SaleHarness>{(sale) => <Cart sale={sale}
      checkout={{ onCheckout, note: { text: 'Leave at door', onPress } }} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.getByTestId('cart-note-row').textContent).toBe('Leave at door');
  });

  it("lists the host's actions in the ⋮ menu and calls the one pressed", () => {
    const onPark = vi.fn();
    const onVoid = vi.fn();
    render(<SaleHarness>{(sale) => <Cart sale={sale}
      checkout={{ onCheckout: () => {}, actions: [{ label: 'Park', onPress: onPark }, { label: 'Void', onPress: onVoid, destructive: true }] }} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.queryByRole('menu')).toBeNull();
    click('More actions');
    const menu = screen.getByRole('menu', { name: 'More actions' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Park', 'Void']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Void' }));
    expect(onVoid).toHaveBeenCalledTimes(1);
    expect(onPark).not.toHaveBeenCalled();
  });

  it('follows the sale: a changed line changes the label', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} checkout={{ onCheckout: () => {} }} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    const one = sale.order.totalMinor;
    expect(checkoutButton().textContent).toBe(`Checkout ${money(one)}`);
    click('Increase Shirt');
    expect(sale.order.totalMinor).not.toBe(one);
    expect(checkoutButton().textContent).toBe(`Checkout ${money(sale.order.totalMinor)}`);
  });
});

describe('Cart empty state (v2)', () => {
  const heads = () => screen.queryAllByRole('columnheader');
  const expectFull = () => {
    expect(heads().map((head) => head.textContent)).toEqual(['Qty', 'Item', 'Price', 'Total']);
    expect(within(screen.getByTestId('cart-footer')).getByText('Subtotal')).toBeTruthy();
    expect(within(screen.getByTestId('cart-footer')).getByText('Total')).toBeTruthy();
    expect(screen.queryByTestId('cart-empty')).toBeNull();
  };

  it('shows an icon and the default line, and no heads, totals, Cash, Card terminal or Checkout', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    const empty = screen.getByTestId('cart-empty');
    expect(within(empty).getByTestId('cart-empty-text').textContent).toBe('Tap a product to start a sale');
    const svg = empty.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(heads()).toEqual([]);
    expect(screen.queryByTestId('cart-footer')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
    expect(screen.queryByText('Total')).toBeNull();
    for (const name of ['Cash', 'Card terminal']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Checkout/ })).toBeNull();
  });

  it('shows no Checkout on an empty cart, and the heads, totals and an enabled Checkout once it has a line', () => {
    const onCheckout = vi.fn();
    render(<SaleHarness>{(sale) => <Cart sale={sale} checkout={{ onCheckout }} />}</SaleHarness>);
    expect(screen.queryByRole('button', { name: /^Checkout/ })).toBeNull();
    act(() => sale.add(blue, traits));
    expectFull();
    const checkout = screen.getByRole('button', { name: /^Checkout / });
    expect(checkout.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(checkout);
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it('takes emptyText and emptyIcon in place of the defaults, and null for no icon', () => {
    const { rerender } = render(<SaleHarness>{(sale) => <Cart sale={sale} emptyText="Scan to begin"
      emptyIcon={<Text testID="my-icon">*</Text>} />}</SaleHarness>);
    const empty = () => screen.getByTestId('cart-empty');
    expect(within(empty()).getByTestId('cart-empty-text').textContent).toBe('Scan to begin');
    expect(within(empty()).getByTestId('my-icon')).toBeTruthy();
    expect(empty().querySelector('svg')).toBeNull();
    rerender(<SaleHarness>{(sale) => <Cart sale={sale} emptyIcon={null} />}</SaleHarness>);
    expect(within(empty()).getByTestId('cart-empty-text').textContent).toBe('Tap a product to start a sale');
    expect(empty().querySelector('svg')).toBeNull();
    expect(empty().children).toHaveLength(1);
  });

  it('shows a sale error on an empty cart as an alert', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    // A variant id finalize refuses: the add is refused and the cart stays empty.
    act(() => { sale.add({ ...blue, variant: { ...blue.variant, id: 'v'.repeat(256) } }, traits); });
    expect(sale.order.lineItems).toEqual([]);
    expect(sale.error).toMatch(/too long/);
    expect(within(screen.getByTestId('cart-empty')).getByRole('alert').textContent).toBe(sale.error);
  });

  it.each(['Fee', 'Shipping'])('keeps the heads and totals, and no empty line, for a cart with only a %s row', (kind) => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    click('Add charge');
    click(kind);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Extra' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: '1' } });
    click('Apply');
    expect(sale.order.lineItems).toEqual([]);
    expectFull();
    expect(screen.queryByText('Tap a product to start a sale')).toBeNull();
  });

  it('returns to the empty state when the last line is removed', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expectFull();
    click('Remove Shirt');
    expect(screen.getByTestId('cart-empty')).toBeTruthy();
    expect(heads()).toEqual([]);
    expect(screen.queryByTestId('cart-footer')).toBeNull();
  });
});

describe('Cart columns (v2 Cart Settings › Columns)', () => {
  const columnHeads = () => screen.getAllByRole('columnheader').map((head) => head.textContent);

  it('shows Split on a quantity-3 line with quantity.split, and Split leaves 3 lines', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} columns={{ quantity: { split: true } }} />}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); sale.add(blue, traits); });
    click('Split Shirt');
    expect(sale.order.lineItems.map((line) => line.quantity)).toEqual([1, 1, 1]);
    expect(screen.getAllByText('Shirt')).toHaveLength(3);
    expect(screen.queryByTestId('cart-line-split')).toBeNull();
  });

  it('shows a Split refusal under the line', () => {
    render(<SaleHarness capabilities={{ orderCreate: 2 }}>{(sale) => <Cart sale={sale} columns={{ quantity: { split: true } }} />}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    act(() => { sale.applyDiscount(sale.order.lineItems[0].id, { type: 'fixed', value: 50 }); });
    click('Split Shirt');
    expect(screen.getByTestId('cart-line-split-error').textContent).toBe(SPLIT_FIXED_DISCOUNT);
    expect(sale.order.lineItems).toHaveLength(1);
  });

  it("shows a catalogue line's SKU under the name, and the image head", () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} columns={{ name: { sku: true }, image: { show: true } }} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.getByTestId('cart-line-sku').textContent).toBe('BLUE');
    expect(columnHeads()).toEqual(['Qty', '', 'Item', 'Price', 'Total']);
  });

  describe('percent fees and Amount Includes Tax (vendurepos gap 2.10)', () => {
    const chargeForm = (name: string) => within(screen.getByRole('group', { name }));
    const fees = () => sale.order.fees ?? [];
    function addFee(name: string, amount: string, { percent = false, toggleTax = false } = {}) {
      click('Add charge');
      const form = chargeForm('Add charge');
      fireEvent.change(form.getByRole('textbox', { name: 'Name' }), { target: { value: name } });
      if (percent) fireEvent.click(form.getByTestId('charge-form-unit-percent'));
      if (toggleTax) fireEvent.click(form.getByRole('switch', { name: 'Amount Includes Tax' }));
      fireEvent.change(form.getByRole('textbox', { name: 'Amount' }), { target: { value: amount } });
      click('Apply');
    }
    const price = (index: number) => within(screen.getByTestId(`cart-fee-${index}`)).getByTestId('cart-charge-price').textContent;

    it('C1: adds a fee at %, shows the percent in the Price cell, and follows the cart', { timeout: 20_000 }, () => {
      render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      addFee('Service', '10', { percent: true });
      expect(sale.order.fees).toMatchObject([{ name: 'Service', percent: 10 }]);
      expect(price(0)).toBe('10%');
      const before = fees()[0].amountMinor;
      expect(before).toBeGreaterThan(0);
      act(() => sale.add(blue, traits));
      expect(fees()[0].amountMinor).not.toBe(before);
      expect(price(0)).toBe('10%');
    });

    it('C2: editing a percent fee back to an amount clears its percent', { timeout: 20_000 }, () => {
      render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      addFee('Service', '10', { percent: true });
      click('Edit total of Service');
      click('Edit Service');
      const form = chargeForm('Edit Service');
      fireEvent.click(form.getByTestId('charge-form-unit-amount'));
      fireEvent.change(form.getByRole('textbox', { name: 'Amount' }), { target: { value: '2.00' } });
      click('Apply');
      expect(sale.order.fees).toHaveLength(1);
      expect(fees()[0].percent).toBeUndefined();
      expect(fees()[0].amountMinor).toBe(200);
      expect(price(0)).toBe(money(200));
    });

    it("C3: a fee's own tax mode is set only when it differs from the store's, and clears", { timeout: 20_000 }, () => {
      render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      const store = sale.order.pricesIncludeTax;
      addFee('Bag', '1.00');
      expect(Object.keys(fees()[0])).not.toContain('amountIncludesTax');
      addFee('Wrap', '1.00', { toggleTax: true });
      expect(fees()[1].amountIncludesTax).toBe(!store);
      click('Edit total of Wrap');
      click('Edit Wrap');
      const form = chargeForm('Edit Wrap');
      expect(form.getByRole('switch', { name: 'Amount Includes Tax' }).getAttribute('aria-checked')).toBe(String(!store));
      fireEvent.click(form.getByRole('switch', { name: 'Amount Includes Tax' }));
      click('Apply');
      expect(fees()[1].amountIncludesTax).toBeUndefined();
    });

    it("C4: a percent over 100 shows the builder's refusal inline and adds no fee", { timeout: 20_000 }, () => {
      render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      addFee('Service', '150', { percent: true });
      expect(chargeForm('Add charge').getByRole('alert').textContent).toMatch(/Percent must be > 0 and <= 100/);
      expect(fees()).toHaveLength(0);
    });

    it("C5: a Shipping charge's own tax mode is set by the switch and cleared on edit", { timeout: 20_000 }, () => {
      render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      const store = sale.order.pricesIncludeTax;
      click('Add charge');
      click('Shipping');
      const form = chargeForm('Add charge');
      fireEvent.change(form.getByRole('textbox', { name: 'Name' }), { target: { value: 'Courier' } });
      fireEvent.click(form.getByRole('switch', { name: 'Amount Includes Tax' }));
      fireEvent.change(form.getByRole('textbox', { name: 'Amount' }), { target: { value: '2.00' } });
      click('Apply');
      expect(sale.order.shipping![0].amountIncludesTax).toBe(!store);
      click('Edit total of Courier');
      click('Edit Courier');
      const edit = chargeForm('Edit Courier');
      expect(edit.getByRole('switch', { name: 'Amount Includes Tax' }).getAttribute('aria-checked')).toBe(String(!store));
      fireEvent.click(edit.getByRole('switch', { name: 'Amount Includes Tax' }));
      click('Apply');
      expect(sale.order.shipping![0].amountIncludesTax).toBeUndefined();
    });

    it('C6: editing a fee with its own tax mode to % hides the switch and clears the mode', { timeout: 20_000 }, () => {
      render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      addFee('Wrap', '1.00', { toggleTax: true });
      expect(fees()[0].amountIncludesTax).toBe(!sale.order.pricesIncludeTax);
      click('Edit total of Wrap');
      click('Edit Wrap');
      const form = chargeForm('Edit Wrap');
      fireEvent.click(form.getByTestId('charge-form-unit-percent'));
      expect(form.queryByRole('switch', { name: 'Amount Includes Tax' })).toBeNull();
      fireEvent.change(form.getByRole('textbox', { name: 'Amount' }), { target: { value: '10' } });
      click('Apply');
      expect(fees()[0].percent).toBe(10);
      expect(fees()[0].amountIncludesTax).toBeUndefined();
    });

    it('H1: chargeTaxSwitch={false} hides the switch and a new fee takes the store\'s tax mode', { timeout: 20_000 }, () => {
      render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} chargeTaxSwitch={false} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      click('Add charge');
      expect(chargeForm('Add charge').queryByRole('switch', { name: 'Amount Includes Tax' })).toBeNull();
      click('Cancel');
      addFee('Service', '5');
      expect(fees()).toHaveLength(1);
      expect('amountIncludesTax' in fees()[0]).toBe(false);
    });

    it('H2: chargeTaxSwitch={false} keeps an existing fee\'s own tax mode through an edit', { timeout: 20_000 }, () => {
      render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} chargeTaxSwitch={false} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      const own = !sale.order.pricesIncludeTax;
      act(() => { sale.addFee({ name: 'Service', amountMinor: 500, amountIncludesTax: own }); });
      click('Edit total of Service');
      click('Edit Service');
      const form = chargeForm('Edit Service');
      expect(form.queryByRole('switch', { name: 'Amount Includes Tax' })).toBeNull();
      fireEvent.change(form.getByRole('textbox', { name: 'Amount' }), { target: { value: '7.00' } });
      click('Apply');
      expect(fees()[0].amountMinor).toBe(700);
      expect(fees()[0].amountIncludesTax).toBe(own);
    });

    it('H3: without chargeTaxSwitch the Add charge form shows the switch', { timeout: 20_000 }, () => {
      render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      click('Add charge');
      expect(chargeForm('Add charge').getByRole('switch', { name: 'Amount Includes Tax' })).toBeTruthy();
    });

    it('P1: a fractional percent shows unrounded in the Price cell', { timeout: 20_000 }, () => {
      render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
      act(() => sale.add(blue, traits));
      addFee('Service', '12.5', { percent: true });
      expect(fees()[0].percent).toBe(12.5);
      expect(price(0)).toBe('12.5%');
    });
  });
});
