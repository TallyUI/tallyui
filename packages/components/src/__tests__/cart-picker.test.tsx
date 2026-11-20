// Cart's `picker` (tally-woo 11b): WCPOS v2's split-by-item bill (stilled-cart.tsx, cells/quantity-keypad.tsx
// ReadOnlyQuantity, tender/unit-stepper.tsx). The cart turns read-only and each unpaid line shows `− n of unpaid +`.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import en from '../i18n/locales/en/components.json';
import { Cart } from '../sale/cart';
import { blue, SaleHarness, sale, traits } from './sale-harness';

// jsdom has no window size; the Cart sees a tablet so its Price column shows, as in cart.test.tsx.
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
}));

const money = (amount: number) => formatMoney({ amount, currency: 'EUR' })!;
const onPick = vi.fn();
const unitMinor = (_lineId: string, units: number) => units * 100;
// The Split link shows under a quantity above 1, so the picker's lack of one is not vacuous.
const columns = { quantity: { split: true } };

beforeEach(() => onPick.mockReset());
afterEach(cleanup);

/** Line A "Shirt" × 3 with a line discount, line B "Alteration" × 1, and one fee "Bag"; `pick` re-renders with a picker. */
function setup() {
  const view = render(<SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} columns={columns} />}</SaleHarness>);
  act(() => { sale.add(blue, traits); sale.add(blue, traits); sale.add(blue, traits); });
  act(() => { sale.addCustomLine({ name: 'Alteration', priceMinor: 360 }); });
  const [a, b] = sale.order.lineItems.map((line) => line.id);
  act(() => { sale.applyDiscount(a, { type: 'fixed', value: 50 }); sale.addFee({ name: 'Bag', amountMinor: 120 }); });
  const pick = (picked: Record<string, number>, paid: Record<string, number> = {}) => view.rerender(
    <SaleHarness capabilities={{ orderCreate: 5 }}>{(sale) => <Cart sale={sale} columns={columns}
      picker={{ picked, paid, unitMinor, onPick }} />}</SaleHarness>);
  return { a, b, pick };
}
const units = (id: string) => screen.getByTestId(`cart-line-${id}-pick-units`).textContent;

describe('Cart picker', () => {
  it('P1: without picker, the line and fee controls are unchanged', { timeout: 20_000 }, () => {
    setup();
    for (const name of ['Decrease Shirt', 'Increase Shirt', 'Remove Shirt', 'Edit total of Bag', 'Split Shirt', 'Order discount', 'Add charge']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: /^Remove discount/ })).toBeTruthy();
    expect(within(screen.getByTestId('cart-fee-0')).getByTestId('cart-line-strip')).toBeTruthy();
    expect(screen.queryByTestId(/-pick-/)).toBeNull();
  });

  it('P2: with picker, the bill is read-only and each line shows its stepper', { timeout: 20_000 }, () => {
    const { a, b, pick } = setup();
    pick({});
    expect(units(a)).toBe('0 of 3');
    expect(units(b)).toBe('0 of 1');
    for (const name of ['Decrease Shirt', 'Increase Shirt', 'Remove Shirt', 'Order discount', 'Add charge', 'Edit total of Bag']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /^Remove discount/ })).toBeNull();
    expect(screen.queryByTestId('cart-line-split')).toBeNull();
    const fee = within(screen.getByTestId('cart-fee-0'));
    expect(fee.getByTestId('cart-charge-line')).toBeTruthy();
    for (const id of ['cart-line-strip', 'cart-line-total', 'cart-line-edit', 'cart-line-remove']) expect(fee.queryByTestId(id)).toBeNull();
    expect(screen.queryByTestId(`cart-line-${a}-pick-amount`)).toBeNull();
  });

  it("P3: picked units show what they add, through the caller's unitMinor", { timeout: 20_000 }, () => {
    const { a, b, pick } = setup();
    pick({ [a]: 2 });
    expect(units(a)).toBe('2 of 3');
    expect(screen.getByTestId(`cart-line-${a}-pick-amount`).textContent).toBe(money(200));
    expect(screen.queryByTestId(`cart-line-${b}-pick-amount`)).toBeNull();
  });

  it('P4: + and − set this payment\'s units', { timeout: 20_000 }, () => {
    const { a, pick } = setup();
    pick({ [a]: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'One more Shirt' }));
    expect(onPick).toHaveBeenLastCalledWith(a, 3);
    fireEvent.click(screen.getByRole('button', { name: 'One fewer Shirt' }));
    expect(onPick).toHaveBeenLastCalledWith(a, 1);
  });

  it('P5: + stops at the unpaid units and − at 0', { timeout: 20_000 }, () => {
    const { a, pick } = setup();
    pick({ [a]: 1 }, { [a]: 2 });
    expect(units(a)).toBe('1 of 1');
    const plus = screen.getByTestId(`cart-line-${a}-pick-plus`);
    expect(plus.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(plus);
    expect(onPick).not.toHaveBeenCalled();
    pick({});
    const minus = screen.getByTestId(`cart-line-${a}-pick-minus`);
    expect(minus.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(minus);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('P6: a line paid in full shows its plain quantity, no stepper', { timeout: 20_000 }, () => {
    const { b, pick } = setup();
    pick({}, { [b]: 1 });
    expect(screen.queryByTestId(`cart-line-${b}-pick-plus`)).toBeNull();
    expect(screen.queryByTestId(`cart-line-${b}-pick-units`)).toBeNull();
    expect(within(screen.getByText('Alteration').parentElement!.parentElement!).getByText('1')).toBeTruthy();
  });

  it('P8: with picker the quantity column heads "This payment"; without it, the head is unchanged', { timeout: 20_000 }, () => {
    const { pick } = setup();
    const quantityHead = () => screen.getAllByRole('columnheader')[0].textContent;
    expect(quantityHead()).toBe(en['pos_cart.col_qty']);
    expect(quantityHead()).toBe('Qty');
    pick({});
    expect(quantityHead()).toBe('This payment');
  });

  // The harness builds no negative-total line (a negative custom price displays 0), so P7 covers a fractional quantity.
  it('P7: a fractional quantity shows no stepper', { timeout: 20_000 }, () => {
    const { a, pick } = setup();
    act(() => sale.setQuantity(a, 2.5));
    expect(sale.order.lineItems.find((line) => line.id === a)!.quantity).toBe(2.5);
    pick({});
    expect(screen.queryByTestId(`cart-line-${a}-pick-plus`)).toBeNull();
    expect(screen.getByText('2.5')).toBeTruthy();
  });
});
