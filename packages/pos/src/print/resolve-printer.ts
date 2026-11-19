/**
 * Which printer prints a template: the cashier's pick for this print, else the device's per-template override,
 * else the first match by paper (the default printer first). Ported from WCPOS v2
 * `packages/printer/src/resolve-printer.ts` (monorepo main). A thermal template matches a non-dialog printer whose
 * columns fit its paper (58mm -> 32; 80mm or unset -> 42 or 48); an html template matches the print dialog.
 */
import type { ReceiptTemplate } from '@tallyui/core';
import type { PrinterProfile } from './printer-profiles';

export interface ResolvePrinterOptions {
  template: Pick<ReceiptTemplate, 'id' | 'engine' | 'paper'>;
  profiles: readonly PrinterProfile[];
  /** Template id -> printer profile id, set on this device. A missing or deleted profile falls through to auto. */
  overrides?: Readonly<Record<string, string>>;
  /** The cashier's pick at print time. A pick that names no profile resolves to null, as in v2. */
  manualPrinterId?: string;
}

/** `PrinterProfile.columns` when absent. */
const DEFAULT_COLUMNS = 42;

/** The column counts a thermal template's paper fits: 58mm -> [32]; 80mm or unset -> [42, 48]. */
export function templateColumns(paper: ReceiptTemplate['paper']): readonly number[] {
  return paper === '58mm' ? [32] : [42, 48];
}

export function resolvePrinter(options: ResolvePrinterOptions): PrinterProfile | null {
  const { template, profiles, overrides, manualPrinterId } = options;

  if (manualPrinterId) return profiles.find((p) => p.id === manualPrinterId) ?? null;

  const overrideId = overrides?.[template.id];
  const override = overrideId ? profiles.find((p) => p.id === overrideId) : undefined;
  if (override) return override;

  let candidates: readonly PrinterProfile[];
  if (template.engine === 'thermal') {
    const columns = templateColumns(template.paper);
    candidates = profiles.filter(
      (p) => p.connectionType !== 'system' && columns.includes(p.columns ?? DEFAULT_COLUMNS),
    );
  } else {
    candidates = profiles.filter((p) => p.connectionType === 'system');
  }
  return candidates.find((p) => p.isDefault === true) ?? candidates[0] ?? null;
}
