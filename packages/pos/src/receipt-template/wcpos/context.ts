import type { ReceiptConfig } from '../../receipt/types';
import type { WcposReceiptOptions, WcposReceiptStore } from './types';

/** The WCPOS store settings and app context today's `ReceiptConfig` and the store's tax mode can fill (#698 mapping §3). */
export function wcposReceiptContext(
  config: ReceiptConfig, tax: { pricesIncludeTax: boolean }, now?: () => Date,
): { store: WcposReceiptStore; options: WcposReceiptOptions } {
  const addressParts = (config.storeAddress ?? '').split('\n').filter((part) => part.trim() !== '');
  const store: WcposReceiptStore = {
    name: config.storeName,
    ...(addressParts.length ? { addressParts } : {}),
    // Stand-in (§3 store): the display mode follows the price mode, as TallyUI's own receipt prints.
    taxDisplayCart: tax.pricesIncludeTax ? 'incl' : 'excl',
    // Stand-in (§3 store): a TallyUI till always calculates tax.
    calcTaxes: true,
    pricesIncludeTax: tax.pricesIncludeTax,
  };
  const { software } = config;
  const options: WcposReceiptOptions = {
    ...(config.register && config.registerName ? { register: { id: config.register, name: config.registerName } } : {}),
    // Stand-in (§3 options): TallyUI keeps the cashier's name only, so the WCPOS user id is 0.
    ...(config.cashier ? { cashier: { id: 0, name: config.cashier } } : {}),
    pluginVersion: software?.plugin_version, appVersion: software?.app_version, appBuild: software?.app_build,
    // `fiscal.reprint_count` is the n-th reprint, so this print is the (n + 1)-th.
    printCount: (config.fiscal?.reprint_count ?? 0) + 1,
    ...(now ? { now } : {}),
  };
  return { store, options };
}
