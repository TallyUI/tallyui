import { ORDER_TAX_ID_TYPE_MAX, ORDER_TAX_ID_VALUE_MAX, ORDER_TAX_IDS_MAX, type CustomerTaxId } from '@tallyui/core';

/** ADR-092 6a: the refusal of a tax id list order.create 12 could not carry (setTaxIds, setCustomer, tender entry, finalize). */
export const TAX_IDS_INVALID = 'Each tax id needs a type of at most 32 characters and a number of at most 64, no two the same; a country is a two-letter code, and a sale takes at most 10.';
/** A tax id's label is stored on the order but never sent; it is held to the 255 characters of the payload's other free text. */
const TAX_ID_LABEL_MAX = 255;

/**
 * #1064: the one tax-id rule. Trims every field, upper-cases the country and drops an empty country or label, returning a
 * new list of new entries; null when the list is one order.create 12 could not carry (too many, an empty or too long type
 * or value, a NUL, a country that is not two letters, a type and value twice, a too long label).
 */
export function cleanTaxIds(list: CustomerTaxId[]): CustomerTaxId[] | null {
  if (list.length > ORDER_TAX_IDS_MAX) return null;
  const seen = new Set<string>();
  const cleaned: CustomerTaxId[] = [];
  for (const taxId of list) {
    const type = taxId.type.trim(), value = taxId.value.trim(), country = taxId.country?.trim().toUpperCase(), label = taxId.label?.trim();
    const key = JSON.stringify([type, value]);
    if (!type || !value || type.length > ORDER_TAX_ID_TYPE_MAX || value.length > ORDER_TAX_ID_VALUE_MAX || seen.has(key)
      || [type, value, country, label].some((field) => field?.includes('\u0000'))
      || (country && !/^[A-Z]{2}$/.test(country)) || (label && label.length > TAX_ID_LABEL_MAX)) return null;
    seen.add(key);
    cleaned.push({ type, value, ...(country ? { country } : {}), ...(label ? { label } : {}) });
  }
  return cleaned;
}
