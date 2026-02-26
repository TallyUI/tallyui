export interface TaxResult {
  priceExclTax: number;
  priceInclTax: number;
  taxAmount: number;
}

export type TaxRateMap = {
  default: number;
  [taxClass: string]: number;
};

export interface TaxContext {
  getTaxRate(taxClass?: string): number;
  pricesIncludeTax: boolean;
}
