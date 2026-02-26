import type { TaxResult } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function addTax(priceExclTax: number, rate: number): number {
  return round2(priceExclTax * (1 + rate));
}

export function extractTax(priceInclTax: number, rate: number): number {
  if (rate === 0) return 0;
  return round2(priceInclTax - priceInclTax / (1 + rate));
}

export function calculateTax(price: number, rate: number, pricesIncludeTax: boolean): TaxResult {
  if (pricesIncludeTax) {
    const taxAmount = extractTax(price, rate);
    return {
      priceInclTax: round2(price),
      priceExclTax: round2(price - taxAmount),
      taxAmount,
    };
  }

  const taxAmount = round2(price * rate);
  return {
    priceExclTax: round2(price),
    priceInclTax: round2(price + taxAmount),
    taxAmount,
  };
}
