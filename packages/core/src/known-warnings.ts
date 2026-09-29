import type { CommandWarning } from './types/commands';

function isSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** The till's single reader of stored warnings. */
export function knownWarnings(warnings: readonly unknown[] | undefined): CommandWarning[] {
  if (!warnings) return [];
  const kept: CommandWarning[] = [];
  for (const item of warnings) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const warning = item as Record<string, unknown>;
    switch (warning.code) {
      case 'total_mismatch': {
        if (!isSafeInt(warning.expectedMinor) || !isSafeInt(warning.serverMinor)) continue;
        if (warning.bridgeMinor !== undefined && !isSafeInt(warning.bridgeMinor)) continue;
        kept.push(warning.bridgeMinor === undefined
          ? { code: 'total_mismatch', expectedMinor: warning.expectedMinor, serverMinor: warning.serverMinor }
          : { code: 'total_mismatch', expectedMinor: warning.expectedMinor, serverMinor: warning.serverMinor, bridgeMinor: warning.bridgeMinor });
        break;
      }
      case 'insufficient_stock': {
        if (typeof warning.variantId !== 'string' || warning.variantId === '') continue;
        if (!isSafeInt(warning.quantity) || warning.quantity < 1) continue;
        kept.push({ code: 'insufficient_stock', variantId: warning.variantId, quantity: warning.quantity });
        break;
      }
      case 'tax_rate_mismatch': {
        if (!isSafeInt(warning.ratePpm) || !isSafeInt(warning.expectedMinor) || !isSafeInt(warning.serverMinor)) continue;
        kept.push({ code: 'tax_rate_mismatch', ratePpm: warning.ratePpm, expectedMinor: warning.expectedMinor, serverMinor: warning.serverMinor });
        break;
      }
      default:
        continue;
    }
  }
  return kept;
}
