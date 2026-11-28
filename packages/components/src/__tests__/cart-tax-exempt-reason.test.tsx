import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import { META_INVALID } from '@tallyui/pos';
import { Cart } from '../sale/cart';
import { click, SaleHarness, sale } from './sale-harness';

afterEach(cleanup);

function seed(mode?: 'optional' | 'required', orderCreate = 13, checkout = true) {
  const onCheckout = vi.fn();
  render(<><SaleHarness capabilities={{ orderCreate, taxExempt: true, taxExemptReason: mode }}>
    {(sale) => <Cart sale={sale} checkout={checkout ? { onCheckout } : undefined} noteSheet={{}} />}
  </SaleHarness><PortalHost /></>);
  act(() => { sale.addCustomLine({ name: 'Item', priceMinor: 1000 }); });
  return onCheckout;
}

function openDetails() {
  click('More actions');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Order details' }));
  return within(screen.getByTestId('order-note-sheet'));
}

const toggle = () => fireEvent.click(screen.getByRole('switch', { name: 'Tax exempt' }));
const reasonId = 'order-tax-exempt-reason-input';
const certificateId = 'order-tax-exempt-certificate-input';
const alertId = 'cart-tax-exempt-reason-alert';
const change = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });
const pay = () => fireEvent.click(screen.getByTestId('cart-checkout'));

it('R1 omits the fields without the reason capability even when exempt', { timeout: 20_000 }, () => {
  seed(); const sheet = openDetails(); toggle();
  expect(sale.taxExempt).toBe(true);
  expect(sheet.queryByTestId(reasonId)).toBeNull();
  expect(sheet.queryByTestId(certificateId)).toBeNull();
});

it('R2 edits an optional reason and certificate only while exempt', { timeout: 20_000 }, () => {
  seed('optional'); const sheet = openDetails();
  expect(sheet.queryByTestId(reasonId)).toBeNull();
  expect(sheet.queryByTestId(certificateId)).toBeNull();
  toggle();
  expect(sheet.getByRole('textbox', { name: 'Exemption reason' })).toBe(sheet.getByTestId(reasonId));
  expect(sheet.getByRole('textbox', { name: 'Certificate number (optional)' })).toBe(sheet.getByTestId(certificateId));
  change(reasonId, 'Charity'); change(certificateId, 'ST5-0042');
  expect(sale.taxExemptReason).toEqual({ text: 'Charity', certificateId: 'ST5-0042' });
  expect(sheet.queryByTestId('order-tax-exempt-reason-not-sent')).toBeNull();
});

it('R3 turning exemption off clears both fields and the saved reason', { timeout: 20_000 }, () => {
  seed('optional'); openDetails(); toggle();
  change(reasonId, 'Charity'); change(certificateId, 'ST5-0042');
  toggle(); toggle();
  expect(screen.getByTestId<HTMLTextAreaElement>(reasonId).value).toBe('');
  expect(screen.getByTestId<HTMLInputElement>(certificateId).value).toBe('');
  expect(sale.taxExemptReason).toBeNull();
});

it('R4 refusing a certificate-only edit clears the saved reason but keeps the draft', { timeout: 20_000 }, () => {
  seed('optional'); openDetails(); toggle();
  change(reasonId, 'Charity'); change(certificateId, 'ST5-0042'); change(reasonId, '');
  expect(screen.getByTestId('order-tax-exempt-reason-error').getAttribute('role')).toBe('alert');
  expect(sale.taxExemptReason).toBeNull();
  expect(screen.getByTestId<HTMLInputElement>(certificateId).value).toBe('ST5-0042');
});

it('R5 warns before payment when the store cannot receive the reason', { timeout: 20_000 }, () => {
  seed('optional', 12); openDetails(); toggle();
  expect(screen.getByTestId('order-tax-exempt-reason-not-sent').textContent)
    .toBe('This store cannot receive the reason yet. It stays on this till only.');
});

it('R6 Pay directs staff to Order details until the required reason is entered', { timeout: 20_000 }, () => {
  const onCheckout = seed('required'); openDetails(); toggle();
  expect(screen.getByRole('textbox', { name: 'Exemption reason (required)' })).toBe(screen.getByTestId(reasonId));
  click('Close'); pay();
  expect(onCheckout).not.toHaveBeenCalled();
  expect(screen.getByTestId(alertId).textContent).toBe('Add the exemption reason in Order details before payment.');
  click('Order details');
  change(reasonId, 'Charity'); click('Close');
  expect(screen.queryByTestId(alertId)).toBeNull();
  pay(); expect(onCheckout).toHaveBeenCalledTimes(1);
});

