import { describe, it, expect } from 'vitest';
import { medusaProductTraits } from '@tallyui/connector-medusa';
import { wooProductTraits } from '@tallyui/connector-woocommerce';
import { searchProducts } from './search-products';

const medusaDocs = [
  { id: 'p1', title: 'Vintage Tee', variants: [{ sku: 'TLY-00001-S', barcode: '2000001000007' }] },
  { id: 'p2', title: 'Nordic Mug', variants: [{ sku: 'TLY-00002', barcode: '2000002000004' }] },
  { id: 'p3', title: 'Vintage Mug Set', variants: [{ sku: 'TLY-00003', barcode: null }] },
];

describe('searchProducts', () => {
  it('returns everything for an empty term', () => {
    expect(searchProducts(medusaDocs, '  ', medusaProductTraits)).toBe(medusaDocs);
  });

  it('matches every word against the name, in any order, ignoring case', () => {
    const ids = searchProducts(medusaDocs, 'mug VINTAGE', medusaProductTraits).map((d) => d.id);
    expect(ids).toEqual(['p3']);
  });

  it('matches SKU fragments', () => {
    const ids = searchProducts(medusaDocs, 'tly-0000', medusaProductTraits).map((d) => d.id);
    expect(ids).toEqual(['p1', 'p2', 'p3']);
  });

  it('returns only the exact barcode hit for a scanned code', () => {
    const ids = searchProducts(medusaDocs, '2000002000004', medusaProductTraits).map((d) => d.id);
    expect(ids).toEqual(['p2']);
  });

  it("matches a second variant's barcode and SKU through getVariants", () => {
    const product = {
      id: 'p4', title: 'Variant Tee', variants: [
        { id: 'v1', sku: 'TEE-S', barcode: '5000000000001' },
        { id: 'v2', sku: 'TEE-M', barcode: '5000000000002' },
      ],
    };
    expect(searchProducts([product], '5000000000002', medusaProductTraits)).toEqual([product]);
    expect(searchProducts([product], 'TEE-M', medusaProductTraits)).toEqual([product]);
  });

  it('without getVariants, search behaves as before', () => {
    const traits = { ...medusaProductTraits };
    delete traits.getVariants;
    expect(searchProducts(medusaDocs, '2000002000004', traits)).toEqual([medusaDocs[1]]);
    expect(searchProducts(medusaDocs, 'TLY-00002', traits)).toEqual([medusaDocs[1]]);
  });

  it('works on another backend shape through its traits', () => {
    const wooDocs = [
      { id: 1, name: 'Espresso Beans', sku: 'ESP-1' },
      { id: 2, name: 'Oat Milk', sku: 'OAT-1' },
    ];
    expect(searchProducts(wooDocs, 'espresso', wooProductTraits).map((d) => d.id)).toEqual([1]);
  });
});
