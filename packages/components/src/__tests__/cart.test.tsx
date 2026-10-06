import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { Cart } from '../sale/cart';
import { blue, click, discount, pricing, SaleHarness, sale, totals, traits } from './sale-harness';

const money = (amount: number) => formatMoney({ amount, currency: 'EUR' })!;

afterEach(() => cleanup());

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
    expect(within(fee).getByText(money(sale.order.display.fees![0].amountMinor))).toBeTruthy();
    expect(within(shipping).getByText('Delivery')).toBeTruthy();
    expect(within(shipping).getByText(money(sale.order.display.shipping![0].amountMinor))).toBeTruthy();
    expect(screen.getByText(`${money(360)} × 1`)).toBeTruthy();
    expect(screen.getByText('Alteration').compareDocumentPosition(fee) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fee.compareDocumentPosition(shipping) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const footer = within(screen.getByTestId('cart-footer'));
    expect(within(footer.getByText('Subtotal').parentElement!).getByText(money(sale.order.display.subtotalMinor))).toBeTruthy();
    expect(within(footer.getByText(inclusive ? 'incl. Tax 25%' : 'Tax 25%').parentElement!).getByText(money(sale.order.display.taxMinor))).toBeTruthy();
    expect(within(footer.getByText('Total').parentElement!).getByText(money(sale.order.display.totalMinor))).toBeTruthy();
    click('Remove Bag');
    expect(screen.queryByTestId('cart-fee-0')).toBeNull();
    expect(sale.order.fees ?? []).toEqual([]);
    click('Remove Delivery');
    expect(screen.queryByTestId('cart-shipping-0')).toBeNull();
    expect(sale.order.shipping ?? []).toEqual([]);
    click('Remove Alteration');
    expect(totals(sale.order)).toEqual(before);
    expect(within(footer.getByText('Total').parentElement!).getByText(money(sale.order.display.totalMinor))).toBeTruthy();
  });

  it('keeps only one charge, discount or price form open', () => {
    render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} canEditPrice />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    click('Order discount');
    click('Add charge');
    expect(screen.queryByRole('group', { name: 'Order discount' })).toBeNull();
    fireEvent.click(screen.getByText('Price'));
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

  it.each([undefined, false])('hides Price without permission (%s)', (canEditPrice) => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} canEditPrice={canEditPrice} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.queryByText('Price')).toBeNull();
    expect(screen.queryByTestId('price-form')).toBeNull();
  });

  it('edits a line price with permission and reports the applied change for audit', () => {
    const onPriceChange = vi.fn();
    render(<SaleHarness>{(sale) => <Cart sale={sale} canEditPrice onPriceChange={onPriceChange} />}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    const lineId = sale.order.lineItems[0].id;
    fireEvent.click(screen.getByText('Discount'));
    fireEvent.click(screen.getByText('Price'));
    expect(screen.queryByRole('group', { name: 'Discount on Shirt' })).toBeNull();
    expect(screen.getAllByRole('group')).toHaveLength(1);
    fireEvent.change(screen.getByTestId('price-input'), { target: { value: '10.00' } });
    fireEvent.change(screen.getByTestId('price-reason'), { target: { value: ' Damaged ' } });
    fireEvent.click(screen.getByTestId('price-apply'));
    expect(sale.order.lineItems[0].unitPriceMinor).toBe(1000);
    expect(screen.getByText(`${money(1000)} × 2`)).toBeTruthy();
    expect(screen.getAllByText(money(2000))).toHaveLength(2);
    expect(onPriceChange).toHaveBeenCalledExactlyOnceWith({ lineId, fromMinor: 1250, toMinor: 1000, reason: 'Damaged' });
    expect(screen.queryByTestId('price-form')).toBeNull();
  });

  it('renders lines with their display amount, each discount chip with its own display amount, and the order chip with orderDiscountMinor', () => {
    render(<SaleHarness capabilities={{ orderCreate: 2 }}>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    discount('Discount', 'Percent', '10');
    discount('Order discount', 'Amount', '0.50');
    // The line before its discounts (2 × €12.50 = €25.00): CartLine shows the display amount, not the net-after-discount.
    expect(screen.getByText('Shirt')).toBeTruthy();
    expect(screen.getByText(`${money(1250)} × 2`)).toBeTruthy();
    // The line's display amount (before its own discount) and the footer's Subtotal both read €25.00.
    expect(screen.getAllByText(money(2500))).toHaveLength(2);
    // The line's own 10% discount, shown by its own display amount (10% of €25.00).
    expect(screen.getByText(`10% −${money(250)}`)).toBeTruthy();
    // A single order discount's chip carries order.display.orderDiscountMinor.
    expect(screen.getByText(`Order discount −${money(50)}`)).toBeTruthy();
  });

  it('passes taxInclusive to CartTotal, and labels each tax row with taxLabel', () => {
    render(<SaleHarness settings={{ ...pricing, pricesIncludeTax: true }}>
      {(sale) => <Cart sale={sale} taxLabel={(ratePpm) => `VAT ${ratePpm / 10000}%`} />}
    </SaleHarness>);
    act(() => sale.add(blue, traits));
    expect(screen.getByText('incl. VAT 25%')).toBeTruthy();
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

  it('pads the empty-cart line like the cart rows (px-3 py-2)', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    expect(screen.getByTestId('cart-empty').textContent).toBe('Scan or tap a product to start a sale.');
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../sale/cart.tsx'), 'utf8');
    expect(source).toContain('testID="cart-empty" className="px-3 py-2 text-muted-foreground"');
  });

  it('disables Cash and Card terminal on an empty cart, and enables them once it has lines', () => {
    render(<SaleHarness>{(sale) => <Cart sale={sale} />}</SaleHarness>);
    expect(screen.getByRole('button', { name: 'Cash' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Card terminal' }).getAttribute('aria-disabled')).toBe('true');
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
});
