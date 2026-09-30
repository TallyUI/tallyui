import { describe, it, expect } from 'vitest';
import type { TaxRounding } from '@tallyui/core';
import { roundRatio, roundMicrosToMinor, roundedTaxByRate, taxLinesByRate } from './exact';

// #287: the store's rounding strategy, checked below the order builder, where a line can be negative.
const line = (netMinor: number, ratePpm: number, code?: string, taxInclusive = false) => ({
  netMinor, taxInclusive, taxLines: [{ ...(code !== undefined ? { code } : {}), ratePpm, taxMicros: String(BigInt(netMinor) * BigInt(ratePpm)) }],
});

describe('rounding modes (#287)', () => {
  it('half_up is Math.round: it differs from half_away_from_zero only on an exact negative half', () => {
    // −59.5 → −59 half up (Math.round), −60 away from zero; +59.5 → 60 both; −59.6 → −60 both.
    for (const [n, d] of [[-595n, 10n], [595n, 10n], [-596n, 10n], [-594n, 10n], [7n, 2n], [-7n, 2n]] as const) {
      expect(roundRatio(n, d, 'half_up')).toBe(BigInt(Math.round(Number(n) / Number(d))));
    }
    expect(roundRatio(-595n, 10n)).toBe(-60n);
    expect(roundRatio(595n, 10n)).toBe(60n);
    expect(roundRatio(-596n, 10n, 'half_up')).toBe(-60n);
    expect(roundMicrosToMinor(-2_500_000n, 'half_up')).toBe(-2);
    expect(roundMicrosToMinor(-2_500_000n)).toBe(-3);
    expect(roundMicrosToMinor(2_500_000n, 'half_up')).toBe(3);
  });

  it.each(['per_line', 'per_rate_group'] as const)('%s: a return line of −25 at 10% is −2 half up, −3 away from zero; +25 is 3 both', (granularity) => {
    // Exclusive −25 × 10% = −2.5 exactly: Math.round gives −2, half away from zero −3. +2.5 gives 3 in both modes.
    const tax = (netMinor: number, mode: 'half_up' | 'half_away_from_zero') =>
      roundedTaxByRate([line(netMinor, 100000)], { granularity, mode })!.taxMinor;
    expect(tax(-25, 'half_up')).toBe(-2);
    expect(tax(-25, 'half_away_from_zero')).toBe(-3);
    expect(tax(25, 'half_up')).toBe(3);
    expect(tax(25, 'half_away_from_zero')).toBe(3);
  });

  it('per_line inclusive returns: the net is rounded in the mode, so only an exact negative half net differs', () => {
    // Inclusive −21 at 10%: net = round(−21 / 1.1) = round(−19.0909) = −19 both modes, tax = −21 − (−19) = −2.
    expect(roundedTaxByRate([line(-21, 100000, undefined, true)], { granularity: 'per_line', mode: 'half_up' })!.taxMinor).toBe(-2);
    // Inclusive −231 at 10%: net = −231 / 1.1 = −210 exactly, tax −21, no half.
    expect(roundedTaxByRate([line(-231, 100000, undefined, true)], { granularity: 'per_line', mode: 'half_up' })!.taxMinor).toBe(-21);
    // Inclusive −21 at 100%: net = −10.5 exactly: half up −10 (tax −11), away from zero −11 (tax −10).
    expect(roundedTaxByRate([line(-21, 1000000, undefined, true)], { granularity: 'per_line', mode: 'half_up' })!).toMatchObject({ baseMinor: -10, taxMinor: -11 });
    expect(roundedTaxByRate([line(-21, 1000000, undefined, true)], { granularity: 'per_line', mode: 'half_away_from_zero' })!).toMatchObject({ baseMinor: -11, taxMinor: -10 });
  });
});

describe('stacked rates under per_line and per_rate_group (#287)', () => {
  // One line net 1003 exclusive with 5% (A) and 2.5% (B) stacked: Vendure sums the rates (order-line.entity.js:121-122).
  const stacked = { netMinor: 1003, taxInclusive: false, taxLines: [
    { code: 'A', ratePpm: 50000, taxMicros: String(1003n * 50000n) }, { code: 'B', ratePpm: 25000, taxMicros: String(1003n * 25000n) }] };

  it('per_line: the line tax is round(net × Σ r), split by rate with the last taking the rest', () => {
    // 1003 × 7.5% = 75.225 → 75. A's share round(75 × 5/7.5) = 50; B takes 75 − 50 = 25.
    const rows = taxLinesByRate([stacked], 75, undefined, { granularity: 'per_line', mode: 'half_up' });
    expect(rows.map((row) => [row.code, row.netMinor, row.amountMinor])).toEqual([['A', 1003, 50], ['B', 1003, 25]]);
  });

  it('per_rate_group: each rate takes the whole net base and rounds on its own', () => {
    // A: round(1003 × 5%) = round(50.15) = 50; B: round(1003 × 2.5%) = round(25.075) = 25; tax 75.
    const rounded = roundedTaxByRate([stacked], { granularity: 'per_rate_group', mode: 'half_up' })!;
    expect(rounded.rates.map((row) => [row.code, row.netMinor, row.amountMinor])).toEqual([['A', 1003, 50], ['B', 1003, 25]]);
    expect(rounded.taxMinor).toBe(75);
  });
});

describe('the defaults (#287)', () => {
  it.each<TaxRounding | undefined>([undefined, { granularity: 'custom' }, { granularity: 'per_order', mode: 'half_away_from_zero' }])(
    'computes no strategy figures for %j, so the per_order split applies', (rounding) => {
      expect(roundedTaxByRate([line(7, 190000)], rounding)).toBeUndefined();
      expect(taxLinesByRate([line(7, 190000), line(7, 190000)], 3, undefined, rounding)).toEqual(taxLinesByRate([line(7, 190000), line(7, 190000)], 3));
    });
});
