import type { CommandWarning } from './types/commands';

function isSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

type FiguresMismatchField = Extract<CommandWarning, { code: 'figures_mismatch' }>['fields'][number];

function figuresMismatchFields(fields: unknown): FiguresMismatchField[] | null {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  const rebuilt: FiguresMismatchField[] = [];
  for (const entry of fields) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { field, tillMinor, serverMinor } = entry as Record<string, unknown>;
    if (typeof field !== 'string' || field === '' || rebuilt.some((kept) => kept.field === field)) return null;
    if (!isSafeInt(tillMinor) || !isSafeInt(serverMinor) || tillMinor === serverMinor) return null;
    rebuilt.push({ field, tillMinor, serverMinor });
  }
  return rebuilt;
}

/**
 * The till's single reader of stored warnings. `[]` for anything that isn't a warnings array.
 * A `total_mismatch`'s `bridgeMinor` is dropped (the rest of the warning is kept) when it's
 * absent, `null`, not a safe integer, zero, or not equal to `expectedMinor - serverMinor`.
 * A `tax_rate_mismatch` with a negative `ratePpm` is dropped entirely; zero stays valid.
 * A `customer_ignored` is dropped unless its `customerId` is a string of 1 to 64 characters.
 * A `figures_mismatch` is dropped entirely unless `fields` is non-empty and each entry names a
 * different figure with two differing safe integers; each entry is rebuilt from its known keys.
 * A figure name it doesn't know (any non-empty string) is kept, since a newer store may send one.
 */
export function knownWarnings(warnings: unknown): CommandWarning[] {
  if (!Array.isArray(warnings)) return [];
  const kept: CommandWarning[] = [];
  for (const item of warnings) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const warning = item as Record<string, unknown>;
    switch (warning.code) {
      case 'total_mismatch': {
        if (!isSafeInt(warning.expectedMinor) || !isSafeInt(warning.serverMinor)) continue;
        const { bridgeMinor } = warning;
        const validBridge = isSafeInt(bridgeMinor) && bridgeMinor !== 0
          && bridgeMinor === warning.expectedMinor - warning.serverMinor;
        kept.push(validBridge
          ? { code: 'total_mismatch', expectedMinor: warning.expectedMinor, serverMinor: warning.serverMinor, bridgeMinor }
          : { code: 'total_mismatch', expectedMinor: warning.expectedMinor, serverMinor: warning.serverMinor });
        break;
      }
      case 'insufficient_stock': {
        if (typeof warning.variantId !== 'string' || warning.variantId === '') continue;
        if (!isSafeInt(warning.quantity) || warning.quantity < 1) continue;
        kept.push({ code: 'insufficient_stock', variantId: warning.variantId, quantity: warning.quantity });
        break;
      }
      case 'tax_rate_mismatch': {
        if (!isSafeInt(warning.ratePpm) || warning.ratePpm < 0) continue;
        if (!isSafeInt(warning.expectedMinor) || !isSafeInt(warning.serverMinor)) continue;
        kept.push({ code: 'tax_rate_mismatch', ratePpm: warning.ratePpm, expectedMinor: warning.expectedMinor, serverMinor: warning.serverMinor });
        break;
      }
      case 'customer_ignored': {
        const { customerId } = warning;
        if (typeof customerId !== 'string' || customerId === '' || customerId.length > 64) continue;
        kept.push({ code: 'customer_ignored', customerId });
        break;
      }
      case 'figures_mismatch': {
        const fields = figuresMismatchFields(warning.fields);
        if (fields !== null) kept.push({ code: 'figures_mismatch', fields });
        break;
      }
      default:
        continue;
    }
  }
  return kept;
}
