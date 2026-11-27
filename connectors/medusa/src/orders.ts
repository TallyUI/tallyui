import {
  assertOrderFiltersSupported, ConnectorUnauthorizedError, CustomerServiceError,
  type OrderFilterField, type ServerCapabilities, type StoreOrder, type StoreOrderLine, type StoreOrderPage, type StoreOrderRefundLine, type SyncContext,
  type TallyConnector,
} from '@tallyui/core';
import { medusaMinor, medusaNetMinor, medusaSumMinor } from './money';

type Row = Record<string, unknown>;

const MAX_PER_PAGE = 100;

/**
 * The admin order fields the mapper reads. `credit_line_total` is there because Medusa lowers `total` by each refund's
 * credit line; the mapper adds it back so the order reads as sold, with the refunds beside it.
 */
export const ORDER_FIELDS = 'id,display_id,status,created_at,currency_code,email,customer_id,metadata,total,subtotal,tax_total,'
  + 'discount_total,discount_tax_total,credit_line_total,*customer,*items,*items.tax_lines,*shipping_methods,*shipping_methods.tax_lines,'
  + '*payment_collections,*payment_collections.payments,*payment_collections.payments.refunds';

const unexpected = () => new CustomerServiceError('server', 'unexpected response');
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);
const nonEmpty = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);
const required = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) throw unexpected();
  return value;
};

