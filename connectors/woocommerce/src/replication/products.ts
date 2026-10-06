import { ConnectorUnauthorizedError, type ReplicationAdapter } from '@tallyui/core';
import { wooProductSchema } from '../schemas/products';

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
// in the same call instead; product and mark requests in one call count against this.
const MAX_REQUESTS_PER_CALL = 4;

/** The most of a foreign 426's message kept in the error, so a store's long page never floods the log; longer is cut with "…". */
const MAX_STORE_MESSAGE = 200;

export async function checkResponse(response: Response) {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    // A jwt_auth_* 403 is the store's JWT layer refusing the token, on any WCPOS version (#360).
    const body = response.status === 403 ? await response.json().catch(() => undefined) : undefined;
    if (typeof body?.code === 'string' && body.code.startsWith('jwt_auth_')) throw new WooTokenRefusedError(body.code);
    throw new ConnectorUnauthorizedError(`WooCommerce API error: ${response.status}`, response.status as 401 | 403);
  }
  if (response.status === 426) {
    // Only the plugin's own gate means the till needs updating; any other 426 is retried as transient, with the store's message.
    const body = await response.json().catch(() => undefined);
    if (body?.code === 'wcpos_update_required') throw new WooTillUpdateRequiredError(body.code);
    // `426 (code): message`, each part only when the body has it.
    const code = typeof body?.code === 'string' && body.code ? ` (${body.code})` : '';
    const text = typeof body?.message === 'string' ? body.message : '';
    const message = text ? `: ${text.length > MAX_STORE_MESSAGE ? `${text.slice(0, MAX_STORE_MESSAGE)}…` : text}` : '';
    throw new Error(`WooCommerce API error: 426${code}${message}`);
  }
  throw new Error(`WooCommerce API error: ${response.status}`);
}

/** WCPOS's protocol gate refused this till (HTTP 426 with `wcpos_update_required`): only updating the till fixes it. */
export class WooTillUpdateRequiredError extends Error {
  name = 'WooTillUpdateRequiredError';
  readonly code = 'till_update_required' as const;
  /** Only updating this till fixes it, so the pull pauses until resume() (`errorKind`). */
  readonly fixedBy = 'till' as const;

  /** The body's `code`, kept for diagnostics. */
  constructor(readonly serverCode: string | undefined) {
    super('WooCommerce API error: 426: this till needs updating to sync with the store');
  }
}

export class WooMissingUuidError extends Error {
  name = 'WooMissingUuidError';
  readonly code = 'missing_plugin' as const;
  /** Only the store owner can fix it, by installing or enabling the plugin, so the pull waits the store delay (`errorKind`). */
  readonly fixedBy = 'store' as const;
  productId: number;

  constructor(id: number) {
    super(`WooCommerce product ${id} has no uuid: the store must run the WCPOS Free plugin (1.10.0 or later) and be reached through its wcpos/v2 routes`);
    this.productId = id;
  }
}

/** WCPOS's own uuid meta key; 1.10.x sends the product uuid only here (Uuid_Handler.php:29). */
export const WCPOS_UUID_META_KEY = '_woocommerce_pos_uuid';

/** The product's uuid: top-level `uuid` (the `next` shape) wins, else the `_woocommerce_pos_uuid` meta (1.10.x). */
export function wooProductUuid(product: any): string | undefined {
  if (typeof product.uuid === 'string' && product.uuid.length > 0) return product.uuid;
  return product.meta_data?.find((entry: any) =>
    entry.key === WCPOS_UUID_META_KEY && typeof entry.value === 'string' && entry.value.length > 0)?.value;
}

/** The product's barcode: top-level `barcode` wins, else `global_unique_id` (WCPOS's default barcode field), else undefined. */
export function wooProductBarcode(product: any): string | undefined {
  if (typeof product.barcode === 'string' && product.barcode.length > 0) return product.barcode;
  if (typeof product.global_unique_id === 'string' && product.global_unique_id.length > 0) return product.global_unique_id;
  return undefined;
}

export function toVariationDocument(payload: any) {
  const { id, sku, price, regular_price, sale_price, on_sale, stock_status,
    stock_quantity, manage_stock, status, purchasable } = payload;
  return Object.fromEntries(Object.entries({
    id, sku, barcode: wooProductBarcode(payload), price, regular_price, sale_price, on_sale,
    stock_status, stock_quantity, manage_stock, status, purchasable,
    attributes: (payload.attributes ?? []).map(({ name, option }: any) => ({ name, option })),
  }).filter(([, value]) => value !== undefined));
}

/**
 * One product row as the till stores it, the rule the pull and the reconcile feed share: a uuid is
 * required (WooMissingUuidError), and a product that is not published arrives deleted (#229).
 */
export function toProductDocument(product: any): any {
  const uuid = wooProductUuid(product);
  if (uuid === undefined) throw new WooMissingUuidError(product.id);
  const barcode = wooProductBarcode(product);
  const projected = Object.fromEntries(Object.keys(wooProductSchema.properties)
    .filter((key) => Object.prototype.hasOwnProperty.call(product, key))
    .map((key) => [key, product[key]]));
  return { ...projected, uuid, ...(barcode !== undefined ? { barcode } : {}), _deleted: product.status !== 'publish' };
}

