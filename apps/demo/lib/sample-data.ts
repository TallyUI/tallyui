import { products } from '@tallyui/mock-api/data';
import { toWooProduct, toMedusaProduct } from '@tallyui/mock-api/transforms';

/**
 * Sample WooCommerce product documents.
 * Generated from the shared mock catalog via mock-api transforms.
 */
export const wooSampleProducts = products.slice(0, 6).map((p, i) => toWooProduct(p, i + 1));

/**
 * An 8th Medusa product this sales channel doesn't sell: every variant's
 * `calculated_price` is `null`, as the Store API returns for a product
 * outside the till's channel or region (D2b). `status` stays `published` so
 * `traits.isSellable` is false for that reason alone, matching the real
 * scenario; the demo's product grid hides it unless `showUnsellable`.
 */
const unsellableMedusaProduct = {
  ...toMedusaProduct(products[7]),
  id: 'prod_channel-exclusive',
  title: `${products[7].name} (other channel)`,
  status: 'published',
  variants: toMedusaProduct(products[7]).variants.map((variant) => ({ ...variant, calculated_price: null })),
};

/**
 * Sample Medusa product documents.
 * Generated from the shared mock catalog via mock-api transforms.
 *
 * `status` is set explicitly to `published` — the schema defaults an absent
 * one to `draft`, which would make every sample product unsellable. The 7th
 * product (the first coffee bean, sold in 250g/500g/1kg variants at
 * different prices) shows the demo's "from" price. The 8th,
 * `unsellableMedusaProduct`, isn't sold in this channel.
 */
export const medusaSampleProducts = [
  ...products.slice(0, 7).map((p) => ({ ...toMedusaProduct(p), status: 'published' })),
  unsellableMedusaProduct,
];
