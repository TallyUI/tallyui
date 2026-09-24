import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

export type VendureProductCheckpoint = {
  skip: number;
  updatedAt: string;
  passMax?: string;
};

const PRODUCT_LIST_QUERY = (barcodeField?: string) => `
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
          stockLevels { stockLocationId stockOnHand stockAllocated }
          trackInventory
          featuredAsset { id preview }
          options { id name code }
          ${barcodeField ? `customFields { ${barcodeField} }` : ''}
        }
      }
      totalItems
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
 * Pull-only (GraphQL query with offset pagination and updatedAt filtering)
 * for RxDB's replicateRxCollection. Catalogue data is server-owned; the
 * POS never writes products.
 */
export const createVendureProductReplication = (barcodeField?: string): ReplicationAdapter<any, VendureProductCheckpoint> => ({
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      if (batchSize > 1000) throw new Error('Vendure Admin API take must not exceed 1000');
      const options: Record<string, any> = {
        take: batchSize,
        skip: lastCheckpoint?.skip ?? 0,
        sort: { id: 'ASC' },
      };

      if (lastCheckpoint?.updatedAt) {
        options.filter = {
          // Vendure after is strict; overlap by 1 ms to include timestamp ties.
          updatedAt: { after: new Date(Date.parse(lastCheckpoint.updatedAt) - 1).toISOString() },
        };
      }

      const res = await gql(context, PRODUCT_LIST_QUERY(barcodeField), { options });

      if (res.errors?.length) {
        throw new Error(`Vendure GraphQL error: ${res.errors[0].message}`);
      }

      const data = res.data?.products;
      const products: any[] = data?.items ?? [];
      const documents = products.map((p) => ({ ...p, _deleted: false }));

      // Keep the lower bound fixed while paging by id; advance it only at pass end.
      const passMax = products.reduce(
        (max, p) => p.updatedAt > max ? p.updatedAt : max,
        lastCheckpoint?.passMax ?? lastCheckpoint?.updatedAt ?? '',
      );
      const checkpoint: VendureProductCheckpoint = products.length >= batchSize
        ? { skip: (lastCheckpoint?.skip ?? 0) + products.length,
            updatedAt: lastCheckpoint?.updatedAt ?? '', passMax }
        : { skip: 0, updatedAt: passMax };

      return { documents, checkpoint };
    },
  },
});

export const vendureProductReplication = createVendureProductReplication();
