/** Tax rates as integer parts per million (19% = 190000). */
export type TaxRateMap = {
  default: number;
  [taxClass: string]: number;
};

export interface TaxContext {
  /** Tax rate for a tax class as integer parts per million (19% = 190000); the default class when omitted or unknown. */
  getTaxRatePpm(taxClass?: string): number;
  pricesIncludeTax: boolean;
}