/** Maps a Medusa v2 admin order (selected with ORDER_FIELDS) to a `StoreOrder` (ADR-081). Reads plain numbers only, never `raw_*` or `summary`. */
export function toMedusaStoreOrder(raw: unknown): StoreOrder {
  if (!isRow(raw) || typeof raw.created_at !== 'string' || typeof raw.status !== 'string') throw unexpected();
  const placed = new Date(raw.created_at);
  if (Number.isNaN(placed.getTime())) throw unexpected();
  const currency = required(raw.currency_code).toUpperCase();
  const minor = (amount: unknown) => medusaMinor(amount, currency);
  /** A gross amount and its tax as net + tax, the gross rounded once. */
  const split = (gross: unknown, tax: unknown) => {
    const totalMinor = medusaNetMinor(gross, tax, currency);
    return { totalMinor, taxMinor: minor(gross) - totalMinor };
  };

  const metadata = isRow(raw.metadata) ? raw.metadata : {};
  const clientOrderId = nonEmpty(metadata.tally_client_id);
  const items = rows(raw.items);
  const shippingMethods = rows(raw.shipping_methods);

  const person = isRow(raw.customer) ? raw.customer : {};
  const customerId = nonEmpty(person.id) ?? nonEmpty(raw.customer_id);
  const name = [person.first_name, person.last_name].filter((part) => typeof part === 'string').join(' ').trim();
  const email = nonEmpty(person.email) ?? nonEmpty(raw.email);

  const taxGroups = new Map<string, { label: string; code?: string; rate: number; totals: unknown[] }>();
  for (const taxLine of [...items, ...shippingMethods].flatMap((owner) => rows(owner.tax_lines))) {
    const { rate } = taxLine;
    if (typeof rate !== 'number' || !Number.isFinite(rate)) throw unexpected();
    const code = nonEmpty(taxLine.code);
    const key = JSON.stringify([code ?? null, rate]);
    const group = taxGroups.get(key) ?? { label: nonEmpty(taxLine.description) ?? code ?? `${rate}%`, code, rate, totals: [] };
    group.totals.push(taxLine.total);
    taxGroups.set(key, group);
  }

  // Medusa lowers `total` by each refund's credit line; the sale as sold is total + credit_line_total.
  const gross = [raw.total, raw.credit_line_total ?? 0];
  const totalMinor = medusaSumMinor(currency, gross);
  const discount = split(raw.discount_total, raw.discount_tax_total);
  // Every payment across every collection; a collection's own `amount` is what was asked, not what was paid.
  const payments = rows(raw.payment_collections).flatMap((collection) => rows(collection.payments));

  return {
    id: required(raw.id),
    reference: String(raw.display_id ?? raw.id),
    ...(clientOrderId ? { clientOrderId } : {}),
    status: raw.status,
    placedAt: placed.toISOString(),
    currency,
    pricesIncludeTax: items.length > 0 && items.every((item) => item.is_tax_inclusive === true),
    customer: customerId || name || email
      ? { ...(customerId ? { id: customerId } : {}), ...(name ? { name } : {}), ...(email ? { email } : {}) }
      : null,
    lines: items.map((item): StoreOrderLine => {
      const lineMetadata = isRow(item.metadata) ? item.metadata : {};
      const clientLineId = nonEmpty(lineMetadata.tally_line_uuid);
      const productId = nonEmpty(item.product_id);
      const variantId = nonEmpty(item.variant_id);
      const sku = nonEmpty(item.variant_sku);
      const { quantity } = item;
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) throw unexpected();
      // Before discount from original_total / original_tax_total; after it from total / tax_total (both gross).
      const before = split(item.original_total, item.original_tax_total);
      return {
        id: required(item.id), ...(clientLineId ? { clientLineId } : {}), ...(productId ? { productId } : {}), ...(variantId ? { variantId } : {}),
        name: nonEmpty(item.title) ?? nonEmpty(item.product_title) ?? '', ...(sku ? { sku } : {}), quantity,
        subtotalMinor: before.totalMinor, subtotalTaxMinor: before.taxMinor, ...split(item.total, item.tax_total),
      };
    }),
    fees: [],
    shipping: shippingMethods.map((method) => {
      const id = nonEmpty(method.id);
      const methodId = nonEmpty(method.shipping_option_id);
      return { ...(id ? { id } : {}), name: nonEmpty(method.name) ?? '', ...split(method.total, method.tax_total), ...(methodId ? { methodId } : {}) };
    }),
    coupons: [],
    // Each rate's tax lines summed exactly, then rounded once.
    taxLines: [...taxGroups.values()].map(({ label, code, rate, totals }) => ({
      label, ...(code ? { code } : {}), ratePpm: Math.round(rate * 10000), amountMinor: medusaSumMinor(currency, totals),
    })),
    discountMinor: discount.totalMinor,
    discountTaxMinor: discount.taxMinor,
    taxMinor: totalMinor - medusaSumMinor(currency, gross, [raw.tax_total]),
    totalMinor,
    payments: payments.filter((payment) => payment.canceled_at == null).map((payment) => {
      const id = nonEmpty(payment.id);
      return { ...(id ? { id } : {}), method: required(payment.provider_id), amountMinor: minor(payment.amount) };
    }),
    refunds: payments.flatMap((payment) => rows(payment.refunds)).map((refund) => {
      const reason = nonEmpty(refund.note);
      return { id: required(refund.id), amountMinor: Math.abs(minor(refund.amount)), ...(reason ? { reason } : {}) };
    }),
  };
}

/** The ListOrdersQuery filters Medusa's admin order list honours; it has no cashier, register, payment-method, store or created-via filter. */
export const MEDUSA_ORDER_FILTERS: readonly OrderFilterField[] = ['status', 'customerId', 'dateRange'];

/** An all-digits search this long or shorter is a display number (front desk, 2026-11-20); longer goes to `q`, so phone searches keep working. */
export const MEDUSA_DISPLAY_NUMBER_MAX_DIGITS = 6;
/** The MedusaPOS plugin contract that adds GET /tally/v1/orders (medusapos versions.ts:18-19). */
export const MEDUSA_ORDERS_PLUGIN_CONTRACT = 3;
/** The MedusaPOS plugin contract at which GET /tally/v1/orders takes allChannels=true (medusapos/app#516); a contract-3 plugin answers the key with a 400. */
export const MEDUSA_ALL_CHANNELS_PLUGIN_CONTRACT = 4;
/** The MedusaPOS plugin contract whose GET /tally/v1/orders takes `ids=` and returns `refunds[].lines` (#1324). */
const REFUND_LINES_PLUGIN_CONTRACT = 6;
/** The MedusaPOS plugin contract whose GET /tally/v1/orders lines carry soldTotalMinor, soldTaxMinor and returnedQuantity (medusapos/app#636). */
const SOLD_FIGURES_PLUGIN_CONTRACT = 7;
/** The plugin's cap on `ids=` per request, its ORDERS_MAX_PER_PAGE (#1324). */
const REFUND_LINES_IDS_MAX = 100;

