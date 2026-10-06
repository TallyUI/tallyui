import type { StoreSettings, TaxRounding } from '@tallyui/core';

export type WooRate = NonNullable<StoreSettings['taxRates']>[string][number];

/** Tax rates as integer parts per million (19% = 190000). */
export type TaxRateMap = {
  default: number;
  [taxClass: string]: number;
};

export interface TaxContext {
  getTaxRates?(taxClass?: string, options?: { shipping?: boolean }): readonly WooRate[];
  /** Tax rate for a tax class as integer parts per million (19% = 190000); the default class when omitted or unknown. */
  getTaxRatePpm(taxClass?: string): number;
  /** The backend's name for that class's rate, when mapped: a `per_rate_group_items` store groups by name and value (#287). */
  getTaxRateCode?(taxClass?: string): string | undefined;
  pricesIncludeTax: boolean;
  /** The store's tax rounding strategy (#287); absent means `per_order`, half away from zero. */
  rounding?: TaxRounding;
}
