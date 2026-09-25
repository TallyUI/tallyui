/** Micro-minor-units per minor unit. */
export const MICROS_PER_MINOR = 1_000_000n;

/** Converts a plain decimal percentage with at most four fractional digits to safe integer ppm. */
export function ratePpmFromPercent(percent: number | string): number {
  const value = String(percent);
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value);
  if (!match || match[0] !== value) {
    throw new RangeError('Percent must be a plain decimal with at most four fractional digits');
  }
  const ratePpm = BigInt(match[1]) * 10000n + BigInt((match[2] ?? '').padEnd(4, '0'));
  if (ratePpm > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Rate must be a safe integer');
  }
  return Number(ratePpm);
}

/**
 * Exact exclusive tax, or inclusive tax rounded half away from zero to a micro-minor-unit.
 * Throws RangeError unless amount and rate are safe integers and rate is non-negative.
 */
export function taxMicros(amountMinor: number, ratePpm: number, pricesIncludeTax: boolean): bigint {
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(ratePpm) || ratePpm < 0) {
    throw new RangeError('Amount must be a safe integer and rate a non-negative safe integer');
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
  const minor = sign * ((sign * micros + MICROS_PER_MINOR / 2n) / MICROS_PER_MINOR);
  if (minor < -BigInt(Number.MAX_SAFE_INTEGER) || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Rounded amount must be a safe integer');
  }
  return Number(minor);
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
 * Throws RangeError for unsafe integer inputs or totals, negative rates, or quantity < 1.
 */
export function computeOrderTax(lines: TaxLineInput[], pricesIncludeTax: boolean): OrderTaxTotals {
  let amountTotal = 0n;
  let taxTotal = 0n;
  const lineTaxMicros: bigint[] = [];

  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError('Quantity must be a safe integer >= 1');
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
  const subtotalMinor = pricesIncludeTax ? amountTotal - taxMinor : amountTotal;
  const totalMinor = pricesIncludeTax ? amountTotal : amountTotal + taxMinor;
  for (const value of [subtotalMinor, taxMinor, totalMinor]) {
    if (value < -BigInt(Number.MAX_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError('Order totals must be safe integers');
    }
  }
  return {
    subtotalMinor: Number(subtotalMinor),
    taxMinor: Number(taxMinor),
    totalMinor: Number(totalMinor),
    lineTaxMicros,
  };
}

export interface RateTaxLine {
  label: string;
  code?: string;
  ratePpm: number;
  netMinor: number;
  amountMinor: number;
}

/**
 * Groups each line's stacked tax rates (ADR-040: each independently taxes the line's full net) by
 * `code`+`ratePpm`, floors each group's exact tax to minor units, then distributes `orderTaxMinor`
 * minus that floor sum by largest remainder (ties to the higher rate) so the rates sum to exactly
 * `orderTaxMinor`. Shared by a receipt's tax summary and a Z report's per-rate breakdown.
 */
export function taxLinesByRate(
  lines: readonly { netMinor: number; taxLines: readonly { code?: string; ratePpm: number; taxMicros: string }[] }[],
  orderTaxMinor: number,
  taxLabels?: Record<number, string>,
): RateTaxLine[] {
  const byRate = new Map<string, { code?: string; ratePpm: number; micros: bigint; netMinor: number }>();
  for (const line of lines)
    for (const tax of line.taxLines) {
      const key = JSON.stringify([tax.code ?? '', tax.ratePpm]);
      const existing = byRate.get(key);
      byRate.set(key, {
        code: tax.code, ratePpm: tax.ratePpm,
        micros: (existing?.micros ?? 0n) + BigInt(tax.taxMicros),
        netMinor: (existing?.netMinor ?? 0) + line.netMinor,
      });
    }
  const groups = Array.from(byRate.values()).map(({ code, ratePpm, micros, netMinor }) => {
    const floor = micros / MICROS_PER_MINOR - (micros < 0n && micros % MICROS_PER_MINOR !== 0n ? 1n : 0n);
    return {
      line: { label: taxLabels?.[ratePpm] ?? `Tax ${ratePpm / 10000}%`, code, ratePpm, netMinor, amountMinor: Number(floor) },
      remainder: micros - floor * MICROS_PER_MINOR,
    };
  });
  const leftover = orderTaxMinor - groups.reduce((sum, group) => sum + group.line.amountMinor, 0);
  const ranked = [...groups].sort((a, b) =>
    a.remainder === b.remainder ? b.line.ratePpm - a.line.ratePpm : a.remainder > b.remainder ? -1 : 1);
  for (const group of ranked.slice(0, leftover)) group.line.amountMinor += 1;
  return groups.map((group) => group.line);
}
