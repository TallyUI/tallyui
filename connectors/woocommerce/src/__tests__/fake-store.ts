// A fake WCPOS store (wcpos/v2/products) and a till replicating from it, shared by the pull and reconcile tests.
//
// THE FAKE IS A MODEL. It encodes what WordPress and WooCommerce are documented and read to do; re-verify it
// against a real WooCommerce once a dev store exists on this machine (#248 design note, A4):
// - modified_after with dates_are_gmt compares post_modified_gmt strictly (>);
// - orderby=modified sorts by the site's local time (post_modified);
// - WP_Date_Query reads a bound without an offset as site-local digits: inside the local spring-forward gap
//   PHP moves it one hour later; a bound with Z or an offset is converted to site-local digits first;
// - X-WP-Total can be switched off (a proxy that strips it);
// - status: `any` (the default) lists everything but trash; include= and _fields are honoured;
// - wcpos/v2/status answers healthy, missing_tables, schema_version and, when set, capabilities (#2113);
// - a direct stock write (update_product_stock) changes stock_quantity without touching date_modified_gmt.
//
// Modelled (from the plugin code): POS visibility (woocommerce-pos: Pos_Visibility.php:181-189 on main, reached
// through Collection_Rules_Plan.php:550). With pos_only_products on, online_only ids are appended to post__not_in
// for the listing and subtracted from post__in for include= reads, and an all-hidden include= is pinned to [0]:
// empty, never unfiltered. With the switch off nothing is hidden.
//
// Modelled (woocommerce-pos #2116, #2119, #2121): the products fast path. per_page=-1 with `_fields` exactly
// id,date_modified_gmt,stock_quantity,stock_status (any order), and otherwise only include, exclude,
// modified_after and dates_are_gmt, lists every published, POS-visible product with X-WP-Total; any other
// per_page=-1 request falls through to the hydrated listing, which answers 400.
//
// Not modelled (check these against a real store):
// 1. Pro store scopes: only the default visibility scope applies on v2 reads.
// 2. Third-party filters on woocommerce_rest_product_object_query.
// 3. The fast path's post_date DESC, ID ASC order: approximated by date_modified desc, then id.
// 4. status=any excludes only trash here; WordPress also drops auto-draft and statuses the token cannot read.
// 5. per_page is not capped at 100 (WordPress answers 400), and X-WP-TotalPages is not sent.
// 6. Requests without orderby (include= re-reads) come back in id order, not WordPress's default date order.
// 7. The spring-forward gap is found at whole-hour offsets only; half-hour zones are not modelled.
// 8. A fall-back (repeated) hour's local time is only what a test sets in date_modified.
// 9. Variations, latency, rate limits and server errors are absent unless a test sets `respond`.
import { vi, expect } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { ReplicationAdapter, SyncContext, TallyConnector } from '@tallyui/core';
import { connectorCollection } from '@tallyui/database';
import { createWooCommerceConnector } from '../index';
import { wooProductSchema } from '../schemas/products';

addRxPlugin(RxDBDevModePlugin);
export const context: SyncContext = { connectorId: 'woocommerce', baseUrl: 'https://woo.test/wp-json/wcpos/v2', headers: {} };

/** Hours ahead of GMT, or an IANA zone such as America/New_York. */
export type Zone = number | string;
const HOUR = 3_600_000;
/** The fast path's `_fields`, sorted, and every parameter it accepts (see the header). */
const FAST_PATH_FIELDS = 'date_modified_gmt,id,stock_quantity,stock_status';
const FAST_PATH_PARAMS = new Set(['per_page', '_fields', 'include', 'exclude', 'modified_after', 'dates_are_gmt']);
const digits = (ms: number) => new Date(ms).toISOString().slice(0, 19);
/** Product n's modified time: n seconds after 2026-01-01T08:00:00 GMT. */
export const stamp = (n: number) => digits(Date.UTC(2026, 0, 1, 8, 0, n));

/** The site-local digits of a GMT time. */
export function localDigits(gmt: string, zone: Zone): string {
  const ms = Date.parse(`${gmt}Z`);
  if (typeof zone === 'number') return digits(ms + zone * HOUR);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}
/** No instant has these local digits: they fall in the zone's spring-forward gap. */
const inGap = (local: string, zone: Zone) => typeof zone === 'string'
  && !Array.from({ length: 29 }, (_, i) => i - 14).some((h) => localDigits(digits(Date.parse(`${local}Z`) - h * HOUR), zone) === local);
