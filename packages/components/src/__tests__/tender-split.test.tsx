import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { Tender } from '../sale/tender';
import { blue, click, pricing, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (testID: string) => screen.getByTestId(testID).textContent;
/** Presses a keypad key by its label, within the keypad (as tender.test.tsx does). */
const press = (label: string) => fireEvent.click(within(screen.getByTestId('tender-keypad')).getByLabelText(label));
const chip = () => screen.getByTestId('tender-split-chip');
function start(priceMinor: number, method: 'cash' | 'external' = 'cash') {
  render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
  act(() => sale.startTender(method));
}

describe('Tender split', () => {
  it('shows Split while something is due; it opens the ways and closes them', () => {
    start(1000);
    expect(chip().getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('tender-split-ways')).toBeNull();
    fireEvent.click(chip());
    expect(chip().getAttribute('aria-pressed')).toBe('true');
    expect(text('tender-split-heading')).toBe('Split the rest');
    expect(text('tender-split-even-2')).toBe(`2 ways${money(500)} each`);
    expect(text('tender-split-even-3')).toBe(`3 ways${money(333)} each`);
    expect(within(screen.getByTestId('tender-split-ways')).getAllByRole('button')).toHaveLength(5);
    fireEvent.click(chip());
    expect(screen.queryByTestId('tender-split-ways')).toBeNull();
    expect(chip().getAttribute('aria-pressed')).toBe('false');
  });

  it('a 3-way split paid card, cash, card: each tile prefills what is still due', () => {
    start(1000);
    fireEvent.click(chip());
    fireEvent.click(screen.getByTestId('tender-split-even-3'));
    expect(text('tender-entry-amount')).toBe(money(333));
    expect(text('tender-plan')).toBe('1 of 3');
    expect(screen.queryByTestId('tender-split-ways')).toBeNull();
    expect(chip().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('tender-method-external'));
    expect(text('tender-entry-amount')).toBe(money(333));
    click(`Take ${money(333)} in Card terminal`);
    expect(text('tender-entry-amount')).toBe(money(334));
    fireEvent.click(screen.getByTestId('tender-method-cash'));
    expect(text('tender-entry-amount')).toBe(money(334));
    click(`Take ${money(334)} in Cash`);
    expect(text('tender-entry-amount')).toBe(money(333));
    fireEvent.click(screen.getByTestId('tender-method-external'));
    expect(text('tender-entry-amount')).toBe(money(333));
    click(`Take ${money(333)} in Card terminal`);
    expect(sale.order.payments).toMatchObject([
      { method: 'external', amountMinor: 333 }, { method: 'cash', amountMinor: 334 }, { method: 'external', amountMinor: 333 },
    ]);
    expect(sale.order.payments.reduce((sum, leg) => sum + leg.amountMinor, 0)).toBe(sale.order.totalMinor);
    expect(sale.order.totalMinor).toBe(1000);
    expect(sale.order.balanceDueMinor).toBe(0);
    expect(screen.getByText(/^Paid in full · /)).toBeTruthy();
  });

  it('after a typed part payment the ways divide what is left', () => {
    start(5000);
    for (const key of ['Clear', '1', '2', '0', '0']) press(key);
    expect(text('tender-entry-amount')).toBe(money(1200));
    fireEvent.click(chip());
    expect(text('tender-split-heading')).toBe(`After this payment · ${money(3800)}`);
    expect(text('tender-split-even-2')).toBe(`2 ways${money(1900)} each`);
    fireEvent.click(screen.getByTestId('tender-split-even-2'));
    expect(text('tender-entry-amount')).toBe(money(1200));
    click(`Take ${money(1200)} in Cash`);
    expect(text('tender-entry-amount')).toBe(money(1900));
    fireEvent.click(screen.getByTestId('tender-method-external'));
    expect(text('tender-entry-amount')).toBe(money(1900));
    expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 1200 }]);
  });

  it('T6: under a split plan the card chip reads Exact <share>, and a press sets the share', () => {
    start(1000);
    fireEvent.click(chip());
    fireEvent.click(screen.getByTestId('tender-split-even-3'));
    fireEvent.click(screen.getByTestId('tender-method-external'));
    expect(text('tender-quick-balance')).toBe(`Exact ${money(333)}`);
    for (const key of ['Clear', '1', '0', '0']) press(key);
    expect(text('tender-entry-amount')).toBe(money(100));
    fireEvent.click(screen.getByTestId('tender-quick-balance'));
    expect(text('tender-entry-amount')).toBe(money(333));
    expect(sale.order.payments).toEqual([]);
  });

  it('no Split once nothing is due', () => {
    start(1000);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    expect(screen.queryByTestId('tender-split-chip')).toBeNull();
  });

  it('a tile with no plan prefills the balance after a part payment', () => {
    start(2250);
    act(() => { sale.addTender({ method: 'external', amountMinor: 1000 }); });
    fireEvent.click(screen.getByTestId('tender-method-cash'));
    expect(text('tender-entry-amount')).toBe(money(1250));
  });
});
