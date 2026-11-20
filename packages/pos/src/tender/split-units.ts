import type { Payment } from '../order/types';
import type { TenderLineId } from './tender-state';

/** A cart line as a unit split prices it: `totalMinor` is the line's money with tax inside, as the cashier is charged. */
export interface SplitUnitLine {
  id: TenderLineId;
  quantity: number;
  totalMinor: number;
}
/** Payment id → line id (as `String(id)`) → units that payment paid for. */
export type UnitAllocations = Record<string, Record<string, number>>;

export function unitAllocationsFromLegs(payments: readonly Payment[]): UnitAllocations {
  return Object.fromEntries(payments.filter((leg) => leg.units !== undefined).map((leg) => [leg.id, { ...leg.units }]));
}

/**
 * The money `units` units of a line carry, cumulatively: floor(total·units/quantity).
 * Unit k of n costs floor(total·k/n) − floor(total·(k−1)/n), so any run of picks sums exactly to the line
 * total, and no stray cent is left over. (v2's unitsMinor puts the rounding on the last unit instead.)
 * Throws RangeError when quantity is not a positive integer, or units is not an integer in 0..quantity.
 */
export function unitsMinor(totalMinor: number, quantity: number, units: number): number {
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new RangeError(`quantity ${quantity} is not a positive integer`);
  if (!Number.isInteger(units) || units < 0 || units > quantity)
    throw new RangeError(`units ${units} is not an integer in 0..${quantity}`);
  // The split is for sales: a refund line (negative total) cannot be split by units.
  if (!Number.isInteger(totalMinor) || totalMinor < 0)
    throw new RangeError(`totalMinor ${totalMinor} is not a non-negative integer`);
  // Exact in integers: totalMinor is at most MAX_TENDER_MINOR and quantities are small, so the product stays under 2^53.
  const product = totalMinor * units;
  if (!Number.isSafeInteger(product)) throw new RangeError(`totalMinor × units ${product} is not a safe integer`);
  return Math.floor(product / quantity);
}

/** Units of each line the live payments paid for. A payment not in `livePaymentIds` (voided, cancelled, refused) frees its units. */
export function paidUnitsByLine(
  allocations: UnitAllocations,
  livePaymentIds: readonly string[],
): Record<string, number> {
  const live = new Set(livePaymentIds);
  const paid: Record<string, number> = {};
  for (const [paymentId, lines] of Object.entries(allocations)) {
    if (!live.has(paymentId)) continue;
    for (const [lineId, units] of Object.entries(lines)) paid[lineId] = (paid[lineId] ?? 0) + units;
  }
  return paid;
}

/** Units of each line still unpaid, by `String(id)`. A line whose quantity is not a positive integer is left out: it cannot be split by units (vet §11.3, until the decimal-quantity ADR). */
export function unpaidUnitsByLine(
  lines: readonly SplitUnitLine[],
  paid: Record<string, number>,
): Record<string, number> {
  const unpaid: Record<string, number> = {};
  for (const line of lines) {
    if (!(Number.isInteger(line.quantity) && line.quantity > 0)) continue;
    const key = String(line.id);
    unpaid[key] = Math.max(0, line.quantity - (paid[key] ?? 0));
  }
  return unpaid;
}

/** The money the picks add to this payment: Σ unitsMinor(total, n, paid+picked) − unitsMinor(total, n, paid). Picks on a line not in `lines` throw RangeError, and so does a pick beyond the line's unpaid units. */
export function pickedUnitsMinor(
  lines: readonly SplitUnitLine[],
  picked: Record<string, number>,
  paid: Record<string, number>,
): number {
  const unpaid = unpaidUnitsByLine(lines, paid);
  let sum = 0;
  for (const [key, units] of Object.entries(picked)) {
    const line = lines.find((candidate) => String(candidate.id) === key);
    if (!line) throw new RangeError(`picked units on unknown line ${key}`);
    if (!(units <= (unpaid[key] ?? 0))) throw new RangeError(`${units} units picked on line ${key}, more than unpaid`);
    const before = paid[key] ?? 0;
    sum += unitsMinor(line.totalMinor, line.quantity, before + units) - unitsMinor(line.totalMinor, line.quantity, before);
  }
  return sum;
}
