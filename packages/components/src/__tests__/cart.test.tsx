import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { Cart } from '../sale/cart';
import { blue, click, discount, pricing, SaleHarness, sale, totals, traits } from './sale-harness';

const money = (amount: number) => formatMoney({ amount, currency: 'EUR' })!;

afterEach(() => cleanup());

describe('Cart', () => {
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
