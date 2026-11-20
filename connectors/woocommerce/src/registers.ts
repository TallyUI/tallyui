import type { RegisterInfo, SyncContext } from '@tallyui/core';
import { wooMinorFromDecimal } from './commands/transport';
import { throwIfUnauthorized } from './unauthorized';

/** The first store from `GET stores` and its currency, upper-cased. */
async function wooFirstStore(context: SyncContext): Promise<{ currency: string; store: Record<string, unknown> }> {
  const init = { method: 'GET', headers: context.headers, signal: context.signal };
  const storesResponse = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/stores`, init);
  throwIfUnauthorized(storesResponse, 'stores');
  if (!storesResponse.ok) throw new Error(`WooCommerce stores: HTTP ${storesResponse.status}`);
  const stores = await storesResponse.json();
  if (!Array.isArray(stores) || stores.length === 0) throw new Error('WooCommerce stores: expected a non-empty array');
  const store = stores[0];
  if (typeof store?.currency !== 'string') throw new Error('WooCommerce stores: expected a currency');
  return { currency: store.currency.toUpperCase(), store };
}

/** The store currency (`stores[0].currency`), upper-cased. */
export async function wooStoreCurrency(context: SyncContext): Promise<string> {
  return (await wooFirstStore(context)).currency;
}

/** WCPOS 2.0's registers (`GET registers`), with the float in the store currency's minor units; `[]` below 2.0 (no route). */
export async function wooListRegisters(context: SyncContext): Promise<RegisterInfo[]> {
  const init = { method: 'GET', headers: context.headers, signal: context.signal };
  const { currency, store } = await wooFirstStore(context);
  // WCPOS sets the close time per store; core reads it per register.
  const closeTime = typeof store.expected_close_time === 'string' && /^\d{2}:\d{2}$/.test(store.expected_close_time)
    ? store.expected_close_time : undefined;

  const response = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/registers`, init);
  throwIfUnauthorized(response, 'registers');
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`WooCommerce registers: HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('WooCommerce registers: expected an array');
  // Every register, whatever its store_id: multi-store selection (AUDIT 213) is out of scope.
  const registers: RegisterInfo[] = [];
  for (const row of rows) {
    if (typeof row?.id !== 'string' || row.id === '' || typeof row.name !== 'string' || row.name === '') {
      console.warn('WooCommerce registers: skipping a register without an id or name');
      continue;
    }
    const float = typeof row.default_float === 'string' ? wooMinorFromDecimal(row.default_float, currency) : undefined;
    registers.push({
      id: row.id,
      name: row.name,
      ...(float !== undefined ? { defaultFloatMinor: float } : {}),
      ...(closeTime !== undefined ? { expectedCloseTime: closeTime } : {}),
    });
  }
  return registers;
}