// The plugin sends its contract as /tally/v1/info's top-level `pluginContract`; a contract-2 plugin has no orders route.
const hasOrdersRoute = (capabilities?: ServerCapabilities) => (capabilities?.pluginContract ?? 0) >= MEDUSA_ORDERS_PLUGIN_CONTRACT;

/** The filter fields `listOrders` honours for a store with these capabilities: `registerId` needs the plugin's orders route. */
export function medusaOrderFilters(capabilities?: ServerCapabilities): readonly OrderFilterField[] {
  return hasOrdersRoute(capabilities) ? [...MEDUSA_ORDER_FILTERS, 'registerId'] : MEDUSA_ORDER_FILTERS;
}

/** GET on the admin API: network → `network`, 401/403 → ConnectorUnauthorizedError, 400 → `invalid`, other failures → `server`. */
async function ordersRequest(context: SyncContext, path: string, params: URLSearchParams, missing?: 'null'): Promise<Row | null> {
  let res: Response;
  try {
    res = await fetch(`${context.baseUrl}${path}?${params}`, { method: 'GET', headers: context.headers, signal: context.signal });
  } catch (error) {
    throw new CustomerServiceError('network', error instanceof Error ? error.message : String(error));
  }
  if (res.status === 401 || res.status === 403) throw new ConnectorUnauthorizedError(`Medusa rejected the credentials (HTTP ${res.status})`, res.status as 401 | 403);
  if (res.status === 404 && missing === 'null') return null;
  if (!res.ok) throw new CustomerServiceError(res.status === 400 ? 'invalid' : 'server', `HTTP ${res.status}`, { status: res.status });
  const body: unknown = await res.json().catch(() => undefined);
  if (!isRow(body)) throw new CustomerServiceError('server', 'unexpected response', { status: res.status });
  return body;
}

const wholeNumber = (value: number | undefined, fallback: number) => (value === undefined || !Number.isFinite(value) ? fallback : Math.trunc(value));

/** Maps the rows, leaving out and counting each one the mapper cannot read. */
function readOrders(raws: readonly unknown[]): { orders: StoreOrder[]; unreadable: number } {
  let unreadable = 0;
  const orders = raws.flatMap((raw) => {
    try {
      return [toMedusaStoreOrder(raw)];
    } catch (error) {
      if (!(error instanceof CustomerServiceError)) throw error;
      unreadable += 1;
      return [];
    }
  });
  return { orders, unreadable };
}

const isCount = (value: unknown, min: number): value is number => Number.isSafeInteger(value) && (value as number) >= min;

/** Each order's refund lines (order id, then refund id) from the plugin's `orders[]` rows, kept only when every line is valid for that order (#1324).
 * An empty array is kept as a refund with no lines (shipping or adjustment only, medusapos#648); missing or non-array `lines` stays unknown.
 * An order whose refund ids repeat or whose refunds together name more of a line than was ordered gets none; never throws. */
