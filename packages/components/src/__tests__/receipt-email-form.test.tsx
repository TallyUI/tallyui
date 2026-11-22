import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiptEmailForm, type ReceiptEmailFormProps, type ReceiptSheetEmail } from '../sale';

afterEach(cleanup);

function setup(email: ReceiptSheetEmail, onDone?: ReceiptEmailFormProps['onDone']) {
  render(<ReceiptEmailForm email={email} onDone={onDone} />);
}
const line = () => screen.queryByTestId('receipt-email-sent');
const send = () => fireEvent.click(screen.getByTestId('receipt-email-send'));
const typeAddress = (value: string) => fireEvent.change(screen.getByTestId('receipt-email-address'), { target: { value } });

describe('ReceiptEmailForm', () => {
  it('F1: online, a null from a promise replaces the form with Email sent and calls onDone(false) once', async () => {
    const onDone = vi.fn();
    const onSend = vi.fn(() => Promise.resolve(null));
    setup({ onSend }, onDone);
    expect(line()).toBeNull();
    typeAddress(' a@b.co ');
    send();
    await waitFor(() => expect(line()?.textContent).toBe('Email sent'));
    expect(onSend).toHaveBeenCalledExactlyOnceWith({ address: 'a@b.co', saveToCustomer: false });
    expect(screen.queryByTestId('receipt-email-form')).toBeNull();
    expect(screen.queryByTestId('receipt-email-address')).toBeNull();
    expect(screen.queryByTestId('receipt-email-send')).toBeNull();
    expect(onDone).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('F2: offline, a synchronous null says Receipt email queued and calls onDone(true)', async () => {
    const onDone = vi.fn();
    setup({ offline: true, defaultAddress: 'jo@shop.co', onSend: vi.fn(() => null) }, onDone);
    send();
    await waitFor(() => expect(line()?.textContent).toBe('Receipt email queued'));
    expect(screen.queryByTestId('receipt-email-form')).toBeNull();
    expect(onDone).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('F3: without onDone, a send still shows the line and nothing throws', async () => {
    setup({ defaultAddress: 'jo@shop.co', onSend: vi.fn(() => Promise.resolve(null)) });
    send();
    await waitFor(() => expect(line()?.textContent).toBe('Email sent'));
    expect(screen.queryByTestId('receipt-email-form')).toBeNull();
  });

  it('F4: a refusal shows the alert, keeps the form and draws no line', async () => {
    const onDone = vi.fn();
    setup({ defaultAddress: 'a@b.co', onSend: vi.fn(() => 'Store email is off') }, onDone);
    send();
    await act(async () => {});
    expect(screen.getByRole('alert').textContent).toBe('Store email is off');
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
    expect(line()).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('F5: the line stays after a rerender until the form is remounted with a new key', async () => {
    const email = { defaultAddress: 'jo@shop.co', onSend: vi.fn(() => null) };
    const { rerender } = render(<ReceiptEmailForm key={0} email={email} />);
    send();
    await waitFor(() => expect(line()?.textContent).toBe('Email sent'));
    rerender(<ReceiptEmailForm key={0} email={email} />);
    expect(line()?.textContent).toBe('Email sent');
    rerender(<ReceiptEmailForm key={1} email={email} />);
    expect(line()).toBeNull();
    expect((screen.getByTestId('receipt-email-address') as HTMLInputElement).value).toBe('jo@shop.co');
  });
});
