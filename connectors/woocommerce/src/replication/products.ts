import { ConnectorUnauthorizedError, type ReplicationAdapter } from '@tallyui/core';

export type WooProductCheckpoint = {
  /** Inclusive lower bound (date_modified_gmt) of the current pass; '' = the whole catalogue. */
  modified: string;
  /** Rows of the current pass already returned, in id order. */
  offset: number;
  /** Newest date_modified_gmt in the store when the pass started; the next pass's lower bound. */
  pass_mark?: string;
  /** X-WP-Total of the window on the last page; undefined when the store sends none. */
  pass_count?: number;
  /** Times the current pass has restarted at offset 0 after its window shrank. */
  restarts?: number;
};

// A store losing products between every page must not keep one pass from ever finishing.
const MAX_PASS_RESTARTS = 3;

function checkResponse(response: Response) {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    throw new ConnectorUnauthorizedError(`WooCommerce API error: ${response.status}`, response.status);
  }
  throw new Error(`WooCommerce API error: ${response.status}`);
}

export class WooMissingUuidError extends Error {
  name = 'WooMissingUuidError';
  productId: number;

  constructor(id: number) {
    super(`WooCommerce product ${id} has no uuid: the store must run the WCPOS Free plugin (1.10.0 or later) and be reached through its wcpos/v2 routes`);
    this.productId = id;
  }
}

/**
 * Replication adapter for WooCommerce products.
 *
 * Pull-only (id-ordered offset pages within a date_modified_gmt window) for RxDB's
 * replicateRxCollection. Catalogue data is server-owned; the POS never
 * writes products.
 */
export const wooProductReplication: ReplicationAdapter<any, WooProductCheckpoint> = {
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      const modified = lastCheckpoint?.modified ?? '';
      const offset = lastCheckpoint?.offset ?? 0;
      let passMark = lastCheckpoint?.pass_mark ?? modified;
      if (offset === 0 && lastCheckpoint?.pass_mark === undefined) {
        const markResponse = await fetch(
          `${context.baseUrl}/products?per_page=1&orderby=modified&order=desc`,
          { headers: { ...context.headers, 'Content-Type': 'application/json' }, signal: context.signal },
        );
        checkResponse(markResponse);
        passMark = (await markResponse.json())[0]?.date_modified_gmt ?? modified;
        if (lastCheckpoint?.modified && passMark === modified) return { documents: [], checkpoint: lastCheckpoint };
      }
      const params = new URLSearchParams({
        per_page: String(batchSize),
        offset: String(offset),
        orderby: 'id',
        order: 'asc',
      });

      if (modified) {
        params.set('modified_after', new Date(Date.parse(modified + 'Z') - 1000).toISOString().slice(0, 19));
        params.set('dates_are_gmt', 'true');
      }

      const response = await fetch(`${context.baseUrl}/products?${params}`, {
        headers: {
          ...context.headers,
          'Content-Type': 'application/json',
        },
        signal: context.signal,
      });

      checkResponse(response);

      const products: any[] = await response.json();
      const total = response.headers.get('X-WP-Total');
      const count = total !== null && /^\d+$/.test(total) ? Number(total) : undefined;
      const restarts = lastCheckpoint?.restarts ?? 0;
      if (offset > 0 && count !== undefined && restarts < MAX_PASS_RESTARTS && (products.length === 0 || count < (lastCheckpoint?.pass_count ?? count))) {
        return wooProductReplication.pull.handler({ modified, offset: 0, pass_mark: passMark, restarts: restarts + 1 }, batchSize, context);
      }
      for (const product of products) {
        if (typeof product.uuid !== 'string' || product.uuid.length === 0) {
          throw new WooMissingUuidError(product.id);
        }
      }
      const documents = products.map((p) => ({ ...p, _deleted: p.status !== 'publish' }));

      // RxDB merges checkpoints, so clear pass state explicitly at completion.
      const complete = count === undefined ? products.length < batchSize : offset + products.length >= count;
      const checkpoint: WooProductCheckpoint = complete
        ? { modified: passMark, offset: 0, pass_mark: undefined, pass_count: undefined, restarts: undefined }
        : { modified, offset: offset + products.length, pass_mark: passMark, pass_count: count, restarts: lastCheckpoint?.restarts };

      return { documents, checkpoint };
    },
  },
};
