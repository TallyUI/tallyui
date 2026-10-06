import type { TaxRounding } from '@tallyui/core';
import { woocommerceTaxByRate } from '../order/woocommerce-tax';

/** Micro-minor-units per minor unit. */
export const MICROS_PER_MINOR = 1_000_000n;

/** What an absent `TaxRounding` means (#287): the till's only rounding before #287a. */
export const DEFAULT_TAX_ROUNDING = { granularity: 'per_order', mode: 'half_away_from_zero' } as const satisfies TaxRounding;

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

/** #287: `half_up` is Math.round's rule, Vendure's DefaultMoneyStrategy (default-money-strategy.js:19-21). */
export type RoundingMode = 'half_away_from_zero' | 'half_up';

/** `n / d` (d > 0) rounded to an integer in `mode`, exactly; the modes differ only on exact negative halves. */
export function roundRatio(n: bigint, d: bigint, mode: RoundingMode = 'half_away_from_zero'): bigint {
  if (mode === 'half_away_from_zero' && n < 0n) return -roundRatio(-n, d, mode);
  const a = 2n * n + d, b = 2n * d; // floor(n / d + 1/2)
  return a / b - (a < 0n && a % b !== 0n ? 1n : 0n);
}

/** Rounds micro-minor-units to integer minor units, half away from zero unless `mode` says otherwise. */
export function roundMicrosToMinor(micros: bigint, mode?: RoundingMode): number {
  const minor = roundRatio(micros, MICROS_PER_MINOR, mode);
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

type TaxedLine = { netMinor: number; netMicros?: string; discountMinor?: number; taxInclusive: boolean; taxLines: readonly { code?: string; ratePpm: number; taxMicros: string }[] };

/**
 * A `per_line_items` or `per_rate_group_items` store's figures (#287) as @vendure/core 3.7.3 computes them; undefined
 * otherwise. `baseMinor` (the subtotal) is Σ each item's rounded net, `rates` the tax by `code`+`ratePpm`, summing to
 * `taxMinor`; the total is their sum. Vendure's rounding is `half_up`. vendurepos scores the #38 set with this.
 */
export function roundedTaxByRate(lines: readonly TaxedLine[], rounding?: TaxRounding) {
  if (rounding?.granularity !== 'per_line_items' && rounding?.granularity !== 'per_rate_group_items') return undefined;
  // Known gap (#287): Vendure's inclusive per_rate_group_items total can differ from the shelf prices, which the display
  // can't show until it has a rounding row (#310), so an order with any inclusive line keeps per_order's figures and rows.
  if (rounding.granularity === 'per_rate_group_items' && lines.some((line) => line.taxInclusive)) return undefined;
  const { granularity, mode } = rounding;
  const rates = new Map<string, { code?: string; ratePpm: number; netMinor: bigint; amountMinor: bigint }>();
  let baseMinor = 0n;
  // vendurepos posts each line undiscounted (A) and its discountMinor as its own −D surcharge in the line's mode with
  // the line's tax lines (vendurepos/app order-create.service.ts:654-663); a return line's negative D is its cap, not an item.
  const items = lines.flatMap((line) => (line.discountMinor ?? 0) > 0
    ? [{ ...line, netMinor: line.netMinor + line.discountMinor! }, { ...line, netMinor: -line.discountMinor! }] : [line]);
  for (const line of items) {
    const net = BigInt(line.netMinor);
    const ratePpm = BigInt(line.taxLines.reduce((sum, tax) => sum + tax.ratePpm, 0));
    // Each item's net is rounded first, at the sum of its rates (order-line.entity.js:121-122): an inclusive item's
    // netPriceOf(gross) (:193-196, :249-251; surcharge.entity.js:33-38; tax-utils.js:16-17), an exclusive one's as it is.
    const base = line.taxInclusive ? roundRatio(net * MICROS_PER_MINOR, MICROS_PER_MINOR + ratePpm, mode) : net;
    // per_line_items: the item's tax is its rounded gross less that net (:201-204, :259-261; surcharge.entity.js:36-38;
    // default-order-tax-calculation-strategy.js:22-29): round(net × r) exclusive, gross − net inclusive.
    const lineTax = line.taxInclusive ? net - base : roundRatio(net * ratePpm, MICROS_PER_MINOR, mode);
    let left = lineTax;
    baseMinor += base;
    line.taxLines.forEach((tax, index) => {
      // Vendure's key is the rate's name and value (order-level-tax-calculation-strategy.js:103).
      const key = JSON.stringify([tax.code ?? '', tax.ratePpm]);
      const row = rates.get(key) ?? { code: tax.code, ratePpm: tax.ratePpm, netMinor: 0n, amountMinor: 0n };
      // per_line_items, stacked rates: each rate's share of the item's tax, rounded (default-order-tax-calculation-strategy.js:51-66),
      // the last rate taking the rest so the rows sum to the tax. per_rate_group_items: each rate takes the whole net, and
      // a −D item joins its line's group (order-level-tax-calculation-strategy.js:88-91, :98-115).
      const share = index === line.taxLines.length - 1 ? left : ratePpm === 0n ? 0n : roundRatio(lineTax * BigInt(tax.ratePpm), ratePpm, mode);
      left -= share;
      rates.set(key, { ...row, netMinor: row.netMinor + base, amountMinor: row.amountMinor + share });
    });
  }
  const rows = [...rates.values()].map((row) => ({ ...row, netMinor: Number(row.netMinor), amountMinor: Number(
    // per_rate_group_items: round(Σ net × r) once per group, and the order's tax is their sum (:35-49, :56).
    granularity === 'per_rate_group_items' ? roundRatio(row.netMinor * BigInt(row.ratePpm), MICROS_PER_MINOR, mode) : row.amountMinor) }));
  return { baseMinor: Number(baseMinor), taxMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0), rates: rows };
}

