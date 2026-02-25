import { products } from '@tallyui/mock-api/data';
import { toWooProduct, toMedusaProduct } from '@tallyui/mock-api/transforms';

/**
 * Sample WooCommerce product documents.
 * Generated from the shared mock catalog via mock-api transforms.
 */
export const wooSampleProducts = products.slice(0, 6).map((p, i) => toWooProduct(p, i + 1));

/**
 * Sample Medusa product documents.
 * Generated from the shared mock catalog via mock-api transforms.
 */
export const medusaSampleProducts = products.slice(0, 6).map(toMedusaProduct);
