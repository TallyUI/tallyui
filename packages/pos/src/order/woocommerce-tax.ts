import { minorUnitDigits, woocommerceTax } from '@tallyui/core';
import type { WooRate } from '../tax/types';
import type { RateTaxLine } from '../tax/exact';
import type { ChargeLine, LineItem, LineTaxLine } from './types';

/** ADR-076: all WooCommerce float arithmetic stays here; only integer money leaves this module. */
export function woocommerceLine(amountMinor: number, rates: readonly WooRate[], inclusive: boolean, currency: string,
  roundAtSubtotal: boolean, pricesIncludeTax = inclusive) {
  const dp = minorUnitDigits(currency), factor = 10 ** dp;
  const precision = woocommerceTax.getRoundingPrecision(dp);
  const input = { amount: amountMinor / factor, rates: rates.map((rate) => ({ ...rate, order: rate.priority })),
    amountIncludesTax: inclusive, dp, perRatePrecision: precision };
  let result = woocommerceTax.calculateTaxes(input);
  const net = woocommerceTax.roundHalfUp(input.amount - (inclusive ? result.total : 0), precision);
  // WC_Order_Item_Product::calculate_taxes re-derives from the stored net (#2333 B).
  if (inclusive && rates.length) result = woocommerceTax.calculateTaxes({ ...input, amount: net, amountIncludesTax: false });
  const taxLines: LineTaxLine[] = result.taxes.map((tax) => {
    const rate = rates.find((rate) => rate.id === tax.id)!;
    return { code: rate.code, rateId: rate.id, compound: rate.compound, ratePpm: Math.round(Number(rate.rate) * 10000),
      taxMicros: String(Math.round(tax.total * factor * 1e6)) };
  });
  const tax = result.taxes.reduce((sum, rate) => sum + (roundAtSubtotal ? rate.total
    : woocommerceTax.roundTaxTotal(rate.total, dp, pricesIncludeTax)), 0);
  return { netMinor: Math.round(woocommerceTax.roundHalfUp(net, dp) * factor), netMicros: String(Math.round(net * factor * 1e6)),
    totalMinor: Math.round(woocommerceTax.roundHalfUp(net + tax, dp) * factor), taxLines,
    taxMicros: taxLines.reduce((sum, rate) => sum + BigInt(rate.taxMicros), 0n).toString() };
}

/** calculateOrderTotals: products round conditionally, fees stay raw, shipping always rounds per item. */
export function woocommerceTotals(lines: readonly LineItem[], fees: readonly ChargeLine[], shipping: readonly ChargeLine[],
  currency: string, roundAtSubtotal: boolean, inclusive: boolean) {
  const dp = minorUnitDigits(currency), factor = 10 ** dp;
  const net = (line: LineItem | ChargeLine) => Number(line.netMicros) / (factor * 1e6);
  const productNet = lines.reduce((sum, line) => sum + (roundAtSubtotal ? net(line) : woocommerceTax.roundHalfUp(net(line), dp)), 0);
  const amount = productNet + fees.reduce((sum, line) => sum + net(line), 0)
    + shipping.reduce((sum, line) => sum + woocommerceTax.roundHalfUp(net(line), dp), 0);
  const taxes = (items: readonly (LineItem | ChargeLine)[]) => woocommerceTax.roundHalfUp(items.reduce((sum, line) =>
    line.taxLines.reduce((sum, tax) => sum + (roundAtSubtotal ? Number(tax.taxMicros) / (factor * 1e6)
      : woocommerceTax.roundTaxTotal(Number(tax.taxMicros) / (factor * 1e6), dp, inclusive)), sum), 0), woocommerceTax.getRoundingPrecision(dp));
  const tax = woocommerceTax.roundHalfUp(taxes([...lines, ...fees]) + taxes(shipping), 6);
  return { subtotalMinor: Math.round(woocommerceTax.roundHalfUp(productNet, dp) * factor),
    taxMinor: Math.round((roundAtSubtotal ? woocommerceTax.roundHalfUp(tax, dp) : woocommerceTax.roundTaxTotal(tax, dp, inclusive)) * factor),
    totalMinor: Math.round(woocommerceTax.roundHalfUp(woocommerceTax.roundHalfUp(amount + tax, 6), dp) * factor) };
}

/** Order-math's rate buckets, including zero rows; the last row takes the bounded order tax residue. */
export function woocommerceTaxByRate(lines: readonly { netMinor: number; taxInclusive: boolean; taxLines: readonly LineTaxLine[] }[],
  roundAtSubtotal: boolean, taxLabels?: Record<number, string>, orderTaxMinor?: number): RateTaxLine[] {
  const groups = new Map<string, RateTaxLine & { amount: number; inclusive: boolean }>();
  for (const line of lines) for (const tax of line.taxLines) {
    const key = JSON.stringify([tax.rateId, tax.code, tax.ratePpm]);
    const row = groups.get(key) ?? { code: tax.code, ratePpm: tax.ratePpm, label: taxLabels?.[tax.ratePpm] ?? `Tax ${tax.ratePpm / 10000}%`,
      netMinor: 0, amountMinor: 0, amount: 0, inclusive: line.taxInclusive };
    const amount = Number(tax.taxMicros) / 1e6;
    row.amount += roundAtSubtotal ? amount : woocommerceTax.roundTaxTotal(amount, 0, line.taxInclusive);
    row.netMinor += line.netMinor;
    groups.set(key, row);
  }
  const rows = [...groups.values()].map(({ amount, inclusive, ...row }) => ({ ...row,
    amountMinor: woocommerceTax.roundTaxTotal(woocommerceTax.roundHalfUp(amount, 6), 0, inclusive) }));
  if (orderTaxMinor !== undefined && rows.length) {
    const residue = orderTaxMinor - rows.reduce((sum, row) => sum + row.amountMinor, 0);
    const bound = Math.floor(rows.length / 2) + 1;
    if (Math.abs(residue) > bound) throw new Error(`woocommerce tax by rate: residue ${residue} exceeds its bound ${bound} (ADR-076)`);
    rows[rows.length - 1].amountMinor += residue;
  }
  return rows;
}
