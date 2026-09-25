/**
 * Minor-unit money formatting shared across the register package (moved out of `export-csv.ts` so
 * `closure-document.ts` reuses the same implementation instead of duplicating it).
 */

/**
 * `minor` as a fixed-point decimal string with exactly `exponent` places: `-50` at exponent 2 is
 * `'-0.50'`, `1250` is `'12.50'`, and at exponent 0, `1500` is `'1500'`. Integer maths only —
 * sign, `Math.trunc`, and the remainder padded to `exponent` digits — no `toFixed` on floats.
 */
export function minorToDecimal(minor: number, exponent: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const scale = 10 ** exponent;
  const whole = Math.trunc(abs / scale);
  const fraction = abs % scale;
  return exponent === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(fraction).padStart(exponent, '0')}`;
}