/** The store returned a product outside a modified_after window, so it does not apply the filter. */
export class WooDateFilterError extends Error {
  name = 'WooDateFilterError';
  readonly code = 'unsupported_store' as const;
  /** Only the store owner can fix it, by updating WooCommerce, so the pull waits the store delay (`errorKind`). */
  readonly fixedBy = 'store' as const;
  /** The software to update, for `SyncStatus`'s detail; the component never names it itself. */
  readonly software = 'WooCommerce';
  /** The first WooCommerce version that applies `modified_after` (5.8). */
  readonly minVersion = '5.8';

  constructor(readonly productId: number | undefined, readonly bound: string, readonly received: string | undefined) {
    super('This store needs WooCommerce 5.8 or later to sync products.');
  }
}

/**
 * A `jwt_auth_*` 403: the store's JWT Authentication plugin refused the till's token. WCPOS 1.10.0–1.10.7 sent it for a valid token
 * (wcpos/woocommerce-pos#1863); 1.10.8 and later can still send it when the token resolves to another user. So the
 * message names no version: a version hint belongs only where a response itself carries the WCPOS version (#360).
 */
export class WooTokenRefusedError extends Error {
  name = 'WooTokenRefusedError';
  readonly code = 'store_misconfigured' as const;
  /** The store owner fixes it on the store, so the pull waits the store delay and the till stays signed in (`errorKind`). */
  readonly fixedBy = 'store' as const;
  /** The store-side remedy, for `SyncStatus`'s detail. */
  readonly fix = "check the JWT Authentication plugin's settings";

  constructor(readonly storeCode: string) {
    super("The store refused the sign-in token (403). Ask the store owner to check the JWT Authentication plugin's settings, or pair the till again.");
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
        // orderby=modified sorts by local time, so the store is asked in GMT whether anything is newer than L.
        // No Z or offset on modified_after: WP_Date_Query::build_mysql_datetime parses it in the site time zone and
        // formats it back in that zone, so an offset would move the bound to local time before the post_modified_gmt comparison.
        const newer: Record<string, string> = modified ? { modified_after: modified, dates_are_gmt: 'true' } : {};
        const mark = new URLSearchParams({ per_page: '1', orderby: 'modified', order: 'desc', ...newer });
        const markResponse = await fetch(
          `${context.baseUrl}/products?${mark}`,
          { headers: { ...context.headers, 'Content-Type': 'application/json' }, signal: context.signal },
        );
        await checkResponse(markResponse);
        const [newest] = await markResponse.json();
        // Nothing modified after L (or no product at all): every window is empty.
        if (newest === undefined) return { documents: [], checkpoint: lastCheckpoint ?? { modified: '', offset: 0 } };
        if (modified && !(newest.date_modified_gmt > modified)) throw new WooDateFilterError(newest.id, modified, newest.date_modified_gmt);
        // The local sort may put an older GMT time first: as the next lower bound that costs a re-read, never a skip.
        passMark = newest.date_modified_gmt ?? modified;
      }
      const params = new URLSearchParams({
        per_page: String(batchSize),
        offset: String(offset),
        orderby: 'id',
        order: 'asc',
      });

      if (modified) {
        // GMT digits with no offset, for WP_Date_Query (see the mark request).
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

      await checkResponse(response);

      const products: any[] = await response.json();
      const total = response.headers.get('X-WP-Total');
      const count = total !== null && /^\d+$/.test(total) ? Number(total) : undefined;
      if (offset > 0 && count !== undefined && (products.length === 0 || count < (lastCheckpoint?.pass_count ?? count))) {
        // Restart the pass in this call, so RxDB stores its first page's checkpoint; the request budget bounds the call.
        return pull({ modified, offset: 0, pass_mark: passMark }, batchSize, context, requests);
      }
      const documents = products.map((product) => {
        const document = toProductDocument(product);
        // The window is modified_after = L − 1 s, so a product missing its time or below L was not filtered.
        if (modified && !(product.date_modified_gmt >= modified)) {
          throw new WooDateFilterError(product.id, params.get('modified_after')!, product.date_modified_gmt);
        }
        return document;
      });

      const variableProducts = documents.filter((doc) => doc.type === 'variable' && !doc._deleted);
      const variationIds = variableProducts.flatMap((doc) => doc.variations ?? []);
      const variations = new Map<number, ReturnType<typeof toVariationDocument>[]>();
      // Hydration requests complete the page already fetched, outside MAX_REQUESTS_PER_CALL.
      for (let i = 0; i < variationIds.length; i += 100) {
        const chunk = variationIds.slice(i, i + 100);
        const variationParams = new URLSearchParams({ include: chunk.join(','), per_page: String(chunk.length), orderby: 'id', order: 'asc' });
        const response = await fetch(`${context.baseUrl}/variations?${variationParams}`, {
          headers: { ...context.headers, 'Content-Type': 'application/json' }, signal: context.signal,
        });
        await checkResponse(response);
        const body = await response.json();
        for (const doc of body.documents) {
          const parentId = doc.parent_id ?? doc.payload.parent_id;
          const group = variations.get(parentId) ?? [];
          group.push(toVariationDocument(doc.payload));
          variations.set(parentId, group);
        }
      }
      for (const doc of variableProducts) {
        doc.variation_docs = (variations.get(doc.id) ?? []).sort((a, b) => a.id - b.id);
      }

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
