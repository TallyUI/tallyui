import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import type { PrinterProfile } from '@tallyui/pos';
import { PrintingSettings, type PrintingSettingsProps } from '../settings';

// react-native-web atomizes className into hashed classes, so copy it to a data attribute (as switch-confirm.test.tsx).
vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const withClass = (Base: React.ElementType) =>
    React.forwardRef((props: { className?: string }, ref) => <Base ref={ref} {...props} dataSet={{ class: props.className }} />);
  return { ...rn, Pressable: withClass(rn.Pressable) };
});

afterEach(cleanup);

const dialog: PrinterProfile = { id: 'dialog', name: 'Print Dialog', connectionType: 'system', isBuiltIn: true, isDefault: true };
const epson: PrinterProfile = { id: 'epson', name: 'Front counter', connectionType: 'network', address: '192.168.1.40', port: 9100, vendor: 'epson' };
const bluetooth: PrinterProfile = { id: 'bt', name: 'Kitchen', connectionType: 'bluetooth', address: 'AA:BB' };
const usb: PrinterProfile = { id: 'usb', name: 'Back office', connectionType: 'usb' };

const show = (props: Partial<PrintingSettingsProps> = {}) => {
  const handlers = { onTest: vi.fn(), onEdit: vi.fn(), onSetDefault: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn() };
  render(<><PrintingSettings printers={[dialog, epson, bluetooth, usb]} {...handlers} {...props} /><PortalHost /></>);
  return handlers;
};
const text = (id: string) => screen.getByTestId(id).textContent;
const variantClass = (id: string) => screen.getByTestId(id).getAttribute('data-class') ?? '';
const openMenu = (id: string) => fireEvent.click(screen.getByTestId(`printer-row-${id}-menu`));

describe('PrintingSettings', () => {
  it('lists every printer with its connection line', () => {
    show();
    expect(screen.getByText('Printers')).toBeTruthy();
    expect(screen.getByText('Devices receipts can be sent to.')).toBeTruthy();
    expect(text('printer-row-dialog-connection')).toBe('Print Dialog · built-in');
    expect(text('printer-row-epson-connection')).toBe('192.168.1.40:9100 · Epson');
    expect(text('printer-row-bt-connection')).toBe('AA:BB');
    expect(text('printer-row-usb-connection')).toBe('?');
    expect(text('printer-row-epson')).toContain('Front counter');
  });

  it('tags only the default printer', () => {
    show({ printers: [{ ...dialog, isDefault: false }, { ...epson, isDefault: true }, bluetooth] });
    expect(text('printer-row-epson-default')).toBe('Default');
    expect(screen.queryByTestId('printer-row-dialog-default')).toBeNull();
    expect(screen.queryByTestId('printer-row-bt-default')).toBeNull();
    expect(screen.getAllByText('Default')).toHaveLength(1);
  });

  it('a built-in printer has no Edit and no Delete, and the default printer has no Set Default', () => {
    show({ printers: [{ ...dialog, isDefault: false }, { ...epson, isDefault: true }, bluetooth] });
    expect(screen.queryByTestId('printer-row-dialog-edit')).toBeNull();
    expect(screen.getByTestId('printer-row-epson-edit')).toBeTruthy();
    // A built-in printer offers neither Set Default nor Delete, so its row has no menu to open at all.
    expect(screen.queryByTestId('printer-row-dialog-menu')).toBeNull();
    expect(screen.queryByTestId('printer-row-dialog-delete')).toBeNull();
    expect(screen.queryByTestId('printer-row-dialog-set-default')).toBeNull();

    openMenu('epson');
    expect(screen.getByTestId('printer-row-epson-delete')).toBeTruthy();
    expect(screen.queryByTestId('printer-row-epson-set-default')).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    cleanup();

    const { onSetDefault } = show({ printers: [dialog, epson, bluetooth] });
    openMenu('bt');
    expect(screen.getByTestId('printer-row-bt-delete')).toBeTruthy();
    fireEvent.click(screen.getByTestId('printer-row-bt-set-default'));
    expect(onSetDefault).toHaveBeenCalledWith('bt');
  });

  it('Test Print calls onTest with the printer and shows loading for the ids in testingIds', () => {
    const { onTest } = show({ testingIds: new Set(['epson']) });
    expect(screen.getByTestId('printer-row-epson-test').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('printer-row-epson-test').querySelector('[role="progressbar"]')).not.toBeNull();
    expect(screen.getByTestId('printer-row-bt-test').getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.getByTestId('printer-row-bt-test').querySelector('[role="progressbar"]')).toBeNull();
    fireEvent.click(screen.getByTestId('printer-row-bt-test'));
    expect(onTest).toHaveBeenCalledTimes(1);
    expect(onTest).toHaveBeenCalledWith(bluetooth);
  });

  it('Delete asks first and calls onDelete only on confirm', () => {
    const { onDelete } = show();
    openMenu('epson');
    fireEvent.click(screen.getByTestId('printer-row-epson-delete'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete Front counter?')).toBeTruthy();
    fireEvent.click(screen.getByTestId('printer-row-epson-delete-cancel'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete Front counter?')).toBeNull();

    openMenu('bt');
    fireEvent.click(screen.getByTestId('printer-row-bt-delete'));
    expect(screen.getByText('Delete Kitchen?')).toBeTruthy();
    fireEvent.click(screen.getByTestId('printer-row-bt-delete-confirm'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('bt');
    expect(screen.queryByText('Delete Kitchen?')).toBeNull();
  });

  // The variant is read from the Button's class copied to `data-class` (mock above): default `bg-primary`, outline `border-input`.
  it('with only the Print Dialog, shows the empty state and a primary Add Printer', () => {
    const { onAdd } = show({ printers: [dialog] });
    expect(text('printers-empty-state')).toContain('No printers configured');
    expect(screen.getByText(/You can always use the Print Dialog without one\./)).toBeTruthy();
    expect(screen.queryByTestId('printer-row-dialog')).toBeNull();
    expect(variantClass('printing-add-printer-button')).toContain('bg-primary');
    expect(variantClass('printing-add-printer-button')).not.toContain('border-input');
    fireEvent.click(screen.getByTestId('printing-add-printer-button'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('with a hardware printer, Add Printer is outline', () => {
    show({ printers: [dialog, bluetooth] });
    expect(screen.queryByTestId('printers-empty-state')).toBeNull();
    expect(screen.getByTestId('printer-row-dialog')).toBeTruthy();
    expect(variantClass('printing-add-printer-button')).toContain('border-input');
    expect(variantClass('printing-add-printer-button')).not.toContain('bg-primary');
  });

  it('while loading, shows only the section title', () => {
    show({ loading: true });
    expect(screen.getByText('Printers')).toBeTruthy();
    expect(screen.queryByTestId('printer-row-epson')).toBeNull();
    expect(screen.queryByTestId('printers-empty-state')).toBeNull();
    expect(screen.queryByTestId('printing-add-printer-button')).toBeNull();
  });
});
