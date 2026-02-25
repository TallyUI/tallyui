import { describe, it, expect } from 'vitest';
import { wooProductTraits } from '@tallyui/connector-woocommerce';
import { toWooProduct } from '../transforms/woocommerce';
import { products } from '../data/catalog';

describe('toWooProduct', () => {
  const neutral = products[0]; // Espresso Machine Pro
  const woo = toWooProduct(neutral, 1); // second arg is numeric WooCommerce ID

  it('maps name correctly', () => {
    expect(wooProductTraits.getName(woo)).toBe(neutral.name);
  });

  it('maps SKU correctly', () => {
    expect(wooProductTraits.getSku(woo)).toBe(neutral.variants[0].sku);
  });

  it('maps price as decimal string', () => {
    // neutral price is in cents (129900) -> WooCommerce expects "1299.00"
    expect(woo.price).toBe('1299.00');
    expect(wooProductTraits.getPrice(woo)).toBe('1299.00');
  });

  it('maps stock status', () => {
    expect(woo.stock_status).toBe('instock');
    expect(wooProductTraits.getStockStatus(woo)).toBe('instock');
  });

  it('maps images with src field', () => {
    expect(woo.images[0].src).toBe(neutral.images[0].url);
    expect(wooProductTraits.getImageUrl(woo)).toBe(neutral.images[0].url);
  });

  it('maps categories', () => {
    expect(wooProductTraits.getCategoryNames(woo)).toEqual(
      neutral.categories.map((c) => c.name)
    );
  });

  it('maps barcode', () => {
    expect(woo.barcode).toBe(neutral.variants[0].barcode);
    expect(wooProductTraits.getBarcode(woo)).toBe(neutral.variants[0].barcode);
  });

  it('sets on_sale when compareAtPrice exists', () => {
    const saleProduct = products.find((p) =>
      p.variants.some((v) => v.compareAtPrice !== null)
    )!;
    const wooSale = toWooProduct(saleProduct, 99);
    expect(wooSale.on_sale).toBe(true);
    expect(wooProductTraits.isOnSale(wooSale)).toBe(true);
    expect(parseFloat(wooSale.sale_price)).toBeLessThan(
      parseFloat(wooSale.regular_price)
    );
  });

  it('maps type correctly', () => {
    const variable = products.find((p) => p.type === 'variable')!;
    const wooVariable = toWooProduct(variable, 50);
    expect(wooVariable.type).toBe('variable');
    expect(wooProductTraits.hasVariants(wooVariable)).toBe(true);
  });
});
