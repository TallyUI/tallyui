import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayCart, initialDisplayState, type DisplayClientPhase, type DisplayState, type ReceiptData } from '@tallyui/pos';
import { CustomerDisplayPairing } from '../sale';

afterEach(cleanup);

const receipt: ReceiptData = {
  schemaVersion: '1.4.0', software: { name: 'TallyUI', plugin_version: '', app_version: '', app_build: '', platform: '' },
  register: { id: '', name: '' }, fiscal: { document_type: 'sale', is_reprint: false, reprint_count: 0, qr_payload: '' },
  currency: 'USD', header: { storeName: 'Receipt Shop', orderNumber: '1', date: '' }, footer: {},
  lineItems: [{ name: 'Oolong Tea', sku: '', quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300, displayAmountMinor: 300, displayDiscounts: [] }],
  fees: [], shipping: [], discounts: [], orderDiscountMinor: 0, payments: [], changeDueMinor: 0,
  totals: { taxInclusive: false, subtotalMinor: 300, discountMinor: 0, taxLines: [], taxMinor: 0, totalMinor: 300 },
};
const withCart: DisplayState = { config: null, view: { screen: 'cart', cart: displayCart(receipt) } };
const paired = (online: boolean, source: 'peer' | 'snapshot' = 'peer'): DisplayClientPhase =>
  ({ phase: 'paired', link: source === 'peer' ? 'open' : 'closed', source, online });

const element = (phase: DisplayClientPhase, state: DisplayState, handlers: ReturnType<typeof makeHandlers>) =>
  <CustomerDisplayPairing client={{ phase, state }} {...handlers} />;
const makeHandlers = () => ({ onClaim: vi.fn(), onCancel: vi.fn() });
const show = (phase: DisplayClientPhase, state: DisplayState = initialDisplayState) => {
  const handlers = makeHandlers();
  const view = render(element(phase, state, handlers));
  return { ...handlers, rerender: (next: DisplayClientPhase, nextState: DisplayState = state) => view.rerender(element(next, nextState, handlers)) };
};
const type = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });
const disabled = (id: string) => screen.getByTestId(id).getAttribute('aria-disabled');
const value = (id: string) => (screen.getByTestId(id) as HTMLInputElement).value;

describe('CustomerDisplayPairing', () => {
  it('enter-code: Pair waits for both fields, then claims with the trimmed values', () => {
    const { onClaim } = show({ phase: 'enter-code' });
    expect(value('display-name')).toBe('Customer display');
    expect(screen.getByText('Ask the cashier for a code: Settings › Customer display › Pair a display on the till.')).toBeTruthy();
    expect(screen.queryByTestId('pairing-error')).toBeNull();
    expect(disabled('display-pair')).toBe('true');
    type('display-code', '  482913 ');
    expect(disabled('display-pair')).toBeNull();
    type('display-name', '   ');
    expect(disabled('display-pair')).toBe('true');
    fireEvent.click(screen.getByTestId('display-pair'));
    expect(onClaim).not.toHaveBeenCalled();
    type('display-name', ' Front counter ');
    type('display-code', '   ');
    expect(disabled('display-pair')).toBe('true');
    type('display-code', ' 482913');
    fireEvent.click(screen.getByTestId('display-pair'));
    expect(onClaim).toHaveBeenCalledWith('482913', 'Front counter');
  });

  it('starts the name at defaultName', () => {
    render(<CustomerDisplayPairing client={{ phase: { phase: 'enter-code' }, state: initialDisplayState }} onClaim={vi.fn()} onCancel={vi.fn()} defaultName="Till 2 screen" />);
    expect(value('display-name')).toBe('Till 2 screen');
  });

  it.each([
    ['claim_refused', "That code didn't work. Check it on the till and try again."],
    ['collect_refused', 'The till declined, or the code expired. Enter a new code.'],
    ['forgotten', 'This display was removed from its till. Enter a new code to pair it again.'],
    ['network', "Can't reach the store. Check the connection and try again."],
    ['server', "The store couldn't finish that. Try again."],
  ] as const)('enter-code with %s shows its message', (error, message) => {
    show({ phase: 'enter-code', error });
    expect(screen.getByTestId('pairing-error').textContent).toBe(message);
  });

  it('claiming keeps the typed values with the fields and the button disabled', () => {
    const { onClaim, rerender } = show({ phase: 'enter-code' });
    type('display-code', '482913');
    rerender({ phase: 'claiming' });
    expect(value('display-code')).toBe('482913');
    expect(disabled('display-pair')).toBe('true');
    expect(screen.getByTestId('display-pair').querySelector('[role="progressbar"]')).not.toBeNull();
    expect(screen.getByTestId('display-code').hasAttribute('readonly')).toBe(true);
    expect(screen.getByTestId('display-name').hasAttribute('readonly')).toBe(true);
    fireEvent.click(screen.getByTestId('display-pair'));
    expect(onClaim).not.toHaveBeenCalled();
  });

  it('waiting shows the check code, and Cancel cancels', () => {
    const { onCancel } = show({ phase: 'waiting', checkCode: '4821' });
    expect(screen.getByText('Check code')).toBeTruthy();
    expect(screen.getByTestId('display-check-code').textContent).toBe('4821');
    expect(screen.getByText('Make sure the till shows the same code, then the cashier confirms.')).toBeTruthy();
    expect(screen.queryByTestId('display-code')).toBeNull();
    fireEvent.click(screen.getByTestId('display-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('paired renders the sale from state, with Offline only while offline', () => {
    const { rerender } = show(paired(true), withCart);
    expect(screen.getByTestId('customer-display-cart').textContent).toContain('Oolong Tea');
    expect(screen.queryByText('Offline')).toBeNull();
    rerender(paired(false));
    expect(screen.getByTestId('customer-display-cart').textContent).toContain('Oolong Tea');
    expect(screen.getByTestId('display-offline').textContent).toBe('Offline');
  });

  it('paired on the snapshot adds nothing to the sale', () => {
    show(paired(true, 'snapshot'), withCart);
    expect(screen.getByTestId('display-paired').textContent).toBe(screen.getByTestId('customer-display-cart').textContent);
  });

  it('forgotten: from paired back to enter-code clears the sale and shows its message and the code field', () => {
    const { rerender } = show(paired(true), withCart);
    expect(screen.getByText('Oolong Tea')).toBeTruthy();
    rerender({ phase: 'enter-code', error: 'forgotten' }, initialDisplayState);
    expect(screen.queryByText('Oolong Tea')).toBeNull();
    expect(screen.queryByTestId('display-paired')).toBeNull();
    expect(screen.getByTestId('pairing-error').textContent).toBe('This display was removed from its till. Enter a new code to pair it again.');
    expect(value('display-code')).toBe('');
  });

  it('starting shows a loader and no form', () => {
    show({ phase: 'starting' });
    expect(screen.getByTestId('display-starting').getAttribute('role')).toBe('progressbar');
    expect(screen.queryByTestId('display-code')).toBeNull();
    expect(screen.queryByTestId('display-pair')).toBeNull();
  });
});
