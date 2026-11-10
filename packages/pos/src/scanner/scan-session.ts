// Ported from WCPOS v2 packages/scanner/src/scan-session.ts (monorepo 5ac185b0).
/** Suppress repeated reads within a cooldown and reject retail check-digit misreads. */
export const DEFAULT_COOLDOWN_MS = 1200;
export type ScanRejectReason = 'cooldown' | 'bad-check-digit';
export interface ScanOfferResult { accepted: boolean; reason?: ScanRejectReason; }
export interface ScanSessionOptions {
  onAccept: (code: string, symbology?: string) => void;
  cooldownMs?: number;
  now?: () => number;
}
export interface ScanSession {
  offer: (code: string, symbology?: string) => ScanOfferResult;
  reset: () => void;
}

// UPC-E is excluded: its check digit is computed over the expanded UPC-A,
// so validating its printed 8 digits as EAN-8 would reject valid reads.
const RETAIL_SYMBOLOGIES = new Set(['ean13', 'ean8', 'upc_a', 'ean-13', 'ean-8', 'upc-a']);
// Decoders can expand UPC-E to UPC-A and then pad it to 13 digits too.
const ZERO_PADDED_SYMBOLOGIES = new Set(['ean13', 'upc_a', 'upc_e', 'ean-13', 'upc-a', 'upc-e']);

/** Report the printed UPC-A digits by dropping an implied zero from labelled
 * EAN-13/UPC reads. Unlabelled reads and printed 8-digit UPC-E stay unchanged. */
export function normalizeRetailCode(code: string, symbology?: string): string {
  if (symbology === undefined || !ZERO_PADDED_SYMBOLOGIES.has(symbology.toLowerCase())) {
    return code;
  }
  return /^0\d{12}$/.test(code) ? code.slice(1) : code;
}

/** Validate EAN-13/EAN-8/UPC-A check digits; non-retail-length inputs pass. */
export function hasValidRetailCheckDigit(code: string): boolean {
  if (!/^\d+$/.test(code)) return true;
  if (code.length !== 8 && code.length !== 12 && code.length !== 13) return true;
  const digits = code.split('').map(Number);
  const check = digits.pop() as number;
  // From the rightmost data digit, weights alternate 3,1,3,1…
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += digits[i] * weight;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === check;
}

/** The other printing of the same UPC-A: `0`+12 digits -> the 12; 12 digits -> `0`+12; anything else undefined.
 * Ported from the UPC-A <-> EAN-13 branch of v2 barcodeMatchCandidates (sync-core/src/barcodeResolve.ts).
 * Match the twin against barcodes only, never SKUs (v2 BARCODE_SYMBOLOGY_FIELDS excludes sku). */
export function retailCodeTwin(code: string): string | undefined {
  const trimmed = code.trim();
  if (/^0\d{12}$/.test(trimmed)) return trimmed.slice(1);
  if (/^\d{12}$/.test(trimmed)) return `0${trimmed}`;
  return undefined;
}

function looksRetail(code: string, symbology?: string): boolean {
  // Explicit symbology is authoritative: numeric code128/qr/upc_e must pass.
  if (symbology) return RETAIL_SYMBOLOGIES.has(symbology.toLowerCase());
  // Unlabelled length 8 is ambiguous between EAN-8 and UPC-E; gate only 12/13.
  return /^\d+$/.test(code) && (code.length === 12 || code.length === 13);
}

export function createScanSession(options: ScanSessionOptions): ScanSession {
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const now = options.now ?? Date.now;
  // Per-code cooldown starts at the last accepted read for trigger sources.
  const cooldownFrom = new Map<string, number>();
  const offer = (rawCode: string, symbology?: string): ScanOfferResult => {
    const at = now();
    // Normalize first so cooldown keys and downstream consumers see the same code.
    const code = normalizeRetailCode(rawCode, symbology);
    if (looksRetail(code, symbology) && !hasValidRetailCheckDigit(code)) {
      return { accepted: false, reason: 'bad-check-digit' };
    }
    const lastAt = cooldownFrom.get(code);
    if (lastAt !== undefined && at - lastAt < cooldownMs) {
      return { accepted: false, reason: 'cooldown' };
    }
    cooldownFrom.set(code, at);
    options.onAccept(code, symbology);
    return { accepted: true };
  };
  return { offer, reset: () => { cooldownFrom.clear(); } };
}
