import type { SyncContext } from '@tallyui/core';
import { gql } from './replication/products';

const GLOBAL_SETTINGS_QUERY = `
  query GlobalStockSettings {
    globalSettings { trackInventory outOfStockThreshold }
  }
`;

/**
 * The channel-wide stock defaults an `INHERIT` variant falls back to
 * (backlog 28). Read with `vendureGlobalStockSettings` after sign-in, like
 * `pricesIncludeTax` from `storeSettings`.
 */
export async function vendureGlobalStockSettings(context: SyncContext): Promise<{ trackInventory: boolean; outOfStockThreshold: number }> {
  const res = await gql(context, GLOBAL_SETTINGS_QUERY);
  return res.data.globalSettings;
}
