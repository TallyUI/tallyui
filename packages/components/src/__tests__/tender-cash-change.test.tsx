import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { Tender } from '../sale/tender';
import { blue, click, pricing, SaleHarness, sale, traits } from './sale-harness';

// Row 500: a cash leg taken at Take records the amount applied, so the ledger and the void prompt name what the till holds.
afterEach(() => cleanup());

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (testID: string) => screen.getByTestId(testID).textContent;
const leg = (index: number) => sale.order.payments[index].id;
const press = (label: string) => fireEvent.click(within(screen.getByTestId('tender-keypad')).getByLabelText(label));
function start(priceMinor: number) {
  render(<><SaleHarness settings={settings}>{(sale) => <Tender sale={sale} confirmVoid />}</SaleHarness><PortalHost /></>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
  act(() => sale.startTender('cash'));
}

describe('Tender cash leg records its change (row 500)', () => {
  it('P1: card 10.00 then cash 10.00 on 15.00: the cash row shows 5.00, and after the card is voided its prompt returns 5.00', () => {
    start(1500);
    click('Card terminal');
    for (const key of ['1', '0', '0', '0']) press(key);
    click(`Take ${money(1000)} in Card terminal`);
    click('Cash');
    for (const key of ['1', '0', '0', '0']) press(key);
    click(`Take ${money(500)} in Cash`);
    const cashRow = text(`tender-leg-${leg(1)}`);
    expect(cashRow).toContain(money(500));
    expect(cashRow).not.toContain(money(1000));
    fireEvent.click(screen.getByTestId(`tender-leg-${leg(0)}-void`));
    fireEvent.click(screen.getByTestId('tender-leg-void-dialog-confirm'));
    expect(text(`tender-leg-${leg(0)}-status`)).toBe('Cancelled');
    fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`));
    expect(within(screen.getByTestId('tender-leg-void-dialog')).getByText(`Return ${money(500)} cash to the customer`)).toBeTruthy();
  }, 20_000);

  it('P2: with a pending external leg of 10.00 on 15.00, 10.00 typed for cash shows change of 5.00', () => {
    start(1500);
    act(() => { sale.addTender({ method: 'external', amountMinor: 1000, status: 'pending' }); });
    for (const key of ['1', '0', '0', '0']) press(key);
    expect(text('tender-entry-hint')).toBe(`Change ${money(500)}`);
  });
});
