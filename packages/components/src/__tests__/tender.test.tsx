import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney, paymentMethodOf } from '@tallyui/core';
import type { useSale } from '@tallyui/pos';
import { Tender } from '../sale/tender';
import { blue, click, pricing, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (testID: string) => screen.getByTestId(testID).textContent;
const disabled = (testID: string) => screen.getByTestId(testID).getAttribute('aria-disabled') === 'true';
const leg = (index: number) => sale.order.payments[index].id;
/**
 * Presses a keypad key by its label, within the keypad. Not `click()`, whose getByRole checks the accessible name
 * and visibility of every button in the pane on each call: with six keypad presses through it, the keypad test
 * took 3.8 s locally and 8.7 s on a loaded CI runner, past the 5 s test timeout.
 */
const press = (label: string) => fireEvent.click(within(screen.getByTestId('tender-keypad')).getByLabelText(label));
function start(priceMinor: number, method: 'cash' | 'external' = 'cash', methods?: Parameters<typeof Tender>[0]['methods']) {
  render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} methods={methods} />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
  act(() => sale.startTender(method));
}

describe('Tender', () => {
  it('renders nothing outside the tender stage', () => {
    const { container } = render(<SaleHarness>{(sale) => <Tender sale={sale} />}</SaleHarness>);
    expect(container.textContent).toBe('');
  });

  it('lists each leg with its status; the headline counts captured legs only', () => {
    start(5000);
    expect(text('tender-ledger')).toBe('No payments yet');
    expect(text('tender-headline')).toBe(`Total${money(5000)}`);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    act(() => { sale.addTender({ method: 'external', amountMinor: 1500, status: 'pending' }); });
    act(() => { sale.addTender({ method: 'external', amountMinor: 500, status: 'authorized' }); });
    expect(text(`tender-leg-${leg(0)}-status`)).toBe('Captured');
    expect(text(`tender-leg-${leg(1)}-status`)).toBe('Pending');
    expect(text(`tender-leg-${leg(2)}-status`)).toBe('Authorized');
    expect(within(screen.getByTestId(`tender-leg-${leg(1)}`)).getByText('Next')).toBeTruthy();
    expect(within(screen.getByTestId(`tender-leg-${leg(2)}`)).queryByText('Next')).toBeNull();
    expect(text('tender-headline')).toBe(`Remaining${money(4000)}${money(1000)} of ${money(5000)} paid`);
    expect(disabled('tender-complete')).toBe(true);
  });

  it('offers exact then the next 5, 10 and 50; a chip enters its amount and the leg gives change', async () => {
    start(3451);
    const chips = within(screen.getByTestId('tender-quick')).getAllByRole('button').map((chip) => chip.textContent);
    expect(chips).toEqual([`Exact ${money(3451)}`, money(3500), money(4000), money(5000)]);
    click(money(4000));
    expect(text('tender-entry-amount')).toBe(money(4000));
    expect(text('tender-entry-hint')).toBe(`Change ${money(549)}`);
    click(`Take ${money(3451)} in Cash`);
    expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 4000 }]);
    expect(text('tender-change')).toBe(`Change ${money(549)}`);
    expect(screen.queryByTestId('tender-entry')).toBeNull();
    await act(async () => { click('Complete sale'); });
    expect(sale.stage.kind).toBe('receipt');
  });

  it('types on the keypad, takes a part payment, then pre-types the balance for the next leg', () => {
    start(2250);
    for (const key of ['1', '0', '0', '0', '0']) press(key);
    press('Delete last digit');
    expect(text('tender-entry-amount')).toBe(money(1000));
    expect(text('tender-entry-hint')).toBe(`Part payment · ${money(1250)} left after this`);
    click(`Take ${money(1000)} in Cash`);
    expect(text('tender-entry-amount')).toBe(money(1250));
    click('Card terminal');
    fireEvent.change(screen.getByRole('textbox', { name: 'Terminal reference' }), { target: { value: 'T-9' } });
    click(`Take ${money(1250)} in Card terminal`);
    expect(sale.order.payments).toMatchObject([{ method: 'cash', amountMinor: 1000 }, { method: 'external', amountMinor: 1250, reference: 'T-9' }]);
    expect(screen.getByText('Paid in full')).toBeTruthy();
  });

  it('shows Cancel payment only where canVoidLeg allows; voiding strikes the leg and restores the balance', () => {
    const cash = paymentMethodOf('cash');
    start(2000, 'cash', [{ ...cash, capabilities: { ...cash.capabilities, void: false } }, paymentMethodOf('external')]);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 500 }); });
    act(() => { sale.addTender({ method: 'external', amountMinor: 700 }); });
    expect(within(screen.getByTestId(`tender-leg-${leg(0)}`)).queryByRole('button', { name: 'Cancel payment' })).toBeNull();
    fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`));
    expect(text(`tender-leg-${leg(1)}-status`)).toBe('Cancelled');
    expect(screen.queryByTestId(`tender-leg-${leg(1)}-void`)).toBeNull();
    expect(text('tender-balance')).toBe(money(1500));
    expect(text('tender-entry-amount')).toBe(money(1500));
  });

  it('completes a zero-balance sale with no leg', async () => {
    start(0);
    expect(screen.queryByTestId('tender-entry')).toBeNull();
    expect(disabled('tender-complete')).toBe(false);
    await act(async () => { click('Complete sale'); });
    expect(sale.stage.kind).toBe('receipt');
  });

  it('edits the reference of the card leg startTender records, capped at 255 characters', async () => {
    start(1500, 'external');
    const field = screen.getByRole('textbox', { name: 'Terminal reference' });
    expect(field.getAttribute('maxlength')).toBe('255');
    fireEvent.change(field, { target: { value: 'A1B2' } });
    expect(sale.order.payments).toMatchObject([{ method: 'external', amountMinor: 1500, reference: 'A1B2' }]);
    expect(screen.getByTestId('tender-pane').getAttribute('data-print')).toBe('hide');
    await act(async () => { click('Complete sale'); });
    expect(sale.stage.kind).toBe('receipt');
  });

  describe('Continue after a failed save (the Front desk, 2026-09-27)', () => {
    const stub = (canContinue: boolean) => ({
      stage: { kind: 'tender', method: 'external' }, error: 'The sale could not be saved: flush failed', canContinue,
      order: { currency: 'EUR', totalMinor: 1250, paidMinor: 1250, balanceDueMinor: 0, changeDueMinor: 0, payments: [] },
      complete: vi.fn(), continueSale: vi.fn(), setTender: vi.fn(), cancelTender: vi.fn(),
    }) as unknown as ReturnType<typeof useSale>;
    const message = 'This sale is stored and will be sent. Continue to the next sale.';

    it('renders no Continue while canContinue is false', () => {
      render(<Tender sale={stub(false)} />);
      expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
      expect(screen.queryByText(message)).toBeNull();
    });

    it('renders Continue, with its message, when canContinue is true; pressing it calls continueSale once', () => {
      const sale = stub(true);
      render(<Tender sale={sale} />);
      expect(screen.getByText(message)).toBeTruthy();
      click('Continue');
      expect(sale.continueSale).toHaveBeenCalledTimes(1);
      expect(sale.complete).not.toHaveBeenCalled();
    });
  });

  it('shows sale.error as an alert, and Back cancels the tender', async () => {
    start(2000);
    act(() => sale.setTender({ method: 'cash', amountMinor: 1 }));
    await act(async () => { await sale.complete(); });
    expect(screen.getByRole('alert').textContent).toBe('finalize: underpaid');
    click('Back');
    expect(sale.stage.kind).toBe('cart');
  });
});
