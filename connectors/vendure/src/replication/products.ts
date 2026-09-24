import type { ReplicationAdapter, SyncContext } from '@tallyui/core';
import { vendureProductSchema } from '../schemas/products';

export type VendureProductCheckpoint = {
  skip: number;
  updatedAt: string;
  passMax?: string;
  passHighWater?: string;
  passTotal?: number;
};

export const PRODUCT_LIST_QUERY = (barcodeField?: string) => `
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
export async function gql(
  context: SyncContext,
  query: string,
  variables?: Record<string, any>,
): Promise<any> {
  type GqlBody = { data?: any; errors?: Array<{ message?: string }> };
  const res = await fetch(`${context.baseUrl}/admin-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...context.headers,
    },
    body: JSON.stringify({ query, variables }),
    signal: context.signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => undefined) as GqlBody | undefined;
    const message = body?.errors?.[0]?.message;
    throw new Error(`Vendure API error: ${res.status}${message ? `: ${message}` : ''}`);
  }
  const body = await res.json() as GqlBody;
  if (body.errors?.length) throw new Error(`Vendure GraphQL error: ${body.errors[0].message}`);
  return body;
}

/** Project an API product onto the schema's top-level fields (RxDB rejects undeclared ones). */
export function toProductDocument(p: any): Record<string, unknown> {
  const doc: Record<string, unknown> = { _deleted: false };
  for (const field of Object.keys(vendureProductSchema.properties)) {
    if (p[field] !== undefined) doc[field] = p[field];
  }
  return doc;
}

/**
 * Replication adapter for Vendure products.
 *
 * Pull-only (GraphQL query with offset pagination and updatedAt filtering)
 * for RxDB's replicateRxCollection. Catalogue data is server-owned; the
 * POS never writes products.
 */
export const createVendureProductReplication = (barcodeField?: string, updatedAtSkewMs = 0): ReplicationAdapter<any, VendureProductCheckpoint> => ({
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      if (batchSize > 1000) throw new Error('Vendure Admin API take must not exceed 1000');
      let passHighWater = lastCheckpoint?.passHighWater ?? lastCheckpoint?.updatedAt ?? '';
      if (!lastCheckpoint?.skip) {
        const head = await gql(context, PRODUCT_LIST_QUERY(barcodeField), {
          options: { take: 1, sort: { updatedAt: 'DESC' } },
        });
        passHighWater = head.data?.products?.items?.[0]?.updatedAt ?? lastCheckpoint?.updatedAt ?? '';
        // Same-ms writes after this read wait for a newer mark or periodic reconcile (ADR-060, to come).
        if (!head.data?.products?.items?.length || (lastCheckpoint?.updatedAt && passHighWater === lastCheckpoint.updatedAt)) {
          return { documents: [], checkpoint: lastCheckpoint ?? { skip: 0, updatedAt: '' } };
        }
        for (const overlap of [1, 0]) {
          if (overlap === 0 && updatedAtSkewMs > 0) continue;
          const probe = await gql(context, PRODUCT_LIST_QUERY(barcodeField), {
            options: { take: 1, sort: { updatedAt: 'DESC' }, filter: {
              updatedAt: { after: new Date(Date.parse(passHighWater) + (overlap === 0 ? 1 : -1) - updatedAtSkewMs).toISOString() },
            } },
          });
          if (overlap === 1 && probe.data.products.totalItems === 0) {
            throw new Error('Vendure updatedAt filters miss changes: run Vendure with TZ=UTC or set updatedAtSkewMs to at least the magnitude of the server UTC offset in milliseconds.');
          }
          if (overlap === 0 && probe.data.products.totalItems > 0) {
            console.warn('Vendure updatedAt filters over-fetch because the server is not in UTC.');
          }
        }
      }
      const options: Record<string, any> = {
        take: batchSize,
        skip: lastCheckpoint?.skip ?? 0,
        sort: { id: 'ASC' },
      };

      if (lastCheckpoint?.updatedAt) {
        options.filter = {
          // Vendure after is strict; overlap by 1 ms to include timestamp ties.
          updatedAt: { after: new Date(Date.parse(lastCheckpoint.updatedAt) - 1 - updatedAtSkewMs).toISOString() },
        };
      }

      const res = await gql(context, PRODUCT_LIST_QUERY(barcodeField), { options });

      let data = res.data?.products;
      let passTotal = options.skip === 0 ? data.totalItems : lastCheckpoint?.passTotal ?? data.totalItems;
      if (options.skip > 0 && data.totalItems < passTotal) {
        options.skip = 0;
        const restarted = await gql(context, PRODUCT_LIST_QUERY(barcodeField), { options });
        data = restarted.data?.products;
        passTotal = data.totalItems;
      }
      const products: any[] = data?.items ?? [];
      if (!products.length && options.skip > 0) {
        return createVendureProductReplication(barcodeField, updatedAtSkewMs).pull.handler(
          { skip: 0, updatedAt: lastCheckpoint?.updatedAt ?? '' }, batchSize, context,
        );
      }
      const documents = products.map(toProductDocument);

      // Keep the lower bound fixed while paging by id; advance it only at pass end.
      // RxDB merges checkpoints, so explicitly clear pass state at completion.
      const checkpoint: VendureProductCheckpoint = options.skip + products.length >= data.totalItems
        ? { skip: 0, updatedAt: passHighWater, passHighWater: undefined, passTotal: undefined }
        : { skip: options.skip + products.length,
            updatedAt: lastCheckpoint?.updatedAt ?? '', passHighWater, passTotal };

      return { documents, checkpoint };
    },
  },
});

export const vendureProductReplication = createVendureProductReplication();
