import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { PortalHost } from '@tallyui/primitives';
import { ReceiptSheet, type ReceiptSheetProps } from '../sale';

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

  it('Close calls onOpenChange(false)', () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByTestId('receipt-close-button'));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
