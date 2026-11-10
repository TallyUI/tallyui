import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { refundPayloadErrors } from '@tallyui/core/server';
import { PortalHost } from '@tallyui/primitives';
import { RefundForm, type RefundFormProps } from '../order/refund-form';
import { RefundModal } from '../order/refund-modal';

const fixture = {
  lines: [
    { id: 'line-a', name: 'Shirt', quantity: 3, totalMinor: 1000, taxMinor: 200 },
    { id: 'line-b', name: 'Mug', quantity: 1, totalMinor: 500, taxMinor: 100 },
  ],
  refunds: [{ lines: [{ orderLineId: 'line-a', quantity: 1 }] }],
  currency: 'EUR', orderReference: '1042', orderTotalMinor: 1800, refundedMinor: 400,
};
const eur = (minor: number) => formatMoney({ amount: minor, currency: 'EUR' });
const plus = (id: string) => fireEvent.click(within(screen.getByTestId(`refund-qty-${id}`)).getByText('+'));

afterEach(() => cleanup());

function renderForm(overrides: Partial<RefundFormProps> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props = { ...fixture, onConfirm, onCancel, ...overrides };
  return { ...render(<RefundForm {...props} />), props, onConfirm, onCancel };
}

it("shows each line's refundable quantity and clamps the stepper at it", () => {
  const { rerender, props } = renderForm();
  expect(screen.getByTestId('refund-remaining-line-a').textContent).toBe('2');
  expect(screen.getByTestId('refund-remaining-line-b').textContent).toBe('1');
  plus('line-a');
  plus('line-a');
  plus('line-a');
  const stepped = () => within(screen.getByTestId('refund-qty-line-a')).queryByText(/^\d+$/)?.textContent;
  expect(stepped()).toBe('2');
  expect(screen.getByTestId('refund-line-amount-line-a').textContent).toBe(eur(800));
  expect(screen.getByTestId('refund-total').textContent).toBe(eur(800));
  rerender(<RefundForm {...props} refunds={[{ lines: [{ orderLineId: 'line-a', quantity: 2 }] }]} />);
  expect(stepped()).toBe('1');
  expect(screen.getByTestId('refund-remaining-line-a').textContent).toBe('1');
  expect(screen.getByTestId('refund-line-amount-line-a').textContent).toBe(eur(400));
});

it('hands back the payload priced by priceRefund', async () => {
  const { onConfirm } = renderForm({
    refundableShippingMinor: 500, originalMethod: { title: 'Card', available: true },
  });
  plus('line-a');
  plus('line-b');
  fireEvent.click(screen.getByTestId('refund-restock-line-b'));
  expect(screen.getByTestId('refund-restock-line-b').getAttribute('aria-checked')).toBe('false');
  fireEvent.change(screen.getByTestId('refund-shipping'), { target: { value: '2,50' } });
  fireEvent.change(screen.getByTestId('refund-adjustment'), { target: { value: '-1.00' } });
  fireEvent.change(screen.getByTestId('refund-reason'), { target: { value: ' Damaged ' } });
  expect(screen.getByTestId('refund-destination-original_method').getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByTestId('refund-destination-cash'));
  expect(screen.getByTestId('refund-total').textContent).toBe(eur(1150));
  expect(screen.getByTestId('refund-submit').textContent).toBe(`Refund ${eur(1150)} in cash`);
  fireEvent.click(screen.getByTestId('refund-submit'));
  expect(screen.getByTestId('refund-confirm-text').textContent).toBe(`Refund ${eur(1150)} for Order #1042?`);
  fireEvent.click(screen.getByTestId('refund-confirm'));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  const value = onConfirm.mock.calls[0][0];
  expect(value).toStrictEqual({
    lines: [
      { orderLineId: 'line-a', quantity: 1, restock: true },
      { orderLineId: 'line-b', quantity: 1, restock: false },
    ],
    shippingMinor: 250, adjustmentMinor: -100, totalMinor: 1150, destination: 'cash', reason: 'Damaged',
  });
  expect(refundPayloadErrors({
    clientRefundId: 'refund-1', orderId: 'order-1', registerId: 'register-1', sessionId: 'session-1',
    createdAt: '2026-11-10T10:00:00.000Z', ...value,
  })).toStrictEqual([]);
});