/** A GMT time with the store's local time for it. */
export const at = (gmt: string, zone: Zone = 0) => ({ date_modified_gmt: gmt, date_modified: localDigits(gmt, zone) });

export interface FakeRow {
  id: number; uuid?: string; name: string; status: string; date_modified_gmt: string; date_modified: string;
  stock_quantity: number | null; stock_status: string;
}
export interface FakeStoreOptions {
  total?: boolean; filter?: boolean; zone?: Zone; stamp?: (n: number) => string;
  /** Requests to this host reach this store; any other host reaches the store created last. */
  host?: string;
}

// The live fake stores by host, so that two stores can answer at once (#307).
const stores = new Map<string, { answer(url: URL, headers?: Record<string, string>): Response }>();

export function createFakeStore(size: number, { total = true, filter = true, zone = 0, stamp: time = stamp, host = 'woo.test' }: FakeStoreOptions = {}) {
  const store = {
    rows: Array.from({ length: size }, (_, i): FakeRow => ({
      id: i + 1, uuid: `u${i + 1}`, name: `Product ${i + 1}`, status: 'publish', stock_quantity: 10, stock_status: 'instock', ...at(time(i + 1), zone),
    })),
    requests: [] as URL[],
    /** The headers of each request, in the order of `requests`. */
    headers: [] as Array<Record<string, string>>,
    /** Send X-WP-Total. */
    total,
    /** Rows a modified_after answer wrongly leaves out (#247's over-exclusion). */
    overExclude: (_row: FakeRow) => false,
    /** Rows a `_fields` listing page (not an include= re-read) leaves out: a truncated listing. */
    listingDrops: (_row: FakeRow) => false,
    /** Answers instead of the store, when it returns a response. */
    respond: (_url: URL): Response | undefined => undefined,
    /** wcpos/v2/status `capabilities`; undefined leaves the field out, as today's plugin does (#2113 adds it). */
    capabilities: undefined as string[] | undefined,
    /** WCPOS's pos_only_products setting: when on, `onlineOnly` products are hidden from every v2 read. */
    posOnlyProducts: false,
    /** Ids marked online_only (Pos_Visibility::CATALOG). */
    onlineOnly: new Set<number>(),
    row: (id: number) => store.rows.find((r) => r.id === id)!,
    /** An edit through WooCommerce: the modified time moves. */
    edit: (id: number, changes: Partial<FakeRow>, gmt: string) => Object.assign(store.row(id), changes, at(gmt, zone)),
    /** `update_product_stock()`: a direct query that leaves date_modified_gmt alone (#248 A1). */
    writeStock: (id: number, stock_quantity: number, stock_status = 'instock') => Object.assign(store.row(id), { stock_quantity, stock_status }),
    answer(url: URL, headers: Record<string, string> = {}): Response {
      store.requests.push(url);
      store.headers.push(headers);
      const override = store.respond(url);
      if (override) return override;
      if (url.pathname.endsWith('/status')) {
        return Response.json({ healthy: true, missing_tables: [], schema_version: 1, ...(store.capabilities && { capabilities: store.capabilities }) });
      }
      const params = url.searchParams;
      // per_page=-1 is the fast path only with exactly its fields and parameters (see the header).
      const fast = params.get('per_page') === '-1';
      if (fast && ([...params.keys()].some((key) => !FAST_PATH_PARAMS.has(key)) || params.get('_fields')?.split(',').sort().join() !== FAST_PATH_FIELDS)) {
        return Response.json({ code: 'rest_invalid_param' }, { status: 400 });
      }
      const status = fast ? 'publish' : params.get('status') ?? 'any';
      const include = params.get('include')?.split(',').map(Number);
      const exclude = params.get('exclude')?.split(',').map(Number) ?? [];
      // Pos_Visibility (see the header): hidden ids leave post__in, an all-hidden post__in is pinned to [0], and a
      // listing gets them in post__not_in.
      const hidden = store.posOnlyProducts ? store.onlineOnly : new Set<number>();
      const visible = include?.filter((id) => !hidden.has(id));
      const postIn = visible && (visible.length ? visible : [0]);
      const postNotIn = include ? [] : [...hidden];
      const sent = filter && params.get('dates_are_gmt') === 'true' ? params.get('modified_after') ?? '' : '';
      const after = !sent ? '' : /(Z|[+-]\d{2}:\d{2})$/.test(sent) ? localDigits(digits(Date.parse(sent)), zone)
        : inGap(sent, zone) ? digits(Date.parse(`${sent}Z`) + HOUR) : sent;
      const fields = params.get('_fields')?.split(',');
      const byId = params.get('orderby') !== 'modified';
      const window = store.rows
        .filter((r) => (status === 'any' ? r.status !== 'trash' : r.status === status))
        .filter((r) => (!postIn || postIn.includes(r.id)) && !postNotIn.includes(r.id) && !exclude.includes(r.id))
        .filter((r) => !sent || (r.date_modified_gmt > after && !store.overExclude(r)))
        .filter((r) => !fields || Boolean(include) || !store.listingDrops(r))
        .sort((a, b) => (fast ? b.date_modified.localeCompare(a.date_modified) || a.id - b.id
          : byId ? a.id - b.id : b.date_modified.localeCompare(a.date_modified)));
      const perPage = fast ? Infinity : Number(params.get('per_page') ?? 10);
      const offset = fast ? 0 : params.has('offset') ? Number(params.get('offset')) : (Number(params.get('page') ?? 1) - 1) * perPage;
      // The local time only orders the fake; the product schema has no date_modified field.
      const body = window.slice(offset, offset + perPage).map(({ date_modified: _, ...row }) =>
        (fields ? Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f as keyof typeof row]])) : row));
      return new Response(JSON.stringify(body), { headers: store.total ? { 'X-WP-Total': String(window.length) } : {} });
    },
  };
  stores.set(host, store);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    return (stores.get(url.host) ?? store).answer(url, init?.headers as Record<string, string>);
  });
  return store;
}
export type FakeStore = ReturnType<typeof createFakeStore>;

