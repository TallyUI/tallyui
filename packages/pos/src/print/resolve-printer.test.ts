// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolvePrinter as resolveFromEntry, templateColumns as columnsFromEntry } from '../index';
import type { PrinterProfile } from './printer-profiles';
import { resolvePrinter, templateColumns, type ResolvePrinterOptions } from './resolve-printer';

const profile = (id: string, extra: Partial<PrinterProfile> = {}): PrinterProfile =>
  ({ id, name: id, connectionType: 'network', ...extra });

const dialog = profile('dialog', { connectionType: 'system', isBuiltIn: true });
const net32 = profile('net32', { columns: 32 });
const net42 = profile('net42', { columns: 42 });
const net48 = profile('net48', { columns: 48, isDefault: true });
const usb48 = profile('usb48', { connectionType: 'usb', columns: 48 });

const thermal80: ResolvePrinterOptions['template'] = { id: 't80', engine: 'thermal', paper: '80mm' };
const thermal58: ResolvePrinterOptions['template'] = { id: 't58', engine: 'thermal', paper: '58mm' };
const html: ResolvePrinterOptions['template'] = { id: 'h1', engine: 'html' };

describe('resolvePrinter', () => {
  it('is exported from the package entry', () => {
    expect(resolveFromEntry).toBe(resolvePrinter);
    expect(columnsFromEntry).toBe(templateColumns);
  });

  it('R1 returns the manual pick even when an override and a default printer exist', () => {
    const picked = resolvePrinter({
      template: thermal80, profiles: [dialog, net42, net48], overrides: { t80: 'dialog' }, manualPrinterId: 'net42',
    });
    expect(picked).toBe(net42);
  });

  it('R2 returns null for a manual pick of a missing id, with no fall-through', () => {
    const picked = resolvePrinter({
      template: thermal80, profiles: [dialog, net42, net48], overrides: { t80: 'net42' }, manualPrinterId: 'gone',
    });
    expect(picked).toBeNull();
  });

  it('R3 returns the overridden profile, even a dialog profile for a thermal template', () => {
    expect(resolvePrinter({ template: thermal80, profiles: [dialog, net42, net48], overrides: { t80: 'dialog' } }))
      .toBe(dialog);
  });

  it('R4 falls through to auto when the override names a deleted profile', () => {
    expect(resolvePrinter({ template: thermal80, profiles: [dialog, net42, net48], overrides: { t80: 'gone' } }))
      .toBe(net48);
  });

  it('R5 picks the default among 42/48-column non-dialog printers for 80mm, skipping 32 columns and the dialog', () => {
    const dialogDefault = profile('dialog-default', { connectionType: 'system', columns: 48, isDefault: true });
    const net32Default = profile('net32-default', { columns: 32, isDefault: true });
    expect(resolvePrinter({ template: thermal80, profiles: [dialogDefault, net32Default, net42, net48] }))
      .toBe(net48);
  });

  it('R6 picks a 32-column printer for 58mm and skips 42 and 48', () => {
    expect(resolvePrinter({ template: thermal58, profiles: [net42, net48, usb48, net32] })).toBe(net32);
  });

  it('R7 treats a thermal template with no paper as 80mm', () => {
    const template: ResolvePrinterOptions['template'] = { id: 'tx', engine: 'thermal' };
    expect(resolvePrinter({ template, profiles: [net32, net42] })).toBe(net42);
  });

  it('R8 counts a profile with no columns as 42: it matches 80mm and not 58mm', () => {
    const plain = profile('plain');
    expect(resolvePrinter({ template: thermal80, profiles: [net32, plain] })).toBe(plain);
    expect(resolvePrinter({ template: thermal58, profiles: [plain] })).toBeNull();
  });

  it('R9 picks the first candidate in the given order when none is the default', () => {
    expect(resolvePrinter({ template: thermal80, profiles: [net32, usb48, net42] })).toBe(usb48);
    expect(resolvePrinter({ template: thermal80, profiles: [net32, net42, usb48] })).toBe(net42);
  });

  it('R10 picks the system profile for html (the default one of several) and never a network printer', () => {
    const otherDialog = profile('dialog-2', { connectionType: 'system', isDefault: true });
    expect(resolvePrinter({ template: html, profiles: [net48, dialog, otherDialog] })).toBe(otherDialog);
    expect(resolvePrinter({ template: html, profiles: [net48, net42, dialog] })).toBe(dialog);
  });

  it('R11 returns null when nothing matches', () => {
    expect(resolvePrinter({ template: thermal80, profiles: [dialog] })).toBeNull();
    expect(resolvePrinter({ template: html, profiles: [net42, net48] })).toBeNull();
  });

  it('R13 does not mutate its inputs', () => {
    const profiles = Object.freeze([net42, Object.freeze(profile('net48b', { columns: 48, isDefault: true }))]);
    const overrides = Object.freeze({ t80: 'gone' });
    const before = JSON.stringify({ profiles, overrides });
    expect(resolvePrinter({ template: Object.freeze({ ...thermal80 }), profiles, overrides })).toBe(profiles[1]);
    expect(JSON.stringify({ profiles, overrides })).toBe(before);
  });
});

describe('templateColumns', () => {
  it('R12 maps 58mm to [32], and 80mm or unset to [42, 48]', () => {
    expect(templateColumns('58mm')).toEqual([32]);
    expect(templateColumns('80mm')).toEqual([42, 48]);
    expect(templateColumns(undefined)).toEqual([42, 48]);
  });
});
