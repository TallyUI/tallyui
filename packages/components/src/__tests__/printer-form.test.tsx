import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import type { PrinterProfile } from '@tallyui/pos';
import { PrinterForm, type PrinterFormProps } from '../settings';

afterEach(cleanup);

const setup = (props: Partial<PrinterFormProps> = {}) => {
  const onSave = props.onSave ?? vi.fn(() => null);
  const onCancel = props.onCancel ?? vi.fn();
  render(<><PrinterForm onSave={onSave} onCancel={onCancel} {...props} /><PortalHost /></>);
  return { onSave, onCancel };
};
const type = (field: string, value: string) => fireEvent.change(screen.getByTestId(`printer-form-${field}`), { target: { value } });
const press = (button: string) => fireEvent.click(screen.getByTestId(`printer-form-${button}`));
const validFields = () => { type('name', '  Bar  '); type('address', ' 10.0.0.5 '); };
const error = () => screen.getByTestId('printer-form-error').textContent;
const expectedDraft = {
  name: 'Bar', connectionType: 'network', vendor: 'generic', address: '10.0.0.5', port: 9100,
  language: 'esc-pos', columns: 42, autoCut: true, autoOpenDrawer: false, drawerConnector: 'pin2', isDefault: false,
};

describe('PrinterForm', () => {
  it('F1: refuses a blank name', () => {
    const { onSave } = setup();
    type('address', '10.0.0.5');
    type('name', '   ');
    press('save');
    expect(onSave).not.toHaveBeenCalled();
    expect(error()).toBe('Name is required');
  });

  it('F2: requires a port from 1 to 65535', () => {
    const { onSave } = setup();
    validFields();
    for (const port of ['0', '70000']) {
      type('port', port);
      press('save');
      expect(onSave).not.toHaveBeenCalled();
      expect(error()).toBe('Port must be 1 to 65535');
    }
    type('port', '65535');
    press('save');
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ ...expectedDraft, port: 65535 });
  });

  it('F3: passes exactly the trimmed draft', () => {
    const { onSave } = setup();
    validFields();
    press('save');
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expectedDraft);
  });

  it('F4: pre-fills an edit and preserves fields without controls', () => {
    const printer: PrinterProfile = {
      id: 'p1', name: 'Front', connectionType: 'network', vendor: 'epson', address: '192.168.1.40',
      port: 9101, columns: 48, codePage: 'cp437', autoOpenDrawer: true, drawerConnector: 'pin5',
    };
    const { onSave } = setup({ printer });
    expect((screen.getByTestId('printer-form-name') as HTMLInputElement).value).toBe('Front');
    expect((screen.getByTestId('printer-form-port') as HTMLInputElement).value).toBe('9101');
    press('save');
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      name: 'Front', connectionType: 'network', vendor: 'epson', address: '192.168.1.40', port: 9101,
      columns: 48, codePage: 'cp437', autoOpenDrawer: true, drawerConnector: 'pin5',
      language: 'esc-pos', autoCut: true, isDefault: false,
    });
  });

  it('F5: hides and omits Address and Port for Print Dialog', () => {
    const { onSave } = setup();
    press('connection-system');
    expect(screen.queryByTestId('printer-form-address')).toBeNull();
    expect(screen.queryByTestId('printer-form-port')).toBeNull();
    type('name', 'Desk');
    press('save');
    expect(onSave).toHaveBeenCalledOnce();
    const draft = vi.mocked(onSave).mock.calls[0][0];
    expect(draft.connectionType).toBe('system');
    expect(draft).not.toHaveProperty('address');
    expect(draft).not.toHaveProperty('port');
  });

  it('F6: requires a network address', () => {
    const { onSave } = setup();
    type('name', 'Bar');
    press('save');
    expect(onSave).not.toHaveBeenCalled();
    expect(error()).toBe('Address is required');
  });

  it('F7: requires at least one character per line', () => {
    const { onSave } = setup();
    validFields();
    type('columns', '0');
    press('save');
    expect(onSave).not.toHaveBeenCalled();
    expect(error()).toBe('Characters per line must be 1 or more');
  });

  it('F8: shows a refusal and clears it on success', () => {
    const onSave = vi.fn<PrinterFormProps['onSave']>().mockReturnValueOnce('Name taken').mockReturnValue(null);
    setup({ onSave });
    validFields();
    press('save');
    expect(error()).toBe('Name taken');
    press('save');
    expect(screen.queryByTestId('printer-form-error')).toBeNull();
  });

  it('F9: offers Test Print only with onTest and validates the same draft as Save', () => {
    setup();
    expect(screen.queryByTestId('printer-form-test')).toBeNull();
    cleanup();
    const onTest = vi.fn();
    const { onSave } = setup({ onTest });
    press('test');
    expect(error()).toBe('Name is required');
    expect(onTest).not.toHaveBeenCalled();
    validFields();
    press('test');
    expect(onTest).toHaveBeenCalledExactlyOnceWith(expectedDraft);
    expect(onSave).not.toHaveBeenCalled();
    press('save');
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expectedDraft);
  });

  it('F10: shows Drawer Connector only with Open Cash Drawer on', () => {
    setup();
    expect(screen.queryByTestId('printer-form-drawer-pin2')).toBeNull();
    press('open-drawer');
    expect(screen.getByTestId('printer-form-drawer-pin2')).toBeTruthy();
    press('open-drawer');
    expect(screen.queryByTestId('printer-form-drawer-pin2')).toBeNull();
  });

  it('disables Save and shows a loader until an asynchronous refusal settles', async () => {
    let resolve!: (value: string | null) => void;
    const onSave = vi.fn(() => new Promise<string | null>((done) => { resolve = done; }));
    setup({ onSave });
    validFields();
    press('save');
    const save = screen.getByTestId('printer-form-save');
    expect(save.getAttribute('aria-disabled')).toBe('true');
    expect(save.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('progressbar')).toBeTruthy();
    press('save');
    expect(onSave).toHaveBeenCalledOnce();
    await act(async () => { resolve('Name taken'); });
    expect(error()).toBe('Name taken');
    expect(save.getAttribute('aria-disabled')).not.toBe('true');
    expect(save.getAttribute('aria-busy')).not.toBe('true');
    expect(screen.queryByRole('progressbar')).toBeNull();
    press('save');
    await act(async () => { resolve(null); });
    expect(screen.queryByTestId('printer-form-error')).toBeNull();
  });

  it.each(['bluetooth', 'usb'] as const)('keeps an existing %s connection and isBuiltIn', (connectionType) => {
    const { onSave } = setup({ printer: { id: 'p1', name: 'Bar', connectionType, address: ' device ', isBuiltIn: false } });
    expect(screen.getByTestId(`printer-form-connection-${connectionType}`)).toBeTruthy();
    expect(screen.queryByTestId('printer-form-port')).toBeNull();
    press('save');
    const draft = vi.mocked(onSave).mock.calls[0][0];
    expect(draft).toMatchObject({ connectionType, address: 'device', isBuiltIn: false });
    expect(draft).not.toHaveProperty('port');
    expect(draft).not.toHaveProperty('id');
  });

  it('calls onCancel without saving and offers no new Bluetooth or USB connection', () => {
    const { onSave, onCancel } = setup();
    expect(screen.queryByTestId('printer-form-connection-bluetooth')).toBeNull();
    expect(screen.queryByTestId('printer-form-connection-usb')).toBeNull();
    press('cancel');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