const cleanup: Array<() => Promise<unknown>> = [];
/** Call from afterEach: cancels every replication and closes every database, newest first. */
export async function closeTills() {
  for (const close of cleanup.splice(0).reverse()) await close();
  stores.clear();
  vi.restoreAllMocks();
}

/**
 * A till: an in-memory products collection (local documents on, for the reconcile gate) replicated from the
 * store through the connector's own adapter, the combined pull and reconcile feed, unless `adapter` says otherwise.
 */
export async function startTill(store: FakeStore, {
  batchSize = 2, afterCall = (_call: number, _rows: FakeRow[]) => {}, adapter, db, syncContext = context, connector = createWooCommerceConnector(),
}: {
  batchSize?: number; afterCall?: (call: number, rows: FakeRow[]) => void; adapter?: ReplicationAdapter<any, any>; db?: RxDatabase;
  syncContext?: SyncContext;
  /** The connector instance whose combined pull the till replicates through, and whose reconcile a test drives (default: a new one). */
  connector?: TallyConnector;
} = {}) {
  let database = db;
  if (!database) {
    const created = await createRxDatabase({
      name: `woo${Math.random().toString(36).slice(2)}`, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false,
    });
    cleanup.push(() => created.close());
    await created.addCollections({ products: connectorCollection(wooProductSchema) });
    database = created;
  }
  const pull = adapter ?? connector.replication!.products!;
  let calls = 0;
  const state = replicateRxCollection<any, any>({
    collection: database.products, replicationIdentifier: 'woo-products', live: true, waitForLeadership: false,
    pull: {
      batchSize,
      handler: async (checkpoint, size) => {
        const result = await pull.pull.handler(checkpoint, size, syncContext);
        afterCall(++calls, store.rows);
        return result;
      },
    },
  });
  cleanup.push(() => state.cancel());
  const errors: unknown[] = [];
  state.error$.subscribe((error) => errors.push(error));
  const sync = async () => {
    await state.awaitInSync();
    expect(errors).toEqual([]);
  };
  const poll = async () => {
    state.reSync();
    await sync();
  };
  const local = async () => new Map((await database.products.find().exec()).map((p: any) => [p.uuid, p.toJSON()]));
  // Requests one poll costs, from the stored checkpoint through the end of the run.
  const pollCost = async () => {
    const before = store.requests.length;
    await poll();
    return store.requests.length - before;
  };
  return { db: database, collection: database.products, connector, state, errors, sync, poll, local, pollCost };
}
