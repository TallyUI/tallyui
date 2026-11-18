import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney, paymentMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { Cart } from '../sale/cart';
import { Tender } from '../sale/tender';
import { blue, pricing, SaleHarness, sale, traits } from './sale-harness';

afterEach(() => cleanup());

const settings = { ...pricing, taxRatesPpm: { default: 0 } };
const money = (amount: number) => formatMoney({ amount, currency: 'EUR' }) ?? '';
const text = (testID: string) => screen.getByTestId(testID).textContent;
const leg = (index: number) => sale.order.payments[index].id;
function start(priceMinor: number, methods?: PaymentMethodDescriptor[]) {
  render(<SaleHarness settings={settings}>{(sale) => <><Tender sale={sale} ledger={false} methods={methods} /><Cart sale={sale} showTotal={false} tenderLedger={{ methods }} /></>}</SaleHarness>);
  act(() => sale.add(blue, traits));
  act(() => sale.setUnitPrice(sale.order.lineItems[0].id, priceMinor));
  act(() => sale.startTender('cash'));
}

describe('Cart tenderLedger', () => {
  it('puts the empty ledger in the cart under Payments, and none in the pane', () => {
    start(5000);
    expect(screen.getAllByTestId('tender-ledger')).toHaveLength(1);
    expect(within(screen.getByTestId('tender-pane')).queryByTestId('tender-ledger')).toBeNull();
    expect(within(screen.getByTestId('cart-payments')).getByText('Payments')).toBeTruthy();
    expect(text('tender-ledger')).toBe('No payments yet');
    expect(text('tender-ledger-totals')).toBe(`Total${money(5000)}Paid${money(0)}Remaining${money(5000)}`);
    expect(screen.queryByRole('button', { name: /^Checkout/ })).toBeNull();
    expect(within(screen.getByTestId('cart-footer')).queryByRole('button', { name: 'Cash' })).toBeNull();
  });

  it('lists two taken legs in the cart; Cancel payment there voids a leg and Remaining rises', () => {
    start(5000);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 1000 }); });
    act(() => { sale.addTender({ method: 'external', amountMinor: 1500 }); });
    const payments = within(screen.getByTestId('cart-payments'));
    expect(payments.getByTestId(`tender-leg-${leg(0)}`)).toBeTruthy();
    expect(payments.getByTestId(`tender-leg-${leg(1)}`)).toBeTruthy();
    expect(text('tender-ledger-remaining')).toBe(money(2500));
    fireEvent.click(screen.getByTestId(`tender-leg-${leg(1)}-void`));
    expect(text(`tender-leg-${leg(1)}-status`)).toBe('Cancelled');
    expect(text('tender-ledger-remaining')).toBe(money(4000));
  });

  it('reads Paid in full as the lead row once nothing is due', () => {
    start(2000);
    act(() => { sale.addTender({ method: 'cash', amountMinor: 2000 }); });
    expect(text('tender-ledger-lead')).toBe('Paid in full');
    expect(screen.queryByTestId('tender-ledger-remaining')).toBeNull();
    expect(screen.getAllByText('Paid in full')).toHaveLength(1);
  });

  it("titles each leg by its own method id's descriptor, else the id itself", () => {
    const own = (id: string, title: string, kind: string): PaymentMethodDescriptor =>
      ({ ...paymentMethodOf(kind === 'cash' ? 'cash' : 'external'), id, title, kind });
    start(5000, [own('pos_cash', 'Till cash', 'cash'), own('cheque', 'Cheque', 'other')]);
    act(() => { sale.addTender({ method: 'cash', methodId: 'pos_cash', amountMinor: 1000 }); });
    act(() => { sale.addTender({ method: 'external', methodId: 'cheque', amountMinor: 1500 }); });
    act(() => { sale.addTender({ method: 'external', methodId: 'gift_voucher', amountMinor: 500 }); });
    const title = (index: number) => text(`tender-leg-${leg(index)}`)?.split(money(sale.order.payments[index].amountMinor))[0];
    expect([0, 1, 2].map(title)).toEqual(['Till cash', 'Cheque', 'gift_voucher']);
    expect(screen.getByTestId(`tender-leg-${leg(1)}-void`)).toBeTruthy();
    expect(screen.queryByTestId(`tender-leg-${leg(2)}-void`)).toBeNull();
  });
});