function refundLinesByOrder(raws: readonly unknown[], orders: readonly StoreOrder[]): Map<string, Map<string, StoreOrderRefundLine[]>> {
  const lineIds = new Map(orders.map((order) => [order.id, new Map(order.lines.map((line) => [line.id, line.quantity]))]));
  const byOrder = new Map<string, Map<string, StoreOrderRefundLine[]>>();
  const seenByOrder = new Map<string, Set<string>>();
  const ordersWithRepeat = new Set<string>();
  for (const raw of rows(raws)) {
    const known = typeof raw.id === 'string' ? lineIds.get(raw.id) : undefined;
    if (!known || typeof raw.id !== 'string') continue;
    const linesById = byOrder.get(raw.id) ?? new Map<string, StoreOrderRefundLine[]>();
    byOrder.set(raw.id, linesById);
    const seen = seenByOrder.get(raw.id) ?? new Set<string>();
    seenByOrder.set(raw.id, seen);
    for (const { id, lines } of rows(raw.refunds)) {
      if (typeof id !== 'string') continue;
      if (seen.has(id)) ordersWithRepeat.add(raw.id);
      seen.add(id);
      if (!Array.isArray(lines)) continue;
      // An order's line ids are never empty, so `known.has` also refuses an empty orderLineId; a quantity above the ordered one is malformed.
      const kept = rows(lines).flatMap(({ orderLineId, quantity, netMinor, taxMinor }) => (
        typeof orderLineId === 'string' && known.has(orderLineId) && isCount(quantity, 1) && quantity <= known.get(orderLineId)! && isCount(netMinor, 0) && isCount(taxMinor, 0)
          ? [{ orderLineId, quantity, netMinor, taxMinor }] : []));
      // A refund names each order line once.
      if (kept.length === lines.length && new Set(kept.map((line) => line.orderLineId)).size === kept.length) linesById.set(id, kept);
    }
  }
  // The till treats refunds' lines as cumulative, so an order whose refunds over-count a line gets none.
  for (const [orderId, linesById] of byOrder) {
    const ordered = lineIds.get(orderId)!;
    const refunded = new Map<string, number>();
    for (const line of [...linesById.values()].flat()) refunded.set(line.orderLineId, (refunded.get(line.orderLineId) ?? 0) + line.quantity);
    if (ordersWithRepeat.has(orderId) || [...refunded].some(([lineId, quantity]) => quantity > ordered.get(lineId)!)) byOrder.delete(orderId);
  }
  return byOrder;
}

/** The orders with `lines` on each of their own refunds the map names; every other refund and order is returned as is. */
function withRefundLines(orders: StoreOrder[], byOrder: Map<string, Map<string, StoreOrderRefundLine[]>>): StoreOrder[] {
  return orders.map((order) => {
    const linesById = byOrder.get(order.id);
    return linesById && order.refunds.some((refund) => linesById.has(refund.id))
      ? { ...order, refunds: order.refunds.map((refund) => { const lines = linesById.get(refund.id); return lines ? { ...refund, lines } : refund; }) }
      : order;
  });
}

function soldFiguresByOrder(raws: readonly unknown[], orders: readonly StoreOrder[]) {
  const quantities = new Map(orders.map((order) => [order.id, new Map(order.lines.map((line) => [line.id, line.quantity]))]));
  type SoldFigures = Required<Pick<StoreOrderLine, 'soldTotalMinor' | 'soldTaxMinor' | 'returnedQuantity'>>;
  const byOrder = new Map<string, Map<string, SoldFigures>>();
  for (const raw of rows(raws)) {
    if (typeof raw.id !== 'string') continue;
    const known = quantities.get(raw.id);
    if (!known) continue;
    for (const { id, soldTotalMinor, soldTaxMinor, returnedQuantity } of rows(raw.lines)) {
      if (typeof id !== 'string') continue;
      const quantity = known.get(id);
      if (quantity === undefined || !isCount(soldTotalMinor, 0) || !isCount(soldTaxMinor, 0) || !isCount(returnedQuantity, 0) || returnedQuantity > quantity) continue;
      const figures = byOrder.get(raw.id) ?? new Map<string, SoldFigures>();
      figures.set(id, { soldTotalMinor, soldTaxMinor, returnedQuantity });
      byOrder.set(raw.id, figures);
    }
  }
  return byOrder;
}

function withSoldFigures(orders: StoreOrder[], byOrder: ReturnType<typeof soldFiguresByOrder>): StoreOrder[] {
  return orders.map((order) => {
    const figures = byOrder.get(order.id);
    if (!figures) return order;
    return { ...order, lines: order.lines.map((line) => figures.has(line.id) ? { ...line, ...figures.get(line.id) } : line) };
  });
}

/** Reads refund lines for orders with refunds at contract 6, and also sold figures for every order from contract 7.
 * Reads one chunk of REFUND_LINES_IDS_MAX at a time; a failed chunk adds neither, unless the read was cancelled. */