/**
 * Groups each line's stacked tax rates (ADR-040: each independently taxes the line's full
 * tax-free base) by `code`+`ratePpm`, floors each group's exact tax to minor units, then
 * distributes `orderTaxMinor` minus that floor sum by largest remainder (ties to the higher rate)
 * so the rates sum to exactly `orderTaxMinor`. A line's `netMinor` is in its OWN tax mode
 * (`taxInclusive`): an inclusive line's net already contains its tax, so its tax-free base is
 * `netMinor − roundMicrosToMinor(Σ its taxMicros)`; an exclusive line's base is `netMinor` as is.
 * Shared by a receipt's tax summary and a Z report's per-rate breakdown. That is `per_order`'s split; a `per_line_items` or
 * `per_rate_group_items` order's rows are `roundedTaxByRate`'s (#287).
 */
export function taxLinesByRate(
  lines: readonly TaxedLine[],
  orderTaxMinor: number,
  taxLabels?: Record<number, string>,
  rounding?: TaxRounding,
): RateTaxLine[] {
  if (rounding?.granularity === 'woocommerce' && lines.every((line) => line.netMicros !== undefined)) return woocommerceTaxByRate(lines, rounding.roundAtSubtotal, taxLabels);
  const label = (ratePpm: number) => taxLabels?.[ratePpm] ?? `Tax ${ratePpm / 10000}%`;
  const rounded = roundedTaxByRate(lines, rounding);
  if (rounded) return rounded.rates.map(({ code, ratePpm, netMinor, amountMinor }) => ({ label: label(ratePpm), code, ratePpm, netMinor, amountMinor }));
  const byRate = new Map<string, { code?: string; ratePpm: number; micros: bigint; netMinor: number }>();
  for (const line of lines) {
    const lineTaxMicros = line.taxLines.reduce((sum, tax) => sum + BigInt(tax.taxMicros), 0n);
    const base = line.taxInclusive ? line.netMinor - roundMicrosToMinor(lineTaxMicros) : line.netMinor;
    for (const tax of line.taxLines) {
      const key = JSON.stringify([tax.code ?? '', tax.ratePpm]);
      const existing = byRate.get(key);
      byRate.set(key, {
        code: tax.code, ratePpm: tax.ratePpm,
        micros: (existing?.micros ?? 0n) + BigInt(tax.taxMicros),
        netMinor: (existing?.netMinor ?? 0) + base,
      });
    }
  }
  const groups = Array.from(byRate.values()).map(({ code, ratePpm, micros, netMinor }) => {
    const floor = micros / MICROS_PER_MINOR - (micros < 0n && micros % MICROS_PER_MINOR !== 0n ? 1n : 0n);
    return {
      line: { label: label(ratePpm), code, ratePpm, netMinor, amountMinor: Number(floor) },
      remainder: micros - floor * MICROS_PER_MINOR,
    };
  });
  const leftover = orderTaxMinor - groups.reduce((sum, group) => sum + group.line.amountMinor, 0);
  const ranked = [...groups].sort((a, b) =>
    a.remainder === b.remainder ? b.line.ratePpm - a.line.ratePpm : a.remainder > b.remainder ? -1 : 1);
  for (const group of ranked.slice(0, leftover)) group.line.amountMinor += 1;
  return groups.map((group) => group.line);
}
