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
 *
 * The 7th product (the first coffee bean, sold in 250g/500g/1kg variants at
 * different prices) shows the demo's "from" price.
 */
export const medusaSampleProducts = products.slice(0, 7).map(toMedusaProduct);
