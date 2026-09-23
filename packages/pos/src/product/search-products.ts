import type { ProductTraits } from '@tallyui/core';

/**
 * Filters product documents by a cashier's search term, through traits, so
 * it works the same on every backend.
 *
 * Every word of the term must appear in the product name, SKU or barcode
 * (case-insensitive, any order). A term that exactly equals a barcode or SKU
 * returns just those products, so a scanner hit is never buried among name
 * matches. An empty term returns the input unchanged.
 */
export function searchProducts<Doc>(docs: Doc[], term: string, traits: ProductTraits<Doc>): Doc[] {
  const query = term.trim().toLowerCase();
  if (!query) return docs;

  const codes = (doc: Doc) =>
    [traits.getSku(doc), traits.getBarcode(doc)]
      .filter((code): code is string => Boolean(code))
      .map((code) => code.toLowerCase());

  const exact = docs.filter((doc) => codes(doc).includes(query));
  if (exact.length) return exact;

  const words = query.split(/\s+/);
  return docs.filter((doc) => {
    const haystack = [traits.getName(doc).toLowerCase(), ...codes(doc)].join(' ');
    return words.every((word) => haystack.includes(word));
  });
}