it('disables confirm without a reason or with nothing to refund', () => {
  renderForm();
  const submit = screen.getByTestId('refund-submit') as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(submit.textContent).toBe('Process Refund');
  expect(screen.getByTestId('refund-invalid').textContent).toBe('Choose something to refund.');
  fireEvent.change(screen.getByTestId('refund-reason'), { target: { value: 'Damaged' } });
  expect(submit.disabled).toBe(true);
  expect(screen.getByTestId('refund-invalid').textContent).toBe('Choose something to refund.');
  plus('line-b');
  expect(submit.disabled).toBe(false);
  fireEvent.change(screen.getByTestId('refund-reason'), { target: { value: '   ' } });
  expect(submit.disabled).toBe(true);
  expect(screen.getByTestId('refund-invalid').textContent).toBe('Enter a reason.');
  fireEvent.change(screen.getByTestId('refund-reason'), { target: { value: 'Damaged' } });
  fireEvent.change(screen.getByTestId('refund-adjustment'), { target: { value: '-7.00' } });
  expect(submit.disabled).toBe(true);
  expect(screen.getByTestId('refund-invalid').textContent).toBe('The refund total must be more than 0.');
  fireEvent.change(screen.getByTestId('refund-adjustment'), { target: { value: '9.00' } });
  expect(submit.disabled).toBe(true);
  expect(screen.getByTestId('refund-invalid').textContent).toBe(`You can refund at most ${eur(1400)}.`);
  fireEvent.change(screen.getByTestId('refund-adjustment'), { target: { value: 'abc' } });
  expect(submit.disabled).toBe(true);
  expect(screen.getByTestId('refund-invalid').textContent).toBe('Enter a number.');
});

it('refunds a cash sale in cash and falls back when the original method is unavailable', () => {
  const { rerender, props } = renderForm();
  expect(screen.queryByTestId('refund-destination-cash')).toBeNull();
  plus('line-b');
  fireEvent.change(screen.getByTestId('refund-reason'), { target: { value: 'Damaged' } });
  expect(screen.getByTestId('refund-submit').textContent).toBe(`Refund ${eur(600)} in cash`);
  rerender(<RefundForm {...props} originalMethod={{ title: 'Card', available: false }} />);
  expect(screen.getByTestId('refund-destination-cash').getAttribute('aria-selected')).toBe('true');
  expect(screen.getByText('Original payment method refunds are unavailable for this order.')).toBeTruthy();
  expect(screen.getByTestId('refund-submit').textContent).toBe(`Refund ${eur(600)} in cash`);
  rerender(<RefundForm {...props} originalMethod={{ title: 'Card', available: true }} />);
  expect(screen.getByTestId('refund-submit').textContent).toBe(`Refund ${eur(600)} to the original method`);
});

it('caps shipping at what is refundable and hides it when there is none', () => {
  const { rerender, props } = renderForm();
  expect(screen.queryByTestId('refund-shipping')).toBeNull();
  rerender(<RefundForm {...props} refundableShippingMinor={500} />);
  fireEvent.change(screen.getByTestId('refund-shipping'), { target: { value: '6' } });
  expect(screen.getByTestId('refund-invalid').textContent).toBe(`Shipping can be at most ${eur(500)}.`);
});

it('offline disables confirming and says why', () => {
  renderForm({ online: false });
  plus('line-b');
  fireEvent.change(screen.getByTestId('refund-reason'), { target: { value: 'Damaged' } });
  expect((screen.getByTestId('refund-submit') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId('refund-offline-reason').textContent).toBe('Refunds need a connection');
});

it('calls onConfirm once for a double tap and shows a thrown refusal', async () => {
  const onConfirm = vi.fn(() => Promise.reject(new Error('no_open_session')));
  renderForm({ onConfirm });
  plus('line-b');
  fireEvent.change(screen.getByTestId('refund-reason'), { target: { value: 'Damaged' } });
  fireEvent.click(screen.getByTestId('refund-submit'));
  act(() => {
    fireEvent.click(screen.getByTestId('refund-confirm'));
    fireEvent.click(screen.getByTestId('refund-confirm'));
  });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByTestId('refund-error').textContent).toContain('no_open_session'));
});

it('RefundModal titles the order and closes from Cancel', () => {
  const onOpenChange = vi.fn();
  render(<>
    <RefundModal {...fixture} open onOpenChange={onOpenChange} onConfirm={vi.fn()} />
    <PortalHost />
  </>);
  expect(screen.getByText('Refund Order #1042')).toBeTruthy();
  fireEvent.click(screen.getByTestId('refund-cancel'));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
