import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerServiceError, type Customer, type CustomerInput, type CustomerPatch } from '@tallyui/core';
import { toCustomerInput } from '@tallyui/pos';
import { CustomerEditor, type CustomerEditorProps } from '../customer/customer-editor';

const before: Customer = { id: 'c1', name: 'Ann Lee', firstName: 'Ann', lastName: 'Lee', email: 'a@x.io', billing: { firstName: 'Ann', lastName: 'Lee', email: 'a@x.io', city: 'Hull' } };
const saved: Customer = { id: 'c2', name: 'Bo', firstName: 'Bo', email: 'b@x.io' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const typeIn = (placeholder: string, value: string) => fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
const press = (testID: string) => fireEvent.click(screen.getByTestId(testID));
const save = () => screen.getByTestId('customer-editor-save');
const disabled = () => save().getAttribute('aria-disabled') === 'true';
function mount(props: Partial<CustomerEditorProps> = {}) {
  const create = vi.fn<(input: CustomerInput) => Promise<Customer>>(async () => saved);
  const update = vi.fn<(id: string, patch: CustomerPatch) => Promise<Customer>>(async () => saved);
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const view = render(<CustomerEditor create={create} update={update} onSaved={onSaved} onCancel={onCancel} online {...props} />);
  return { create: (props.create ?? create) as typeof create, update: (props.update ?? update) as typeof update, onSaved, onCancel, ...view };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CustomerEditor', { timeout: 20_000 }, () => {
  it('E1 add: trims the values and creates the toCustomerInput of them, then calls onSaved with the result', async () => {
    const { create, onSaved } = mount();
    expect(save().textContent).toBe('Add Customer');
    typeIn('First name', 'Bo');
    typeIn('email@example.com', ' b@x.io ');
    await act(async () => { press('customer-editor-save'); });
    expect(create).toHaveBeenCalledExactlyOnceWith(toCustomerInput({ firstName: 'Bo', lastName: '', email: 'b@x.io', phone: '', company: undefined, billing: undefined, shipping: undefined }));
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(saved);
  });

  it('E2 edit: a changed last name updates with the patch, billing and shipping following', async () => {
    const { update, create } = mount({ customer: before });
    expect(save().textContent).toBe('Save');
    typeIn('Last name', 'Ray');
    await act(async () => { press('customer-editor-save'); });
    expect(update).toHaveBeenCalledExactlyOnceWith('c1', { lastName: 'Ray', billing: { firstName: 'Ann', lastName: 'Ray', email: 'a@x.io', city: 'Hull' }, shipping: { firstName: 'Ann', lastName: 'Ray', city: 'Hull' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('E3 edit: Save with no change calls onSaved with the customer and makes no call', async () => {
    const { update, onSaved } = mount({ customer: before });
    await act(async () => { press('customer-editor-save'); });
    expect(update).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(before);
  });

  it('E4 add: an invalid email shows the email error and makes no call', async () => {
    const { create } = mount();
    typeIn('email@example.com', 'nope');
    await act(async () => { press('customer-editor-save'); });
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByTestId('customer-editor-form-email-error').textContent).toBe('Enter a valid email address (up to 254 characters)');
  });

  it('E5 offline: Save is disabled and pressing it makes no call', async () => {
    const { create } = mount({ online: false });
    typeIn('email@example.com', 'b@x.io');
    expect(disabled()).toBe(true);
    await act(async () => { press('customer-editor-save'); });
    expect(create).not.toHaveBeenCalled();
  });

  it('E6 a save in flight disables Save, and a second press makes no second call', async () => {
    const create = vi.fn<(input: CustomerInput) => Promise<Customer>>(() => new Promise<Customer>(() => {}));
    mount({ create });
    typeIn('email@example.com', 'b@x.io');
    await act(async () => { press('customer-editor-save'); });
    await act(async () => { press('customer-editor-save'); });
    expect(create).toHaveBeenCalledTimes(1);
    expect(disabled()).toBe(true);
  });

  it('E7 a failed save shows the cashier text and enables Save again', async () => {
    const create = vi.fn<(input: CustomerInput) => Promise<Customer>>(async () => { throw new CustomerServiceError('network', 'x'); });
    const { onSaved } = mount({ create });
    typeIn('email@example.com', 'b@x.io');
    await act(async () => { press('customer-editor-save'); });
    expect(screen.getByTestId('customer-editor-error').textContent).toBe("Couldn't reach the store. Try again.");
    expect(disabled()).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('E8 Cancel calls onCancel and makes no store call', () => {
    const { create, update, onCancel } = mount();
    press('customer-editor-cancel');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('E9 a create that resolves after unmount calls no onSaved and warns nothing', async () => {
    const error = vi.spyOn(console, 'error');
    const response = deferred<Customer>();
    const create = vi.fn<(input: CustomerInput) => Promise<Customer>>(() => response.promise);
    const { onSaved, unmount } = mount({ create });
    typeIn('email@example.com', 'b@x.io');
    await act(async () => { press('customer-editor-save'); });
    expect(create).toHaveBeenCalledTimes(1);
    unmount();
    response.resolve(saved);
    await act(async () => {});
    expect(onSaved).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('E10 a shipping equal to billing starts as Same as billing', async () => {
    const customer: Customer = { ...before, shipping: { firstName: 'Ann', lastName: 'Lee', city: 'Hull' } };
    const { update } = mount({ customer });
    expect(screen.getByTestId('customer-editor-form-addresses-shipping-linked').textContent).toBe('Same as billing');
    // Linked, a billing change carries shipping as billing's copy.
    press('customer-editor-form-addresses-billing-edit');
    fireEvent.change(screen.getByTestId('customer-editor-form-addresses-billing-city'), { target: { value: 'York' } });
    await act(async () => { press('customer-editor-save'); });
    expect(update.mock.calls[0]?.[1].shipping).toStrictEqual({ firstName: 'Ann', lastName: 'Lee', city: 'York' });
  });
});
