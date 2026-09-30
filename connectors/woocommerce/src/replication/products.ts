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
};

// RxDB drops the checkpoint of an empty result, so the handler moves on to the next useful request
// in the same call instead; every fetch in one call, mark requests included, counts against this.
const MAX_REQUESTS_PER_CALL = 4;

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
    handler: async function pull(lastCheckpoint, batchSize, context, requests = 0): Promise<{ documents: any[]; checkpoint: WooProductCheckpoint }> {
      const modified = lastCheckpoint?.modified ?? '';
      const offset = lastCheckpoint?.offset ?? 0;
      // Budget spent: a call never fetches after gathering documents, so return [] and let the stored checkpoint stand.
      const spent = { documents: [], checkpoint: lastCheckpoint ?? { modified, offset } };
      let passMark = lastCheckpoint?.pass_mark ?? modified;
      if (offset === 0 && lastCheckpoint?.pass_mark === undefined) {
        if (requests++ >= MAX_REQUESTS_PER_CALL) return spent;
        const markResponse = await fetch(
          `${context.baseUrl}/products?per_page=1&orderby=modified&order=desc`,
          { headers: { ...context.headers, 'Content-Type': 'application/json' }, signal: context.signal },
        );
        checkResponse(markResponse);
        const [newest] = await markResponse.json();
        // No product of any status the pull can see: every window is empty.
        if (newest === undefined) return { documents: [], checkpoint: lastCheckpoint ?? { modified: '', offset: 0 } };
        passMark = newest.date_modified_gmt ?? modified;
        // The newest product is at or below the lower bound (e.g. the newest was trashed): the window adds nothing.
        if (lastCheckpoint?.modified && passMark <= modified) return { documents: [], checkpoint: lastCheckpoint };
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

      if (requests++ >= MAX_REQUESTS_PER_CALL) return spent;
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
      if (offset > 0 && count !== undefined && (products.length === 0 || count < (lastCheckpoint?.pass_count ?? count))) {
        // Restart the pass in this call, so RxDB stores its first page's checkpoint; the request budget bounds the call.
        return pull({ modified, offset: 0, pass_mark: passMark }, batchSize, context, requests);
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
        ? { modified: passMark, offset: 0, pass_mark: undefined, pass_count: undefined }
        : { modified, offset: offset + products.length, pass_mark: passMark, pass_count: count };
      if (complete && products.length === 0) {
        // Chain into the next pass: RxDB would drop this completion with the empty result. While the next pass
        // has nothing either, each poll re-derives these requests from the stored checkpoint, at most
        // MAX_REQUESTS_PER_CALL of them.
        const next = await pull({ modified: passMark, offset: 0 }, batchSize, context, requests);
        return next.documents.length > 0 ? next : { documents: [], checkpoint: lastCheckpoint ?? checkpoint };
      }

      return { documents, checkpoint };
    },
  },
};
