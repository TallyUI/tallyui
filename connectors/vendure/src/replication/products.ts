import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

export type VendureProductCheckpoint = {
  skip: number;
  updatedAt: string;
};

const PRODUCT_LIST_QUERY = `
  query GetProducts($options: ProductListOptions) {
    products(options: $options) {
      items {
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
      totalItems
    }
  }
`;

const UPDATE_PRODUCT_MUTATION = `
  mutation UpdateProduct($input: UpdateProductInput!) {
    updateProduct(input: $input) {
      id
      updatedAt
    }
  }
`;

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

/**
 * Replication adapter for Vendure products.
 *
 * Implements pull (GraphQL query with offset pagination and updatedAt
 * filtering) and push (GraphQL updateProduct mutation). Designed for
 * use with RxDB's replicateRxCollection.
 */
export const vendureProductReplication: ReplicationAdapter<any, VendureProductCheckpoint> = {
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      const options: Record<string, any> = {
        take: batchSize,
        skip: lastCheckpoint?.skip ?? 0,
      };

      if (lastCheckpoint?.updatedAt) {
        options.filter = {
          updatedAt: { after: lastCheckpoint.updatedAt },
        };
      }

      const res = await gql(context, PRODUCT_LIST_QUERY, { options });

      if (res.errors?.length) {
        throw new Error(`Vendure GraphQL error: ${res.errors[0].message}`);
      }

      const data = res.data?.products;
      const products: any[] = data?.items ?? [];
      const documents = products.map((p) => ({ ...p, _deleted: false }));

      // Reset skip when batch is smaller than batchSize (end of page)
      const nextSkip = products.length < batchSize
        ? 0
        : (lastCheckpoint?.skip ?? 0) + products.length;

      const checkpoint: VendureProductCheckpoint = products.length > 0
        ? {
            skip: nextSkip,
            updatedAt: products[products.length - 1].updatedAt,
          }
        : lastCheckpoint ?? { skip: 0, updatedAt: '' };

      return { documents, checkpoint };
    },
  },

  push: {
    async handler(changeRows, context) {
      const conflicts: any[] = [];

      for (const row of changeRows) {
        const doc = row.newDocumentState as any;

        try {
          const res = await gql(context, UPDATE_PRODUCT_MUTATION, {
            input: doc,
          });

          if (res.errors?.length) {
            if (row.assumedMasterState) {
              conflicts.push({ ...row.assumedMasterState, _deleted: false });
            }
          }
        } catch {
          if (row.assumedMasterState) {
            conflicts.push({ ...row.assumedMasterState, _deleted: false });
          }
        }
      }

      return conflicts;
    },
  },
};
