/** Micro-minor-units per minor unit. */
export const MICROS_PER_MINOR = 1_000_000n;

/** Converts a percentage to the nearest integer ppm; rejects non-finite or negative input. */
export function ratePpmFromPercent(percent: number | string): number {
  const value = Number(percent);
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Percent must be finite and non-negative');
  }
  return Math.round(value * 10000);
}

/**
 * Exact exclusive tax, or inclusive tax rounded half away from zero to a micro-minor-unit.
 * Throws RangeError for a non-integer amount or a rate that is not a non-negative integer.
 */
export function taxMicros(amountMinor: number, ratePpm: number, pricesIncludeTax: boolean): bigint {
  if (!Number.isInteger(amountMinor) || !Number.isInteger(ratePpm) || ratePpm < 0) {
    throw new RangeError('Amount must be an integer and rate a non-negative integer');
  }
  const tax = BigInt(amountMinor) * BigInt(ratePpm);
  if (!pricesIncludeTax) return tax;

  const numerator = tax * MICROS_PER_MINOR;
  const denominator = MICROS_PER_MINOR + BigInt(ratePpm);
  const sign = numerator < 0n ? -1n : 1n;
  return sign * ((sign * numerator + denominator / 2n) / denominator);
}

/** Rounds micro-minor-units to integer minor units, half away from zero. */
export function roundMicrosToMinor(micros: bigint): number {
  const sign = micros < 0n ? -1n : 1n;
  return Number(sign * ((sign * micros + MICROS_PER_MINOR / 2n) / MICROS_PER_MINOR));
}

export interface TaxLineInput {
  unitPriceMinor: number; // integer, may be negative (returns)
  quantity: number;       // integer >= 1
  ratePpm: number;        // integer >= 0
}

export interface OrderTaxTotals {
  subtotalMinor: number;  // excl. tax
  taxMinor: number;       // rounded once
  totalMinor: number;     // incl. tax
  lineTaxMicros: bigint[]; // exact, one per input line, same order
}

/**
 * Sums tax on each unit price × quantity and rounds once for the order.
 * Exclusive: total = subtotal + tax. Inclusive: subtotal = total − tax.
 * Empty orders return zeros and an empty lineTaxMicros.
 * Throws RangeError for a non-integer price or a quantity that is not an integer >= 1.
 */
export function computeOrderTax(lines: TaxLineInput[], pricesIncludeTax: boolean): OrderTaxTotals {
  let amountTotal = 0n;
  let taxTotal = 0n;
  const lineTaxMicros: bigint[] = [];

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError('Quantity must be an integer >= 1');
    }
    let tax = taxMicros(line.unitPriceMinor, line.ratePpm, false) * BigInt(line.quantity);
    const amount = BigInt(line.unitPriceMinor) * BigInt(line.quantity);
    if (pricesIncludeTax) {
      const numerator = tax * MICROS_PER_MINOR;
      const denominator = MICROS_PER_MINOR + BigInt(line.ratePpm);
      const sign = numerator < 0n ? -1n : 1n;
      tax = sign * ((sign * numerator + denominator / 2n) / denominator);
    }
    amountTotal += amount;
    taxTotal += tax;
    lineTaxMicros.push(tax);
  }

  const taxMinor = taxTotal / MICROS_PER_MINOR
    + BigInt(roundMicrosToMinor(taxTotal % MICROS_PER_MINOR));
  return {
    subtotalMinor: Number(pricesIncludeTax ? amountTotal - taxMinor : amountTotal),
    taxMinor: Number(taxMinor),
    totalMinor: Number(pricesIncludeTax ? amountTotal : amountTotal + taxMinor),
    lineTaxMicros,
  };
}
