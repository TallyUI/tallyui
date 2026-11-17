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
function start(priceMinor: number) {
  render(<SaleHarness settings={settings}>{(sale) => <Tender sale={sale} />}</SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
  act(() => sale.startTender('cash'));
}
const follows = (a: string, b: string) =>
  (screen.getByTestId(a).compareDocumentPosition(screen.getByTestId(b)) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('Tender to-pay headline', () => {
  it('leads with To pay and the entry as the hero, above the method tiles', () => {
    start(3451);
    expect(follows('tender-caption', 'tender-entry-amount')).toBe(true);
    expect(follows('tender-entry-amount', 'tender-methods')).toBe(true);
    expect(text('tender-caption')).toBe('To pay');
    expect(screen.queryByTestId('tender-balance')).toBeNull();
    expect(text('tender-entry-amount')).toBe(money(3451));
    for (const key of ['Clear', '2', '0', '0', '0']) press(key);
    expect(text('tender-entry-amount')).toBe(money(2000));
    expect(text('tender-caption')).toBe(`To pay ${money(3451)}`);
    click(money(5000));
    expect(text('tender-caption')).toBe(`To pay ${money(3451)}`);
  });

  it('reads Remaining once money is paid', () => {
    start(5000);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    expect(text('tender-caption')).toBe('Remaining');
    expect(text('tender-entry-amount')).toBe(money(4000));
  });

  it('no hero once nothing is due', () => {
    start(1000);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    expect(screen.queryByTestId('tender-figure')).toBeNull();
    expect(text('tender-balance')).toBe(money(0));
  });
});
