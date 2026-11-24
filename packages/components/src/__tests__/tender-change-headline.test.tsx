import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { Tender } from '../sale/tender';
import { blue, click, pricing, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (testID: string) => screen.getByTestId(testID).textContent;
const press = (label: string) => fireEvent.click(within(screen.getByTestId('tender-keypad')).getByLabelText(label));
function start(priceMinor: number, method: 'cash' | 'external' = 'cash', methods?: Parameters<typeof Tender>[0]['methods']) {
  render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} methods={methods} />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
  act(() => sale.startTender(method));
}

describe('Tender change headline', () => {
  it('leads with the change once cash covers more than the total', () => {
    start(3451);
    click(money(5000));
    expect(text('tender-entry-hint')).toBe(`Change ${money(1549)}`);
    expect(text('tender-tendered-line')).toBe(`Tendered ${money(5000)}`);
    expect(text('tender-entry-amount')).toBe(money(5000));
  });

  it('shows the tendered figure, not the change, while the cash does not cover the total', () => {
    start(3451);
    expect(screen.queryByTestId('tender-tendered-line')).toBeNull();
    expect(text('tender-entry-amount')).toBe(money(3451));
    for (const key of ['Clear', '2', '0', '0', '0']) press(key);
    expect(text('tender-entry-amount')).toBe(money(2000));
    expect(screen.queryByTestId('tender-tendered-line')).toBeNull();
    expect(text('tender-entry-hint')).not.toMatch(/^Change/);
  });

  it('names the total beside the tendered amount after a part payment', () => {
    start(5000);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    click(money(5000));
    expect(text('tender-tendered-line')).toBe(`Tendered ${money(5000)} · Total ${money(5000)}`);
    expect(text('tender-entry-hint')).toBe(`Change ${money(1000)}`);
  });

  it('a method that gives no change never leads with change', () => {
    start(3451);
    fireEvent.click(screen.getByTestId('tender-method-external'));
    for (const key of ['Clear', '5', '0', '0', '0']) press(key);
    expect(screen.queryByTestId('tender-tendered-line')).toBeNull();
    expect(text('tender-entry-hint')).not.toMatch(/^Change/);
  });

  it('no change shows while a payment in motion covers the balance', () => {
    start(3125);
    act(() => { sale.addTender({ method: 'external', amountMinor: 3125, status: 'pending' }); });
    const noChange = () => {
      expect(screen.queryByTestId('tender-tendered-line')).toBeNull();
      expect(text('tender-entry-hint')).not.toMatch(/Change/);
      expect(screen.getByTestId('tender-take').getAttribute('aria-disabled')).toBe('true');
    };
    noChange();
    for (const key of ['Clear', '5', '0', '0', '0']) press(key);
    noChange();
  });

  it('change still leads when a payment in motion covers only part of the balance', () => {
    start(3125);
    act(() => { sale.addTender({ method: 'external', amountMinor: 1000, status: 'pending' }); });
    for (const key of ['Clear', '5', '0', '0', '0']) press(key);
    expect(text('tender-entry-hint')).toBe(`Change ${money(2875)}`);
    expect(screen.queryByTestId('tender-tendered-line')).not.toBeNull();
    expect(screen.getByTestId('tender-take').getAttribute('aria-disabled')).not.toBe('true');
  });
});
