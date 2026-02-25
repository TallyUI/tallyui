import type { CollectionSync, SyncContext } from '@tallyui/core';

/**
 * GraphQL query fragments used by the Vendure sync.
 */
const PRODUCT_LIST_QUERY = `
  query GetProducts($options: ProductListOptions) {
    products(options: $options) {
      items {
        id
        updatedAt
      }
      totalItems
    }
  }
`;

const PRODUCT_DETAIL_QUERY = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      createdAt
      updatedAt
      name
      slug
      description
      enabled
      featuredAsset { id preview }
      assets { id preview }
      collections { id name slug }
      facetValues { id name code facet { id name } }
      variants {
        id
        name
        sku
        price
        priceWithTax
        currencyCode
        stockLevel
        stockOnHand
        trackInventory
        featuredAsset { id preview }
        options { id name code }
        customFields
      }
    }
  }
`;

/**
 * Vendure product sync implementation.
 *
 * Uses the Admin GraphQL API. Vendure uses offset-based pagination
 * with `take` and `skip` options.
 */
export const vendureProductSync: CollectionSync = {
  fetchAllIds: async (context: SyncContext) => {
    const entries: { id: string; dateModified?: string }[] = [];
    const take = 100;
    let skip = 0;
    let totalItems = Infinity;

    while (skip < totalItems) {
      const res = await gql(context, PRODUCT_LIST_QUERY, {
        options: { take, skip },
      });

      const data = res.data?.products;
      if (!data) break;

      totalItems = data.totalItems;
      for (const item of data.items ?? []) {
        entries.push({
          id: String(item.id),
          dateModified: item.updatedAt,
        });
      }

      skip += take;
    }

    return entries;
  },

  fetchByIds: async (ids: string[], context: SyncContext) => {
    const products: any[] = [];
    // Vendure doesn't support batch-by-IDs natively, so fetch individually
    for (const id of ids) {
      const res = await gql(context, PRODUCT_DETAIL_QUERY, { id });
      if (res.data?.product) {
        products.push(res.data.product);
      }
    }
    return products;
  },

  fetchModifiedAfter: async (date: string, context: SyncContext) => {
    const products: any[] = [];
    const take = 100;
    let skip = 0;
    let totalItems = Infinity;

    while (skip < totalItems) {
      const res = await gql(context, PRODUCT_LIST_QUERY, {
        options: {
          take,
          skip,
          filter: {
            updatedAt: { after: date },
          },
        },
      });

      const data = res.data?.products;
      if (!data) break;

      totalItems = data.totalItems;

      // Fetch full details for each modified product
      for (const item of data.items ?? []) {
        const detail = await gql(context, PRODUCT_DETAIL_QUERY, { id: item.id });
        if (detail.data?.product) {
          products.push(detail.data.product);
        }
      }

      skip += take;
    }

    return products;
  },
};

/**
 * Helper to execute a GraphQL query against the Vendure Admin API.
 */
async function gql(
  context: SyncContext,
  query: string,
  variables?: Record<string, any>,
): Promise<any> {
  const res = await fetch(`${context.baseUrl}/admin-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...context.headers,
    },
    body: JSON.stringify({ query, variables }),
    signal: context.signal,
  });

  if (!res.ok) throw new Error(`Vendure API error: ${res.status}`);
  return res.json();
}
