import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { PortalHost } from '@tallyui/primitives';
import { ReceiptSheet, type ReceiptSheetProps } from '../sale';
import { I18nProvider } from '../i18n';

afterEach(cleanup);

const TEMPLATES = [
  { id: 'receipt', title: 'Receipt' },
  { id: 'gift', title: 'Gift receipt' },
  { id: 'kitchen', title: 'Kitchen ticket', disabled: true },
];

function setup(props: Partial<ReceiptSheetProps> = {}) {
  const onOpenChange = vi.fn();
  const onPrint = vi.fn();
  render(
    <>
      <ReceiptSheet open onOpenChange={onOpenChange} templates={TEMPLATES} templateId="receipt" onPrint={onPrint} {...props}>
        <Text testID="preview">The preview</Text>
      </ReceiptSheet>
      <PortalHost />
    </>,
  );
  return { onOpenChange, onPrint };
}
const print = () => screen.getByTestId('receipt-print-button');
const openForm = () => fireEvent.click(screen.getByTestId('receipt-email-button'));
const address = () => screen.getByTestId('receipt-email-address') as HTMLInputElement;
const send = () => screen.getByTestId('receipt-email-send');
const typeAddress = (value: string) => fireEvent.change(address(), { target: { value } });

describe('ReceiptSheet', () => {
  it('shows the title, the preview, Template and Printer rows, and Close and Print receipt', () => {
    setup();
    expect(screen.getByTestId('receipt-dialog')).toBeTruthy();
    expect(screen.getAllByText('Receipt').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('preview').textContent).toBe('The preview');
    expect(screen.getByTestId('print-sheet-template').textContent).toContain('Template');
    expect(screen.getByTestId('receipt-template-select').textContent).toContain('Receipt');
    expect(screen.getByTestId('print-sheet-printer').textContent).toBe('PrinterBrowser print dialog');
    expect(screen.getByTestId('receipt-close-button').textContent).toBe('Close');
    expect(print().textContent).toBe('Print receipt');
    expect(screen.queryByTestId('receipt-email-button')).toBeNull();
  });

  it('takes the title and printer label it is given', () => {
    setup({ title: 'Refund receipt', printerLabel: 'Front counter' });
    expect(screen.getByText('Refund receipt')).toBeTruthy();
    expect(screen.getByTestId('print-sheet-printer').textContent).toBe('PrinterFront counter');
  });

  it('with one template, shows its title instead of a picker; and with none, no Template row', () => {
    setup({ templates: [{ id: 'gift', title: 'Gift receipt' }], templateId: 'gift' });
    expect(screen.getByTestId('print-sheet-template').textContent).toBe('TemplateGift receipt');
    expect(screen.queryByTestId('receipt-template-select')).toBeNull();
    cleanup();
    setup({ templates: [] });
    expect(screen.queryByTestId('print-sheet-template')).toBeNull();
    expect(screen.getByTestId('print-sheet-printer')).toBeTruthy();
  });

  it('shows the placeholder when no template is chosen', () => {
    setup({ templateId: undefined });
    expect(screen.getByTestId('receipt-template-select').textContent).toContain('Select template');
  });

  it('choosing a template calls onTemplateChange with its id, and a disabled template cannot be chosen', () => {
    const onTemplateChange = vi.fn();
    setup({ onTemplateChange });
    fireEvent.click(screen.getByTestId('receipt-template-select'));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Receipt', 'Gift receipt', 'Kitchen ticket']);
    expect(screen.getByTestId('receipt-template-kitchen').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByTestId('receipt-template-kitchen'));
    expect(onTemplateChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('receipt-template-gift'));
    expect(onTemplateChange).toHaveBeenCalledExactlyOnceWith('gift');
  });

  it('Print calls onPrint; while printing it is disabled; once printed it reads Print again', () => {
    const { onPrint } = setup();
    fireEvent.click(print());
    expect(onPrint).toHaveBeenCalledTimes(1);
    cleanup();
    const busy = setup({ printing: true });
    expect(print().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('progressbar')).toBeTruthy();
    fireEvent.click(print());
    expect(busy.onPrint).not.toHaveBeenCalled();
    cleanup();
    setup({ printed: true });
    expect(print().textContent).toBe('Print again');
    expect(print().getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('Email Receipt is drawn only with onEmail and calls it', () => {
    const onEmail = vi.fn();
    setup({ onEmail });
    const email = screen.getByTestId('receipt-email-button');
    expect(email.textContent).toBe('Email Receipt');
    fireEvent.click(email);
    expect(onEmail).toHaveBeenCalledTimes(1);
    cleanup();
    setup();
    expect(screen.queryByTestId('receipt-email-button')).toBeNull();
  });

  it('with email, Email Receipt opens the form with the address prefilled', () => {
    setup({ email: { defaultAddress: 'jo@shop.co', onSend: vi.fn() } });
    expect(screen.queryByTestId('receipt-email-form')).toBeNull();
    expect(screen.getByTestId('receipt-email-button').textContent).toBe('Email Receipt');
    openForm();
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
    expect(address().value).toBe('jo@shop.co');
    expect(address().getAttribute('aria-label')).toBe('Email Address');
    expect(send().textContent).toBe('Send');
    expect(screen.queryByTestId('receipt-email-error')).toBeNull();
  });

  it('Send calls onSend with the trimmed address and the switch value, then closes the form', async () => {
    const onSend = vi.fn(() => Promise.resolve(null));
    setup({ email: { saveToCustomer: true, onSend } });
    openForm();
    typeAddress('  a@b.co  ');
    const save = screen.getByTestId('receipt-email-save');
    expect(save.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(save);
    expect(save.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(send());
    expect(onSend).toHaveBeenCalledExactlyOnceWith({ address: 'a@b.co', saveToCustomer: true });
    await waitFor(() => expect(screen.queryByTestId('receipt-email-form')).toBeNull());
  });

  it('an address without @ is refused inline and onSend is not called', () => {
    const onSend = vi.fn(() => null);
    setup({ email: { onSend } });
    openForm();
    typeAddress('ab.co');
    fireEvent.click(send());
    expect(screen.getByRole('alert').textContent).toBe('Enter an email address.');
    expect(screen.getByTestId('receipt-email-error').textContent).toBe('Enter an email address.');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
  });

  it('a refusal from onSend shows and the form stays open with the address', async () => {
    const onSend = vi.fn(() => 'Store email is off');
    setup({ email: { onSend } });
    openForm();
    typeAddress('a@b.co');
    fireEvent.click(send());
    await act(async () => {});
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe('Store email is off');
    expect(address().value).toBe('a@b.co');
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
  });

  it('a rejected onSend shows its message, or a fallback, and the form stays open', async () => {
    const onSend = vi.fn().mockRejectedValueOnce(new Error('Network down')).mockRejectedValueOnce('nope');
    setup({ email: { defaultAddress: 'a@b.co', onSend } });
    openForm();
    fireEvent.click(send());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Network down'));
    fireEvent.click(send());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Could not send the receipt.'));
    expect(address().value).toBe('a@b.co');
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
  });

  it('while onSend is pending, Send is busy and cannot be pressed again', async () => {
    let resolve: (value: string | null) => void = () => {};
    const onSend = vi.fn(() => new Promise<string | null>((done) => { resolve = done; }));
    setup({ email: { defaultAddress: 'a@b.co', onSend } });
    openForm();
    fireEvent.click(send());
    expect(send().getAttribute('aria-disabled')).toBe('true');
    expect(send().querySelector('[role="progressbar"]')).not.toBeNull();
    fireEvent.click(send());
    expect(onSend).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(null); });
    await waitFor(() => expect(screen.queryByTestId('receipt-email-form')).toBeNull());
  });

  it('offline: the notice shows and the button reads Send when online', () => {
    setup({ email: { offline: true, onSend: vi.fn() } });
    openForm();
    expect(screen.getByTestId('receipt-email-offline').textContent).toBe(
      'This device can’t reach your store right now. The receipt will be emailed automatically when the connection returns.');
    expect(send().textContent).toBe('Send when online');
    cleanup();
    setup({ email: { onSend: vi.fn() } });
    openForm();
    expect(screen.queryByTestId('receipt-email-offline')).toBeNull();
    expect(send().textContent).toBe('Send');
  });

  it('the save switch is drawn only when saveToCustomer is true; without email the form is never drawn and onEmail still works', () => {
    setup({ email: { saveToCustomer: true, onSend: vi.fn() } });
    openForm();
    expect(screen.getByTestId('receipt-email-save-row').textContent).toBe('Save email to the customer');
    expect(screen.getByTestId('receipt-email-save')).toBeTruthy();
    cleanup();
    setup({ email: { onSend: vi.fn() } });
    openForm();
    expect(screen.queryByTestId('receipt-email-save')).toBeNull();
    cleanup();
    const onEmail = vi.fn();
    setup({ onEmail });
    openForm();
    expect(onEmail).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('receipt-email-form')).toBeNull();
  });

  it('with email, onEmail is not called, the button toggles the form, and each opening starts fresh', () => {
    const onEmail = vi.fn();
    setup({ onEmail, email: { defaultAddress: 'jo@shop.co', saveToCustomer: true, onSend: vi.fn() } });
    openForm();
    typeAddress('ab.co');
    fireEvent.click(screen.getByTestId('receipt-email-save'));
    fireEvent.click(send());
    expect(screen.getByRole('alert')).toBeTruthy();
    openForm();
    expect(screen.queryByTestId('receipt-email-form')).toBeNull();
    openForm();
    expect(address().value).toBe('jo@shop.co');
    expect(screen.getByTestId('receipt-email-save').getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByTestId('receipt-email-error')).toBeNull();
    expect(onEmail).not.toHaveBeenCalled();
  });

  it('closing the sheet closes the form', () => {
    const props = { templates: TEMPLATES, onPrint: vi.fn(), onOpenChange: vi.fn(), email: { onSend: vi.fn() } };
    const { rerender } = render(<><ReceiptSheet open {...props}><Text>Preview</Text></ReceiptSheet><PortalHost /></>);
    openForm();
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
    rerender(<><ReceiptSheet open={false} {...props}><Text>Preview</Text></ReceiptSheet><PortalHost /></>);
    rerender(<><ReceiptSheet open {...props}><Text>Preview</Text></ReceiptSheet><PortalHost /></>);
    expect(screen.getByTestId('receipt-email-button')).toBeTruthy();
    expect(screen.queryByTestId('receipt-email-form')).toBeNull();
  });

  it('the header close icon closes the sheet', () => {
    const { onOpenChange } = setup();
    const close = screen.getByTestId('receipt-dialog-close');
    expect(close.getAttribute('aria-label')).toBe('Close');
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('Print shows the printer icon, and the loader in its place while printing', () => {
    setup();
    expect(print().querySelector('svg')).not.toBeNull();
    expect(print().querySelector('[role="progressbar"]')).toBeNull();
    cleanup();
    setup({ printing: true });
    expect(print().querySelector('[role="progressbar"]')).not.toBeNull();
    expect(print().querySelector('svg')).toBeNull();
  });

  it('Close calls onOpenChange(false)', () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByTestId('receipt-close-button'));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});

describe('email sent line', () => {
  const line = () => screen.queryByTestId('receipt-email-sent');

  it('S1: a null from a promise closes the form and says Email sent', async () => {
    setup({ email: { onSend: vi.fn(() => Promise.resolve(null)) } });
    openForm();
    expect(line()).toBeNull();
    typeAddress('a@b.co');
    fireEvent.click(send());
    await waitFor(() => expect(screen.queryByTestId('receipt-email-form')).toBeNull());
    expect(line()?.textContent).toBe('Email sent');
    expect(screen.queryByTestId('receipt-email-error')).toBeNull();
  });

  it('S2: offline, a synchronous null says Receipt email queued', async () => {
    setup({ email: { offline: true, onSend: vi.fn(() => null) } });
    openForm();
    typeAddress('a@b.co');
    fireEvent.click(send());
    await waitFor(() => expect(screen.queryByTestId('receipt-email-form')).toBeNull());
    expect(line()?.textContent).toBe('Receipt email queued');
  });

  it('S3: a refusal or a rejection shows the alert and no sent line', async () => {
    setup({ email: { defaultAddress: 'a@b.co', onSend: vi.fn(() => 'Store email is off') } });
    openForm();
    fireEvent.click(send());
    await act(async () => {});
    expect(screen.getByRole('alert').textContent).toBe('Store email is off');
    expect(line()).toBeNull();
    cleanup();
    setup({ email: { defaultAddress: 'a@b.co', onSend: vi.fn().mockRejectedValueOnce(new Error('Network down')) } });
    openForm();
    fireEvent.click(send());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Network down'));
    expect(line()).toBeNull();
  });

  it('S4: opening the form again clears the line, and closing it unsent shows none', async () => {
    setup({ email: { defaultAddress: 'jo@shop.co', onSend: vi.fn(() => Promise.resolve(null)) } });
    openForm();
    typeAddress('a@b.co');
    fireEvent.click(send());
    await waitFor(() => expect(line()?.textContent).toBe('Email sent'));
    openForm();
    expect(screen.getByTestId('receipt-email-form')).toBeTruthy();
    expect(address().value).toBe('jo@shop.co');
    expect(line()).toBeNull();
    openForm();
    expect(screen.queryByTestId('receipt-email-form')).toBeNull();
    expect(line()).toBeNull();
  });

  it('S5: closing the sheet clears the line', async () => {
    const props = { templates: TEMPLATES, onPrint: vi.fn(), onOpenChange: vi.fn(), email: { onSend: vi.fn(() => Promise.resolve(null)) } };
    const { rerender } = render(<><ReceiptSheet open {...props}><Text>Preview</Text></ReceiptSheet><PortalHost /></>);
    openForm();
    typeAddress('a@b.co');
    fireEvent.click(send());
    await waitFor(() => expect(line()?.textContent).toBe('Email sent'));
    rerender(<><ReceiptSheet open={false} {...props}><Text>Preview</Text></ReceiptSheet><PortalHost /></>);
    rerender(<><ReceiptSheet open {...props}><Text>Preview</Text></ReceiptSheet><PortalHost /></>);
    expect(screen.getByTestId('receipt-email-button')).toBeTruthy();
    expect(line()).toBeNull();
  });

  it('S6: the line reads the catalogue of the nearest I18nProvider', async () => {
    render(
      <I18nProvider locale="fr" resources={{ fr: { 'receipt.email_sent': 'E-mail envoyé' } }}>
        <ReceiptSheet open onOpenChange={vi.fn()} templates={TEMPLATES} onPrint={vi.fn()} email={{ onSend: vi.fn(() => null) }}>
          <Text>Preview</Text>
        </ReceiptSheet>
        <PortalHost />
      </I18nProvider>,
    );
    openForm();
    typeAddress('a@b.co');
    fireEvent.click(send());
    await waitFor(() => expect(line()?.textContent).toBe('E-mail envoyé'));
  });
});
