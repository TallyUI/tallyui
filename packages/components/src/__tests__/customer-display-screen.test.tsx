import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { formatMoney } from '@tallyui/core';
import { displayCart, initialDisplayState, type DisplayConfig, type DisplayState, type ReceiptData } from '@tallyui/pos';
import { CustomerDisplayScreen } from '../sale/customer-display-screen';

afterEach(() => cleanup());

const money = (amount: number) => formatMoney({ amount, currency: 'USD' }, 'en-US')!;
const config: DisplayConfig = {
  contract: '1.0', display: { id: 'd1', name: 'Counter' },
  store: { id: 's1', name: 'Corner Shop', currency: 'USD', locale: 'en-US' },
  presentation_hints: {}, i18n: { welcome: 'Hello there' }, idle: { afterCompleteMs: 8000 },
};
const receipt: ReceiptData = {
  schemaVersion: '1.4.0', software: { name: 'TallyUI', plugin_version: '', app_version: '', app_build: '', platform: '' },
  register: { id: '', name: '' }, fiscal: { document_type: 'sale', is_reprint: false, reprint_count: 0, qr_payload: '' },
  currency: 'USD', header: { storeName: 'Receipt Shop', orderNumber: '1', date: '' }, footer: {},
  lineItems: [{ name: 'Tea', sku: '', quantity: 2, unitPriceMinor: 150, lineTotalMinor: 300, displayAmountMinor: 300,
    displayDiscounts: [], attributes: { Size: 'Large' } }],
  fees: [], shipping: [], discounts: [], orderDiscountMinor: 0, payments: [{ method: 'cash', amountMinor: 100 }],
  changeDueMinor: 0,
  totals: { taxInclusive: false, subtotalMinor: 300, discountMinor: 0, taxLines: [], taxMinor: 30, totalMinor: 330 },
};
const cart = displayCart(receipt);
const show = (state: DisplayState) => render(<CustomerDisplayScreen state={state} />);

describe('CustomerDisplayScreen', () => {
  it('shows the store and the configured welcome when idle', () => {
    show({ config, view: { screen: 'idle', reason: 'no_cart' } });
    expect(screen.getByTestId('customer-display-idle').textContent).toBe('Corner ShopHello there');
    cleanup();
    show(initialDisplayState);
    expect(screen.getByTestId('customer-display-idle').textContent).toBe('Welcome');
  });

  it('lists the items with their attributes and the totals panel', () => {
    show({ config, view: { screen: 'cart', cart } });
    const text = screen.getByTestId('customer-display-cart').textContent;
    expect(text).toContain(`Your items2 ×TeaSize: Large${money(300)}`);
    expect(text).toContain(`Corner ShopSubtotal${money(300)}Tax${money(30)}Total${money(330)}`);
  });

  it.each([
    ['started', undefined, `Total${money(330)}Paid so far${money(100)}Please present your card${money(230)}`],
    ['declined', undefined, `Declined${money(230)}Please try another card or ask staff`],
    ['approved', 'Thanks', `Approved${money(230)}Thanks`],
    ['complete', undefined, `Paid in full${money(330)}Thank you`],
  ] as const)('shows the %s payment card', (state, message, expected) => {
    show({ config, view: { screen: 'payment', cart, payment: { state, ...(message ? { message } : {}) } } });
    expect(screen.getByTestId('customer-display-payment').textContent).toContain(expected);
  });

  it('shows the leg amount and the change when given', () => {
    show({ config, view: { screen: 'payment', cart, payment: { state: 'started', leg: { method: 'Card', amountMinor: 50 } } } });
    expect(screen.getByTestId('customer-display-payment').textContent).toContain(`Please present your card${money(50)}`);
    cleanup();
    show({ config, view: { screen: 'payment', cart: displayCart({ ...receipt, changeDueMinor: 70 }), payment: { state: 'complete' } } });
    expect(screen.getByTestId('customer-display-payment').textContent).toContain(`Change ${money(70)}Thank you`);
  });
});