async function readRefundLines(context: SyncContext, orders: StoreOrder[]): Promise<StoreOrder[]> {
  const contract = context.capabilities?.pluginContract ?? 0;
  if (contract < REFUND_LINES_PLUGIN_CONTRACT) return orders;
  const ids = orders.filter((order) => contract >= SOLD_FIGURES_PLUGIN_CONTRACT || order.refunds.length > 0).map((order) => order.id);
  const raws: unknown[] = [];
  for (let start = 0; start < ids.length; start += REFUND_LINES_IDS_MAX) {
    const chunk = ids.slice(start, start + REFUND_LINES_IDS_MAX);
    // Contract 6 is past MEDUSA_ALL_CHANNELS_PLUGIN_CONTRACT; without allChannels the route reads only the till's sales channel.
    const params = new URLSearchParams({ page: '1', perPage: String(chunk.length), ids: chunk.join(','), allChannels: 'true' });
    try {
      const body = await ordersRequest(context, '/tally/v1/orders', params);
      if (Array.isArray(body?.orders)) raws.push(...(body.orders as unknown[]));
    } catch (error) {
      if (context.signal?.aborted) throw error;
    }
  }
  if (!raws.length) return orders;
  const refunded = withRefundLines(orders, refundLinesByOrder(raws, orders));
  return contract >= SOLD_FIGURES_PLUGIN_CONTRACT ? withSoldFigures(refunded, soldFiguresByOrder(raws, orders)) : refunded;
}

// An all-digits search the plugin's route matches against display_id (medusapos orders/list.ts:78-84); the admin API has no number search.
const DISPLAY_NUMBER = new RegExp(`^\\d{1,${MEDUSA_DISPLAY_NUMBER_MAX_DIGITS}}$`);

/**
 * The plugin's `GET /tally/v1/orders` picks the page's ids; the admin API reads those rows, so every order maps the same way.
 * The hits also supply refund lines from contract 6 and sold figures from contract 7 without another request.
 * The route takes only page, perPage, search, status, customerId, registerId, after and before (plus allChannels from contract 4); any other key is a 400 (list.ts:18, 30-34).
 */
async function listThroughPlugin(context: SyncContext, params: URLSearchParams): Promise<StoreOrderPage> {
  const found = (await ordersRequest(context, '/tally/v1/orders', params))!;
  const { orders: hits, hasMore, total } = found;
  if (!Array.isArray(hits) || typeof hasMore !== 'boolean') throw unexpected();
  // Each row's id is the Medusa order id, newest first (list.ts:202-204, 244-247; orders/route.ts:19-22).
  const ids = hits.map((hit: unknown) => required(isRow(hit) ? hit.id : undefined));
  const counted = typeof total === 'number' && Number.isInteger(total) && total >= 0 ? { total } : {};
  if (ids.length === 0) return { orders: [], hasMore, ...counted };
  const lookup = new URLSearchParams({ limit: String(ids.length), fields: ORDER_FIELDS });
  for (const id of ids) lookup.append('id[]', id);
  const body = (await ordersRequest(context, '/admin/orders', lookup))!;
  if (!Array.isArray(body.orders)) throw unexpected();
  // `id[]` answers in the server's own order, not the order asked (dev store, 2026-11-20), so the rows go back in the plugin's order.
  const byId = new Map(rows(body.orders).map((row) => [row.id, row]));
  const picked = ids.flatMap((id) => byId.get(id) ?? []);
  const { orders: read, unreadable } = readOrders(picked);
  const contract = context.capabilities?.pluginContract ?? 0;
  const refunded = contract >= REFUND_LINES_PLUGIN_CONTRACT ? withRefundLines(read, refundLinesByOrder(hits, read)) : read;
  const orders = contract >= SOLD_FIGURES_PLUGIN_CONTRACT ? withSoldFigures(refunded, soldFiguresByOrder(hits, read)) : refunded;
  // An id the admin answer lacks is left out and counted like a row the mapper cannot read.
  const left = unreadable + ids.length - picked.length;
  return { orders, hasMore, ...(left ? { unreadable: left } : {}), ...counted };
}

