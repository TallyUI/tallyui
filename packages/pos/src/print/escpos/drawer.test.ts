// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canOpenDrawer, createEscPosTransport, openDrawerJob, PrintError, type PrinterProfile } from '../index';

const profile = (change: Partial<PrinterProfile>): PrinterProfile => ({ id: 'p1', name: 'Front', connectionType: 'network', ...change });
const bytesOf = (p: PrinterProfile) => Array.from(openDrawerJob(p, 'k').bytes!);

function unsupported(run: () => unknown): void {
  let error: unknown;
  try { run(); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(PrintError);
  expect((error as PrintError).code).toBe('unsupported');
}

describe('openDrawerJob bytes', () => {
  it('D1 sends an Epson the real-time kick on pin 2 by default', () => {
    expect(bytesOf(profile({ vendor: 'epson' }))).toEqual([0x10, 0x14, 0x01, 0x00, 0x03]);
  });

  it('D2 sends an Epson the real-time kick on pin 5', () => {
    expect(bytesOf(profile({ vendor: 'epson', drawerConnector: 'pin5' }))).toEqual([0x10, 0x14, 0x01, 0x01, 0x03]);
  });

  it('D3 sends a Star esc-pos printer and a generic usb printer ESC p on pin 2', () => {
    expect(bytesOf(profile({ vendor: 'star', language: 'esc-pos' }))).toEqual([0x1b, 0x70, 0x00, 25, 250]);
    expect(bytesOf(profile({ vendor: 'generic', connectionType: 'usb' }))).toEqual([0x1b, 0x70, 0x00, 25, 250]);
  });

  it('D4 sends a generic printer ESC p on pin 5', () => {
    expect(bytesOf(profile({ vendor: 'generic', drawerConnector: 'pin5' }))).toEqual([0x1b, 0x70, 0x01, 25, 250]);
  });
});

describe('openDrawerJob', () => {
  it('J1 returns a drawer job with the id and bytes only', () => {
    const job = openDrawerJob(profile({ vendor: 'epson' }), 'k1');
    expect(job).toEqual({ id: 'k1', kind: 'drawer', bytes: Uint8Array.from([0x10, 0x14, 0x01, 0x00, 0x03]) });
    expect(job).not.toHaveProperty('html');
    expect(job).not.toHaveProperty('receipt');
  });

  it('J2 refuses the system dialog', () => {
    unsupported(() => openDrawerJob(profile({ connectionType: 'system' }), 'k'));
  });

  it('J3 refuses a star-prnt printer', () => {
    unsupported(() => openDrawerJob(profile({ vendor: 'star', language: 'star-prnt' }), 'k'));
  });
});

describe('canOpenDrawer', () => {
  it('C1 is true only for an ESC/POS printer that is not the system dialog', () => {
    expect(canOpenDrawer(undefined)).toBe(false);
    expect(canOpenDrawer(profile({ connectionType: 'system' }))).toBe(false);
    expect(canOpenDrawer(profile({ language: 'star-prnt' }))).toBe(false);
    for (const connectionType of ['network', 'bluetooth', 'usb'] as const) {
      expect(canOpenDrawer(profile({ connectionType, language: 'esc-pos' }))).toBe(true);
      expect(canOpenDrawer(profile({ connectionType }))).toBe(true);
    }
  });
});

describe('a drawer job through createEscPosTransport', () => {
  it('T1 writes the Epson kick to the sink once', async () => {
    const writes: number[][] = [];
    const epson = profile({ vendor: 'epson' });
    const transport = createEscPosTransport({ sink: { write: async (bytes) => { writes.push(Array.from(bytes)); } }, profile: epson });
    await transport.print(openDrawerJob(epson, 'k'));
    expect(writes).toEqual([[0x10, 0x14, 0x01, 0x00, 0x03]]);
  });
});
