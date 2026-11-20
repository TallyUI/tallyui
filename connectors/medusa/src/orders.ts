import {
  assertOrderFiltersSupported, ConnectorUnauthorizedError, CustomerServiceError,
  type OrderFilterField, type StoreOrder, type StoreOrderLine, type SyncContext, type TallyConnector,
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

/** Medusa v2 admin orders (`GET /admin/orders`): order history, read-only (ADR-081). */
export function createMedusaOrders(): Required<Pick<TallyConnector, 'listOrders' | 'getOrders'>> {
  return {
    /**
     * Newest first. Filters on the server: status (verbatim; Medusa answers an unknown word with a 500, which rejects
     * as `server`), customerId (customer_id) and dateRange (created_at[$gte] / created_at[$lt]); search is Medusa's
     * `q`. Any other filter field is refused. An empty status matches no order, so it resolves an empty page without a request.
     */
    async listOrders(context: SyncContext, query = {}) {
      assertOrderFiltersSupported(query, MEDUSA_ORDER_FILTERS);
      if (query.status === '') return { orders: [], hasMore: false };
      const page = Math.max(1, wholeNumber(query.page, 1));
      const perPage = Math.max(1, Math.min(MAX_PER_PAGE, wholeNumber(query.perPage, 25)));
      const offset = (page - 1) * perPage;
      const params = new URLSearchParams({ limit: String(perPage), offset: String(offset), order: '-created_at', fields: ORDER_FIELDS });
      const search = query.search?.trim();
      if (search) params.set('q', search);
      if (query.status !== undefined) params.set('status', query.status);
      if (query.customerId !== undefined) params.set('customer_id', query.customerId);
      const { after, before } = query.dateRange ?? {};
      if (after !== undefined) params.set('created_at[$gte]', after);
      if (before !== undefined) params.set('created_at[$lt]', before);
      const body = (await ordersRequest(context, '/admin/orders', params))!;
      if (!Array.isArray(body.orders)) throw unexpected();
      let unreadable = 0;
      const orders = body.orders.flatMap((raw: unknown) => {
        try {
          return [toMedusaStoreOrder(raw)];
        } catch (error) {
          if (!(error instanceof CustomerServiceError)) throw error;
          unreadable += 1;
          return [];
        }
      });
      const { count } = body;
      const counted = typeof count === 'number' && Number.isInteger(count) && count >= 0;
      const hasMore = counted ? offset + body.orders.length < count : body.orders.length === perPage;
      return { orders, hasMore, ...(unreadable ? { unreadable } : {}), ...(counted ? { total: count } : {}) };
    },

    /** One request per id, in the order asked; an id the store does not have (404) is left out. */
    async getOrders(context: SyncContext, ids: readonly string[]) {
      const orders: StoreOrder[] = [];
      for (const id of new Set(ids.filter((id) => id.length > 0))) {
        const body = await ordersRequest(context, `/admin/orders/${encodeURIComponent(id)}`, new URLSearchParams({ fields: ORDER_FIELDS }), 'null');
        if (body) orders.push(toMedusaStoreOrder(body.order));
      }
      return orders;
    },
  };
}
