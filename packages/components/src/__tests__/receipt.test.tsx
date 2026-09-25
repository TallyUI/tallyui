import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { Receipt } from '../sale/receipt';
import { blue, pricing, sale, SaleHarness, traits } from './sale-harness';

const money = (amount: number) => formatMoney({ amount, currency: 'EUR' })!;
const store = { name: 'Shop' };

afterEach(() => cleanup());

describe('Receipt', () => {
  // Ported from medusapos/app `563b03c4` `tests/sale.test.tsx` (ADR-052, TV6b), `settings` -> `store`.
  it('shows the cashier display name when supplied to the receipt', () => {
    render(<SaleHarness>{() => null}</SaleHarness>);
    render(<Receipt order={sale.order} store={store} cashier="Alex Shopkeeper" registerId="register-1" newSale={() => {}} />);
    expect(screen.getByText('Cashier: Alex Shopkeeper')).toBeTruthy();
    expect(screen.queryByText(/^Register:/)).toBeNull();
  });

  // Ported from medusapos/app `563b03c4` `tests/discount.test.tsx` (ADR-052, TV6b) — receipt-level only;
  // its cart assertions are already covered by cart.test.tsx (TV6a) and dropped here so this suite never
  // touches Cart. The discounts are applied through sale.applyDiscount directly, bypassing the cart UI.
  // medusapos's own VAT label became TV6a/TV6b's default taxLabel ("Tax n%"), so the tax row reads
  // "Tax 25%" here, not "VAT 25%".
  it.each([
    [false, { subtotalMinor: 2500, discountMinor: 300, taxMinor: 550, totalMinor: 2750 }],
    [true, { subtotalMinor: 2500, discountMinor: 300, taxMinor: 440, totalMinor: 2200 }],
  ])("cart and receipt show order.display's rows, which add up (prices include tax: %s)", (inclusive, expected) => {
    render(<SaleHarness settings={{ ...pricing, pricesIncludeTax: inclusive }} capabilities={{ orderCreate: 2 }}>{() => null}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    const [line] = sale.order.lineItems;
    act(() => { sale.applyDiscount(line.id, { type: 'percentage', value: 10 }); });
    act(() => { sale.applyDiscount(null, { type: 'fixed', value: 50 }); });
    const { display } = sale.order;
    // The line before its discounts (€25.00), its 10% as a row (€2.50), and the order discount as one row (€0.50).
    expect(display).toEqual({ taxInclusive: inclusive, ...expected, orderDiscountMinor: 50,
      lines: [{ lineId: line.id, amountMinor: 2500, discounts: [{ discountId: sale.order.lineItems[0].discounts[0].id, amountMinor: 250 }] }] });
    const order = sale.order;
    cleanup();
    render(<Receipt order={order} store={store} cashier="cashier" registerId="register-1" newSale={() => {}} />);
    // In the cart's order: the line, its discount row (discountLabel), the order discount row, then Subtotal, Discount, tax and Total.
    const tax = `${inclusive ? 'incl. ' : ''}Tax 25%: ${money(display.taxMinor)}`;
    const rows = [`2 × ${money(1250)}: ${money(2500)}`, `10% off: −${money(250)}`, `Order discount: −${money(50)}`,
      `Subtotal: ${money(2500)}`, `Discount: −${money(300)}`, tax, `Total: ${money(display.totalMinor)}`];
    const labels = Array.from(document.querySelectorAll('[aria-label]'), (element) => element.getAttribute('aria-label'));
    expect(labels.filter((label) => rows.includes(label!))).toEqual(rows);
  });

  it('shows discountLabel for a stacked percentage and a stacked fixed discount on the same line', () => {
    render(<SaleHarness capabilities={{ orderCreate: 2 }}>{() => null}</SaleHarness>);
    act(() => { sale.add(blue, traits); sale.add(blue, traits); });
    const [line] = sale.order.lineItems;
    act(() => { sale.applyDiscount(line.id, { type: 'percentage', value: 10 }); });
    act(() => { sale.applyDiscount(line.id, { type: 'fixed', value: 250 }); });
    render(<Receipt order={sale.order} store={store} cashier="cashier" registerId="register-1" newSale={() => {}} />);
    expect(screen.getByLabelText(`10% off: −${money(250)}`)).toBeTruthy();
    expect(screen.getByLabelText(`${money(250)} off: −${money(250)}`)).toBeTruthy();
    expect(screen.queryByLabelText(/^Order discount/)).toBeNull();
  });

  it('defaults taxLabel to `Tax ${ratePpm / 10000}%`, and a custom taxLabel replaces it', () => {
    render(<SaleHarness>{() => null}</SaleHarness>);
    act(() => sale.add(blue, traits));
    render(<Receipt order={sale.order} store={store} cashier="cashier" registerId="register-1" newSale={() => {}} />);
    expect(screen.getByText('Tax 25%')).toBeTruthy();
    cleanup();
    render(<Receipt order={sale.order} store={store} cashier="cashier" registerId="register-1" newSale={() => {}}
      taxLabel={(ratePpm) => `VAT ${ratePpm / 10000}%`} />);
    expect(screen.getByText('VAT 25%')).toBeTruthy();
    expect(screen.queryByText('Tax 25%')).toBeNull();
  });

  it('shows the store name and an optional address', () => {
    render(<SaleHarness>{() => null}</SaleHarness>);
    act(() => sale.add(blue, traits));
    render(<Receipt order={sale.order} store={{ name: 'Corner Shop' }} cashier="cashier" registerId="register-1" newSale={() => {}} />);
    expect(screen.getByText('Corner Shop')).toBeTruthy();
    cleanup();
    render(<Receipt order={sale.order} store={{ name: 'Corner Shop', address: '1 High Street' }} cashier="cashier" registerId="register-1" newSale={() => {}} />);
    expect(screen.getByText('1 High Street')).toBeTruthy();
  });

  it('defaults topInset to 0 (no spacer), and a positive topInset reserves a print-hidden spacer above the receipt', () => {
    render(<SaleHarness>{() => null}</SaleHarness>);
    act(() => sale.add(blue, traits));
    const { container } = render(<Receipt order={sale.order} store={store} cashier="cashier" registerId="register-1" newSale={() => {}} />);
    expect(container.firstElementChild?.getAttribute('data-print')).not.toBe('hide');
    cleanup();
    const withInset = render(<Receipt order={sale.order} store={store} cashier="cashier" registerId="register-1" newSale={() => {}} topInset={40} />);
    const spacer = withInset.container.firstElementChild as HTMLElement;
    expect(spacer.getAttribute('data-print')).toBe('hide');
    expect(spacer.style.height).toBe('40px');
  });

  it('formats the order date with a small Intl.DateTimeFormat default, and a custom formatDate replaces it', () => {
    render(<SaleHarness>{() => null}</SaleHarness>);
    act(() => sale.add(blue, traits));
    const defaultLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sale.order.createdAt));
    render(<Receipt order={sale.order} store={store} cashier="cashier" registerId="register-1" newSale={() => {}} />);
    expect(screen.getByText(defaultLabel)).toBeTruthy();
    cleanup();
    render(<Receipt order={sale.order} store={store} cashier="cashier" registerId="register-1" newSale={() => {}} formatDate={() => 'CUSTOM DATE'} />);
    expect(screen.getByText('CUSTOM DATE')).toBeTruthy();
    expect(screen.queryByText(defaultLabel)).toBeNull();
  });
});
