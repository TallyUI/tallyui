import type { CollectionSync, SyncContext, RemoteIdEntry } from '@tallyui/core';

/**
 * Medusa v2 product sync implementation.
 *
 * Uses the Medusa Admin API to fetch products with variants and pricing.
 * The Admin API gives us raw price data (vs Store API's calculated prices),
 * which is better for a POS that needs to know the actual price entries.
 */
export const medusaProductSync: CollectionSync = {
  async fetchAllIds(context: SyncContext): Promise<RemoteIdEntry[]> {
    const allIds: RemoteIdEntry[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await fetch(
        `${context.baseUrl}/admin/products?offset=${offset}&limit=${limit}&fields=id,updated_at`,
        {
          headers: {
            ...context.headers,
            'Content-Type': 'application/json',
          },
          signal: context.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`Medusa API error: ${response.status}`);
      }

      const data = await response.json();
      for (const product of data.products) {
        allIds.push({
          id: product.id,
          dateModified: product.updated_at,
        });
      }

      if (data.products.length < limit) break;
      offset += limit;
    }

    return allIds;
  },

  async fetchByIds(ids: string[], context: SyncContext): Promise<any[]> {
    // Medusa doesn't have a bulk "include" param like WooCommerce,
    // so we fetch individually (or use the list endpoint with id filter)
    const products: any[] = [];

    for (const id of ids) {
      const response = await fetch(
        `${context.baseUrl}/admin/products/${id}?fields=*variants,*variants.prices,*images,*categories,*tags,*options,*options.values`,
        {
          headers: {
            ...context.headers,
            'Content-Type': 'application/json',
          },
          signal: context.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`Medusa API error: ${response.status} for product ${id}`);
      }

      const data = await response.json();
      products.push(data.product);
    }

    return products;
  },

  async fetchModifiedAfter(date: string, context: SyncContext): Promise<any[]> {
    const response = await fetch(
      `${context.baseUrl}/admin/products?updated_at[gte]=${date}&limit=100&fields=*variants,*variants.prices,*images,*categories,*tags,*options,*options.values`,
      {
        headers: {
          ...context.headers,
          'Content-Type': 'application/json',
        },
        signal: context.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Medusa API error: ${response.status}`);
    }

    const data = await response.json();
    return data.products;
  },
};
