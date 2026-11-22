import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PortalHost } from '@tallyui/primitives';
import { Text } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiptEmailForm, ReceiptSheet, type ReceiptEmailFormProps, type ReceiptSheetEmail } from '../sale';

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

describe('ReceiptSheet with a send that resolves after its form unmounted', () => {
  const TEMPLATES = [{ id: 'r', title: 'Receipt' }];

  it('P1: sheet closed mid-send, send resolves, reopen: one Email Receipt press opens the form', async () => {
    let resolve!: (v: null) => void;
    const props = { templates: TEMPLATES, onPrint: () => {}, onOpenChange: () => {}, email: { defaultAddress: 'a@b.co', onSend: () => new Promise<null>((r) => { resolve = r; }) } };
    const { rerender } = render(<><ReceiptSheet open {...props}><Text>P</Text></ReceiptSheet><PortalHost /></>);
    fireEvent.click(screen.getByTestId('receipt-email-button'));
    send();
    rerender(<><ReceiptSheet open={false} {...props}><Text>P</Text></ReceiptSheet><PortalHost /></>);
    await act(async () => { resolve(null); });
    rerender(<><ReceiptSheet open {...props}><Text>P</Text></ReceiptSheet><PortalHost /></>);
    expect(line()).toBeNull();
    fireEvent.click(screen.getByTestId('receipt-email-button'));
    expect(screen.queryByTestId('receipt-email-form')).not.toBeNull();
  });

  it('P2: form toggled closed mid-send, send resolves: Email sent shows and one press opens the form', async () => {
    let resolve!: (v: null) => void;
    render(<><ReceiptSheet open templates={TEMPLATES} onPrint={() => {}} onOpenChange={() => {}} email={{ defaultAddress: 'a@b.co', onSend: () => new Promise<null>((r) => { resolve = r; }) }}><Text>P</Text></ReceiptSheet><PortalHost /></>);
    fireEvent.click(screen.getByTestId('receipt-email-button'));
    send();
    fireEvent.click(screen.getByTestId('receipt-email-button'));
    await act(async () => { resolve(null); });
    expect(line()?.textContent).toBe('Email sent');
    fireEvent.click(screen.getByTestId('receipt-email-button'));
    expect(screen.queryByTestId('receipt-email-form')).not.toBeNull();
  });
});

describe('ReceiptEmailForm with an empty or thrown refusal', () => {
  const sendOnce = async (onSend: ReceiptSheetEmail['onSend']) => {
    const onDone = vi.fn();
    setup({ defaultAddress: 'a@b.co', onSend }, onDone);
    send();
    await act(async () => {});
    return onDone;
  };

  it('E1: a synchronous empty string shows the default alert and keeps the form', async () => {
    const onDone = await sendOnce(vi.fn(() => ''));
    expect(screen.getByRole('alert').textContent).toBe('Could not send the receipt.');
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
    expect(line()).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('E2: a promise of an empty string shows the default alert and keeps the form', async () => {
    const onDone = await sendOnce(vi.fn(() => Promise.resolve('')));
    expect(screen.getByRole('alert').textContent).toBe('Could not send the receipt.');
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
    expect(line()).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('E3: a synchronous throw shows its message and keeps the form', async () => {
    const onDone = await sendOnce(vi.fn(() => { throw new Error('Mail server down'); }));
    expect(screen.getByRole('alert').textContent).toBe('Mail server down');
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
    expect(line()).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('E4: a synchronous throw with an empty message shows the default alert', async () => {
    const onDone = await sendOnce(vi.fn(() => { throw new Error(''); }));
    expect(screen.getByRole('alert').textContent).toBe('Could not send the receipt.');
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('E5: a rejection with an empty message shows the default alert', async () => {
    const onDone = await sendOnce(vi.fn(() => Promise.reject(new Error(''))));
    expect(screen.getByRole('alert').textContent).toBe('Could not send the receipt.');
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('E6: after an empty refusal a second Send can succeed', async () => {
    const onDone = await sendOnce(vi.fn().mockReturnValueOnce('').mockReturnValueOnce(null));
    expect(screen.getByRole('alert').textContent).toBe('Could not send the receipt.');
    send();
    await waitFor(() => expect(line()?.textContent).toBe('Email sent'));
    expect(onDone).toHaveBeenCalledExactlyOnceWith(false);
  });
});