/** Medusa v2 admin orders (`GET /admin/orders`): order history, read-only (ADR-081). */
export function createMedusaOrders(): Required<Pick<TallyConnector, 'listOrders' | 'getOrders'>> {
  return {
    /**
     * Newest first. Filters on the server: status (verbatim; Medusa answers an unknown word with a 500, which rejects
     * as `server`), customerId (customer_id) and dateRange (created_at[$gte] / created_at[$lt]); search is Medusa's
     * `q`. Any other filter field is refused. An empty status matches no order, so it resolves an empty page without a request.
     * Register filters and 1-6 digit searches go through the plugin's orders route at contract 3, which reads every sales channel from contract 4 (`allChannels=true`) and only the till's channel at contract 3 (#1125).
     */
    async listOrders(context: SyncContext, query = {}) {
      assertOrderFiltersSupported(query, medusaOrderFilters(context.capabilities));
      if (query.status === '' || query.registerId === '') return { orders: [], hasMore: false };
      const page = Math.max(1, wholeNumber(query.page, 1));
      const perPage = Math.max(1, Math.min(MAX_PER_PAGE, wholeNumber(query.perPage, 25)));
      const search = query.search?.trim();
      const { after, before } = query.dateRange ?? {};
      // A registerId only gets past the filter check at contract 3, so it always has the route here.
      if (query.registerId !== undefined || (search && DISPLAY_NUMBER.test(search) && hasOrdersRoute(context.capabilities))) {
        // The route clamps perPage to 1..100, needs page >= 1 (list.ts:38-48) and wants an admin user (middlewares.ts:62-64).
        const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
        if (search) params.set('search', search);
        if (query.status !== undefined) params.set('status', query.status);
        if (query.customerId !== undefined) params.set('customerId', query.customerId);
        // The route matches registerId against metadata tally_register_id (list.ts:73).
        if (query.registerId !== undefined) params.set('registerId', query.registerId);
        // after / before are ISO instants ending in Z, applied as created_at $gte and $lt (list.ts:53-62, 74-77).
        if (after !== undefined) params.set('after', after);
        if (before !== undefined) params.set('before', before);
        if ((context.capabilities?.pluginContract ?? 0) >= MEDUSA_ALL_CHANNELS_PLUGIN_CONTRACT) params.set('allChannels', 'true'); // #1125: at contract 4 the route reads every sales channel, like the admin list.
        return listThroughPlugin(context, params);
      }
      const offset = (page - 1) * perPage;
      const params = new URLSearchParams({ limit: String(perPage), offset: String(offset), order: '-created_at', fields: ORDER_FIELDS });
      if (search) params.set('q', search);
      if (query.status !== undefined) params.set('status', query.status);
      if (query.customerId !== undefined) params.set('customer_id', query.customerId);
      if (after !== undefined) params.set('created_at[$gte]', after);
      if (before !== undefined) params.set('created_at[$lt]', before);
      const body = (await ordersRequest(context, '/admin/orders', params))!;
      if (!Array.isArray(body.orders)) throw unexpected();
      const { orders, unreadable } = readOrders(body.orders);
      const { count } = body;
      const counted = typeof count === 'number' && Number.isInteger(count) && count >= 0;
      const hasMore = counted ? offset + body.orders.length < count : body.orders.length === perPage;
      return { orders: await readRefundLines(context, orders), hasMore, ...(unreadable ? { unreadable } : {}), ...(counted ? { total: count } : {}) };
    },

    /** One request per id, in the order asked; an id the store does not have (404) is left out. */
    async getOrders(context: SyncContext, ids: readonly string[]) {
      const orders: StoreOrder[] = [];
      for (const id of new Set(ids.filter((id) => id.length > 0))) {
        const body = await ordersRequest(context, `/admin/orders/${encodeURIComponent(id)}`, new URLSearchParams({ fields: ORDER_FIELDS }), 'null');
        if (body) orders.push(toMedusaStoreOrder(body.order));
      }
      return readRefundLines(context, orders);
    },
  };
}