it('R7 a non-exempt sale pays without a required reason', { timeout: 20_000 }, () => {
  const onCheckout = seed('required'); pay();
  expect(onCheckout).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId(alertId)).toBeNull();
});

it('R8 the cart outside the sheet never shows the staff-only values', { timeout: 20_000 }, () => {
  seed('optional'); openDetails(); toggle();
  change(reasonId, 'Charity'); change(certificateId, 'ST5-0042'); click('Close');
  expect(screen.queryByTestId('order-note-sheet')).toBeNull();
  expect(document.body.textContent).not.toContain('Charity');
  expect(document.body.textContent).not.toContain('ST5-0042');
});

it.each(['Cash', 'Card terminal'])('%s also refuses payment until the required reason is entered', { timeout: 20_000 }, (button) => {
  seed('required', 13, false);
  act(() => { sale.setTaxExempt(true); });
  click(button);
  expect(sale.stage.kind).toBe('cart');
  expect(screen.getByTestId(alertId)).toBeTruthy();
  click('Order details'); change(reasonId, 'Charity'); click('Close'); click(button);
  expect(sale.stage.kind).toBe('tender');
});

it('R9 omits the not-sent line for a required reason', { timeout: 20_000 }, () => {
  seed('required'); const sheet = openDetails(); toggle(); change(reasonId, 'Charity');
  expect(sale.taxExemptReasonSent).toBe(true);
  expect(sheet.queryByTestId('order-tax-exempt-reason-not-sent')).toBeNull();
});

it('R9b omits the not-sent line when a required reason cannot be sent', { timeout: 20_000 }, () => {
  const onCheckout = vi.fn();
  const tree = (orderCreate: number) => <><SaleHarness capabilities={{ orderCreate, taxExempt: true, taxExemptReason: 'required' }}>
    {(sale) => <Cart sale={sale} checkout={{ onCheckout }} noteSheet={{}} />}
  </SaleHarness><PortalHost /></>;
  const { rerender } = render(tree(13));
  act(() => { sale.addCustomLine({ name: 'Item', priceMinor: 1000 }); });
  const sheet = openDetails(); toggle(); change(reasonId, 'Charity');
  expect(sale.taxExemptReasonSent).toBe(true);
  expect(sheet.queryByTestId('order-tax-exempt-reason-not-sent')).toBeNull();

  rerender(tree(12));
  expect(sale.taxExemptReasonMode).toBe('required');
  expect(sale.taxExempt).toBe(true);
  expect(sale.taxExemptReasonSent).toBe(false);
  const openSheet = within(screen.getByTestId('order-note-sheet'));
  expect(openSheet.getByTestId<HTMLTextAreaElement>(reasonId).value).toBe('Charity');
  expect(openSheet.queryByTestId('order-tax-exempt-reason-not-sent')).toBeNull();
});

it('R10 hides an unrelated sale error after a refused reason edit', { timeout: 20_000 }, () => {
  seed('optional'); const sheet = openDetails(); toggle();
  change(reasonId, 'Charity'); change(certificateId, 'ST5-0042'); change(reasonId, '');
  expect(sheet.getByTestId('order-tax-exempt-reason-error').getAttribute('role')).toBe('alert');
  act(() => { sale.setMeta('', 'invalid'); });
  expect(sale.error).toBe(META_INVALID);
  expect(sheet.queryByTestId('order-tax-exempt-reason-error')).toBeNull();
});

it('R11 opens Order details with the saved reason and certificate', { timeout: 20_000 }, () => {
  seed('optional');
  act(() => {
    sale.setTaxExempt(true);
    sale.setTaxExemptReason({ text: 'Charity', certificateId: 'ST5-0042' });
  });
  const sheet = openDetails();
  expect(sheet.getByTestId<HTMLTextAreaElement>(reasonId).value).toBe('Charity');
  expect(sheet.getByTestId<HTMLInputElement>(certificateId).value).toBe('ST5-0042');
});

it('R12 clearing a previously supplied reason waits for Pay to show the alert again', { timeout: 20_000 }, () => {
  seed('required'); openDetails(); toggle(); click('Close'); pay();
  expect(screen.getByTestId(alertId)).toBeTruthy();
  click('Order details'); change(reasonId, 'Charity'); click('Close');
  expect(screen.queryByTestId(alertId)).toBeNull();
  openDetails(); change(reasonId, ''); click('Close');
  expect(screen.queryByTestId(alertId)).toBeNull();
  pay(); expect(screen.getByTestId(alertId)).toBeTruthy();
});
