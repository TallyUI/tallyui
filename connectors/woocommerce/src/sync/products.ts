import type { CollectionSync, SyncContext, RemoteIdEntry } from '@tallyui/core';

/**
 * WooCommerce product sync implementation.
 *
 * Uses the WooCommerce REST API (or WCPOS API) to fetch products.
 * For the MVP, this is a simple implementation that fetches all products.
 * The full WCPOS sync engine has much more sophisticated diffing/queueing.
 */
export const wooProductSync: CollectionSync = {
  async fetchAllIds(context: SyncContext): Promise<RemoteIdEntry[]> {
    const response = await fetch(`${context.baseUrl}/products`, {
      headers: {
        ...context.headers,
        'Content-Type': 'application/json',
      },
      signal: context.signal,
    });

    if (!response.ok) {
      throw new Error(`WooCommerce API error: ${response.status}`);
    }

    const products = await response.json();
    return products.map((p: any) => ({
      id: String(p.id),
      dateModified: p.date_modified_gmt,
    }));
  },

  async fetchByIds(ids: string[], context: SyncContext): Promise<any[]> {
    // WooCommerce supports ?include=1,2,3 for bulk fetching
    const include = ids.join(',');
    const response = await fetch(
      `${context.baseUrl}/products?include=${include}&per_page=${ids.length}`,
      {
        headers: {
          ...context.headers,
          'Content-Type': 'application/json',
        },
        signal: context.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`WooCommerce API error: ${response.status}`);
    }

    return response.json();
  },

  async fetchModifiedAfter(date: string, context: SyncContext): Promise<any[]> {
    const response = await fetch(
      `${context.baseUrl}/products?modified_after=${date}&per_page=100`,
      {
        headers: {
          ...context.headers,
          'Content-Type': 'application/json',
        },
        signal: context.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`WooCommerce API error: ${response.status}`);
    }

    return response.json();
  },
};
