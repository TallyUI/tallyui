import { compareIds } from '@tallyui/core';
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
          outOfStockThreshold
          useGlobalOutOfStockThreshold
          enabled
          featuredAsset { id preview }
          options { id name code }
          ${barcodeField ? `customFields { ${barcodeField} }` : ''}
        }
      }
      totalItems
    }
  }
`;

/** The high-water mark and the skew probes only compare ids and timestamps (backlog 29). */
const PRODUCT_MARK_QUERY = `
  query GetProductsMark($options: ProductListOptions) {
    products(options: $options) {
      items { id updatedAt }
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

/**
 * Probes around a pass's high-water mark for the server's updatedAt skew
 * (ADR-060). `fetchTotal(after)` runs the caller's own list query (products,
 * variants) and returns its totalItems. Returns the mark actually probed
 * (backlog 31: `remark`, given, may re-read a newer one; see below).
 */
export async function probeUpdatedAtSkew(
  passHighWater: string,
  updatedAtSkewMs: number,
  fetchTotal: (after: string) => Promise<number>,
  remark?: () => Promise<string | undefined>,
): Promise<string> {
  for (const overlap of [1, 0]) {
    if (overlap === 0 && updatedAtSkewMs > 0) continue;
    const after = (mark: string) => new Date(Date.parse(mark) + (overlap === 0 ? 1 : -1) - updatedAtSkewMs).toISOString();
    let total = await fetchTotal(after(passHighWater));
    if (overlap === 1 && total === 0 && remark) {
      // The mark's own product can be deleted between the mark read and this
      // probe (harmless on its own: RxDB retries the resulting error and the
      // next mark read picks a survivor). Re-reading the mark once here means
      // that common case settles without throwing at all.
      const remarked = await remark();
      if (remarked) {
        passHighWater = remarked;
        total = await fetchTotal(after(passHighWater));
      }
    }
    if (overlap === 1 && total === 0) {
      throw new Error('Vendure updatedAt filters miss changes: run Vendure with TZ=UTC or set updatedAtSkewMs to at least the magnitude of the server UTC offset in milliseconds.');
    }
    if (overlap === 0 && total > 0) {
      console.warn('Vendure updatedAt filters over-fetch because the server is not in UTC.');
    }
  }
  return passHighWater;
}

/** Project an API product onto the schema's top-level fields (RxDB rejects undeclared ones). Sorts `variants` by id (a stable copy; the input is not mutated), since Vendure does not guarantee variant order. */
export function toProductDocument(p: any): Record<string, unknown> {
  const doc: Record<string, unknown> = { _deleted: false };
  for (const field of Object.keys(vendureProductSchema.properties)) {
    if (p[field] !== undefined) doc[field] = p[field];
  }
  if (Array.isArray(doc.variants)) {
    doc.variants = [...doc.variants].sort((a: any, b: any) => compareIds(a.id, b.id));
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
      // A checkpoint with skip > 0 but neither passHighWater nor passTotal is
      // the shape saved mid-pass by the code before #45 gave a pass its own
      // high-water mark and total (that code kept only skip and updatedAt).
      // Its skip counts offset pages under a different sort and a moving
      // updatedAt filter, which don't line up with this pull's fixed-window
      // paging by id: resuming at that offset could skip rows. Restarting the
      // pass from offset 0 cannot skip anything, only re-read rows this or an
      // earlier pass already applied, which RxDB's upsert makes harmless.
      if (lastCheckpoint?.skip && lastCheckpoint.passHighWater === undefined && lastCheckpoint.passTotal === undefined) {
        lastCheckpoint = { skip: 0, updatedAt: lastCheckpoint.updatedAt ?? '' };
      }
      let passHighWater = lastCheckpoint?.passHighWater ?? lastCheckpoint?.updatedAt ?? '';
      if (!lastCheckpoint?.skip) {
        const fetchMark = async () => {
          const head = await gql(context, PRODUCT_MARK_QUERY, { options: { take: 1, sort: { updatedAt: 'DESC' } } });
          return head.data?.products?.items?.[0]?.updatedAt as string | undefined;
        };
        const mark = await fetchMark();
        passHighWater = mark ?? lastCheckpoint?.updatedAt ?? '';
        // Same-ms writes after this read wait for a newer mark or periodic reconcile (ADR-060, to come).
        if (mark === undefined || (lastCheckpoint?.updatedAt && passHighWater === lastCheckpoint.updatedAt)) {
          return { documents: [], checkpoint: lastCheckpoint ?? { skip: 0, updatedAt: '' } };
        }
        passHighWater = await probeUpdatedAtSkew(passHighWater, updatedAtSkewMs, async (after) => {
          const probe = await gql(context, PRODUCT_MARK_QUERY, {
            options: { take: 1, sort: { updatedAt: 'DESC' }, filter: { updatedAt: { after } } },
          });
          return probe.data.products.totalItems;
        }, fetchMark);
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
