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
  return { ...rn, Pressable: withClass(rn.Pressable), View: withClass(rn.View) };
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
    expect(document.querySelector('[data-class~="border-border"]')).toBeNull(); // no empty card
  });
});

type TemplateProp = NonNullable<PrintingSettingsProps['templates']>[number];

describe('PrintingSettings template routing', () => {
  const thermal80: TemplateProp = { id: 't80', kind: 'receipt', title: 'Thermal receipt', engine: 'thermal' };
  const html: TemplateProp = { id: 'html', kind: 'receipt', title: 'Standard receipt', engine: 'html' };
  const report: TemplateProp = { id: 'z', kind: 'report', title: 'Z report', engine: 'thermal', paper: '58mm' };
  const templates = [thermal80, html, report];
  const optionTexts = () => screen.getAllByRole('option').map((option) => option.textContent);
  const openSelect = (id: string) => fireEvent.click(screen.getByTestId(`template-row-${id}-printer-select`));
  const openDelete = () => {
    openMenu('epson');
    fireEvent.click(screen.getByTestId('printer-row-epson-delete'));
  };

  it('P1: without templates draws no routing and no delete description', () => {
    show();
    expect(document.querySelector('[data-testid^="template-row-"]')).toBeNull();
    expect(screen.queryByText('Receipt Templates')).toBeNull();
    openDelete();
    expect(screen.getByText('Delete Front counter?')).toBeTruthy();
    expect(screen.queryByText(/Receipts routed/)).toBeNull();
  });

  it('P2: sections run receipt, report, closure, rows in the given order, an empty kind says so', () => {
    show({ templates: [html, report, thermal80] });
    const titles = ['Printers', 'Receipt Templates', 'Report templates', 'Closure templates'];
    const nodes = titles.map((title) => screen.getByText(title));
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getAllByText('Choose which printer each template prints to.')).toHaveLength(3);
    const rows = Array.from(document.querySelectorAll('[data-testid^="template-row-"][data-testid$="-type"]'))
      .map((node) => node.getAttribute('data-testid'));
    expect(rows).toEqual(['template-row-html-type', 'template-row-t80-type', 'template-row-z-type']);
    expect(text('templates-empty-closure')).toBe('No active templates found.');
    expect(screen.queryByTestId('templates-empty-receipt')).toBeNull();
    expect(screen.queryByTestId('templates-empty-report')).toBeNull();
  });

  it('P3: the type chip reads Thermal <paper>, unset paper as 80mm, and HTML', () => {
    show({ templates });
    expect(text('template-row-z-type')).toBe('Thermal 58mm');
    expect(text('template-row-t80-type')).toBe('Thermal 80mm');
    expect(text('template-row-html-type')).toBe('HTML');
  });

  it('P4: with no routing the trigger reads the Auto label resolvePrinter picks', () => {
    show({ templates });
    // epson is network with no columns, so it counts as 42 and fits 80mm.
    expect(text('template-row-t80-printer-select')).toBe('Auto — Front counter');
    expect(text('template-row-html-printer-select')).toBe('Auto — Print Dialog');
    expect(text('template-row-z-printer-select')).toBe('Auto — Print Dialog');
    cleanup();
    show({ templates, printers: [epson] });
    expect(text('template-row-html-printer-select')).toBe('Auto — Print Dialog');
  });

  it('P5: an override to a known printer shows its name and no Unavailable item', () => {
    show({ templates, routing: { t80: 'bt' } });
    expect(text('template-row-t80-printer-select')).toBe('Kitchen');
    openSelect('t80');
    expect(optionTexts()).toEqual(['Auto — Front counter', 'Print Dialog', 'Front counter', 'Kitchen', 'Back office']);
    expect(screen.queryByText('Unavailable printer')).toBeNull();
  });

  it('P6: an override to a missing printer reads Unavailable printer and lists it after Auto', () => {
    show({ templates, routing: { t80: 'gone' } });
    expect(text('template-row-t80-printer-select')).toBe('Unavailable printer');
    openSelect('t80');
    expect(optionTexts()).toEqual(['Auto — Front counter', 'Unavailable printer', 'Print Dialog', 'Front counter', 'Kitchen', 'Back office']);
  });

  it('P7: choosing Auto clears the override and choosing a printer sets it', () => {
    const onRoutingChange = vi.fn();
    show({ templates, routing: { t80: 'usb' }, onRoutingChange });
    openSelect('t80');
    fireEvent.click(screen.getByRole('option', { name: 'Auto — Front counter' }));
    expect(onRoutingChange).toHaveBeenLastCalledWith('t80', null);
    openSelect('t80');
    fireEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
    expect(onRoutingChange).toHaveBeenLastCalledWith('t80', 'bt');
    expect(onRoutingChange).toHaveBeenCalledTimes(2);
  });

  it('P8: with templates the delete dialog says routed receipts fall back to Auto', () => {
    show({ templates });
    openDelete();
    expect(screen.getByText('Receipts routed to it print with Auto instead.')).toBeTruthy();
  });
});
