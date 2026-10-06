import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { SplitTender } from '../sale/split-tender';
import { blue, click, pricing, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' });
const amountInput = () => screen.getByTestId('split-tender-amount') as HTMLInputElement;
const enterAmount = (value: string) => fireEvent.change(amountInput(), { target: { value } });
const complete = () => screen.getByTestId('split-tender-complete');
function start() {
  render(<SaleHarness settings={settings}>{(sale) => <SplitTender sale={sale} />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 2250));
  act(() => sale.startTender('cash'));
}
function add(method: 'Cash' | 'Card', value: string) {
  click(method);
  enterAmount(value);
  click('Add');
}

describe('SplitTender', () => {
  it('renders nothing outside the tender stage', () => {
    const { container } = render(<SaleHarness>{(sale) => <SplitTender sale={sale} />}</SaleHarness>);
    expect(container.textContent).toBe('');
  });

  it('records card and cash, shows the exact payments and change, then completes the sale', async () => {
    start();
    expect(complete().getAttribute('aria-disabled')).toBe('true');
    expect(amountInput().value).toBe('22.50');
    expect(amountInput().getAttribute('inputmode')).toBe('decimal');
    expect(screen.getByTestId('split-tender-summary').parentElement?.getAttribute('data-print')).toBe('hide');
    expect(screen.queryByTestId('split-tender-reference')).toBeNull();
    click('Card');
    const reference = screen.getByTestId('split-tender-reference') as HTMLInputElement;
    expect(reference.getAttribute('maxlength')).toBe('255');
    fireEvent.change(reference, { target: { value: 'A1B2' } });
    enterAmount('10.00');
    click('Add');
    expect(reference.value).toBe('');
    expect(amountInput().value).toBe('12.50');
    add('Cash', '15.00');
    expect(amountInput().value).toBe('0.00');
    expect(sale.order.payments).toHaveLength(2);
    const [card, cash] = sale.order.payments;
    expect(card).toMatchObject({ method: 'external', amountMinor: 1000, reference: 'A1B2' });
    expect(cash).toMatchObject({ method: 'cash', amountMinor: 1500 });
    const list = screen.getByTestId('split-tender-list');
    expect(list.children).toHaveLength(2);
    const cardRow = within(list).getByTestId(`split-tender-row-${card.id}`);
    const cashRow = within(list).getByTestId(`split-tender-row-${cash.id}`);
    expect(within(cardRow).getByText(`Card ${money(1000)}`)).toBeTruthy();
    expect(within(cardRow).getByText('A1B2')).toBeTruthy();
    expect(within(cashRow).getByText(`Cash ${money(1500)}`)).toBeTruthy();
    const summary = within(screen.getByTestId('split-tender-summary'));
    for (const label of [`Total: ${money(2250)}`, `Paid: ${money(2500)}`, `Remaining: ${money(0)}`, `Change: ${money(250)}`]) {
      expect(summary.getByText(label)).toBeTruthy();
    }
    expect(complete().getAttribute('aria-disabled')).not.toBe('true');
    await act(async () => { click('Complete sale'); });
    expect(sale.stage.kind).toBe('receipt');
    expect(screen.queryByTestId('split-tender-summary')).toBeNull();
  });

  it('removes the card tender, refills the balance, and disables Complete', () => {
    start();
    add('Card', '10.00');
    add('Cash', '15.00');
    const cardId = sale.order.payments[0].id;
    const remove = screen.getByTestId(`split-tender-remove-${cardId}`);
    expect(remove.getAttribute('aria-label')).toBe('Remove tender');
    fireEvent.click(remove);
    expect(sale.order.payments).toHaveLength(1);
    expect(screen.queryByTestId(`split-tender-row-${cardId}`)).toBeNull();
    expect(screen.getByText(`Remaining: ${money(750)}`)).toBeTruthy();
    expect(screen.queryByText(/^Change: /)).toBeNull();
    expect(amountInput().value).toBe('7.50');
    expect(complete().getAttribute('aria-disabled')).toBe('true');
  });

  it('shows the card amount capped by useSale, with no change', () => {
    start();
    add('Card', '30.00');
    expect(sale.order.payments).toHaveLength(1);
    expect(sale.order.payments[0].amountMinor).toBe(2250);
    expect(screen.getByTestId(`split-tender-row-${sale.order.payments[0].id}`).textContent).toContain(`Card ${money(2250)}`);
    expect(sale.order.changeDueMinor).toBe(0);
    expect(screen.queryByText(/^Change: /)).toBeNull();
    expect(amountInput().value).toBe('0.00');
    expect(complete().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('shows the refusal when another card tender is added with nothing due', () => {
    start();
    add('Card', '22.50');
    add('Card', '1.00');
    expect(screen.getByTestId('split-tender-error').textContent).toBe("That tender wasn't added: nothing is due, or the amount isn't valid.");
    expect(sale.order.payments).toHaveLength(1);
    expect(screen.getByTestId('split-tender-list').children).toHaveLength(1);
  });

  it('shows parsePrice errors without adding a tender, and clears the error after an add', () => {
    start();
    add('Cash', 'abc');
    expect(screen.getByTestId('split-tender-error').textContent).toBe('Enter a number.');
    expect(sale.order.payments).toHaveLength(0);
    expect(screen.getByTestId('split-tender-list').children).toHaveLength(0);
    enterAmount('10.00');
    click('Add');
    expect(screen.queryByTestId('split-tender-error')).toBeNull();
    expect(amountInput().value).toBe('12.50');
  });

  it('preserves an edited amount when the remaining due changes, until a successful add', () => {
    start();
    add('Card', '10.00');
    enterAmount('5.00');
    fireEvent.click(screen.getByTestId(`split-tender-remove-${sale.order.payments[0].id}`));
    expect(amountInput().value).toBe('5.00');
    click('Add');
    expect(amountInput().value).toBe('17.50');
  });

  it('requires a payment even when the remaining due is zero', () => {
    start();
    act(() => sale.setUnitPrice(sale.order.lineItems[0].id, 0));
    expect(sale.order.balanceDueMinor).toBe(0);
    expect(sale.order.payments).toHaveLength(0);
    expect(complete().getAttribute('aria-disabled')).toBe('true');
  });

  it('shows sale.error and lets Back cancel the tender', async () => {
    start();
    await act(async () => { await sale.complete(); });
    expect(screen.getByRole('alert').textContent).toBe('finalize: underpaid');
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    click('Back');
    expect(sale.stage.kind).toBe('cart');
  });

  it('shows Continue and its message when canContinue is true and calls continueSale', () => {
    const continueSale = vi.fn();
    render(<SaleHarness settings={settings}>{(sale) => <SplitTender sale={{ ...sale, canContinue: true, continueSale }} />}</SaleHarness>);
    act(() => sale.add(blue, traits));
    act(() => sale.startTender('cash'));
    expect(screen.getByText('This sale is stored and will be sent. Continue to the next sale.')).toBeTruthy();
    click('Continue');
    expect(continueSale).toHaveBeenCalledTimes(1);
    expect(sale.stage.kind).toBe('tender');
  });
});
