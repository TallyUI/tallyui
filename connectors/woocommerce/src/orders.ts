import {
  assertOrderFiltersSupported, CustomerServiceError, minorUnitDigits,
  type OrderFilterField, type PaymentMethodKind, type StoreOrder, type StoreOrderLine, type SyncContext, type TallyConnector,
} from '@tallyui/core';
import { customerRequest } from './customers';
import { wooMinorFromDecimal } from './commands/transport';

type Row = Record<string, unknown>;

const MAX_PER_PAGE = 100;

const unexpected = () => new CustomerServiceError('server', 'unexpected response');
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);
const nonEmpty = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);
const positiveId = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? String(value) : undefined);

function minor(text: unknown, currency: string): number {
  if (typeof text !== 'string') throw unexpected();
  const trimmed = text.trim();
  const negative = /^-\d/.test(trimmed);
  const value = wooMinorFromDecimal(negative ? trimmed.slice(1) : trimmed, currency);
  if (value === undefined) throw unexpected();
  return negative && value !== 0 ? -value : value;
}

// Sum two WooCommerce decimal strings (WCPOS stores 6dp) exactly, then round half away from zero to minor units.
function decimalSumMinor(a: unknown, b: unknown, currency: string): number {
  const parts = [a, b].map((text) => /^(-?)(\d+)(?:\.(\d+))?$/.exec(typeof text === 'string' ? text.trim() : ''));
  const scale = Math.max(minorUnitDigits(currency), ...parts.map((part) => part?.[3]?.length ?? 0));
  let total = 0n;
  for (const part of parts) {
    if (!part) throw unexpected();
    total += BigInt(`${part[1]}${part[2]}${(part[3] ?? '').padEnd(scale, '0')}`);
  }
  const divisor = 10n ** BigInt(scale - minorUnitDigits(currency));
  const rounded = ((total < 0n ? -total : total) + divisor / 2n) / divisor;
  return Number(total < 0n ? -rounded : rounded);
}

/** The tax such that net + tax is the gross rounded once, exactly. */
const grossTax = (net: unknown, tax: unknown, currency: string) => decimalSumMinor(net, tax, currency) - minor(net, currency);

function posUuid(metaData: unknown): string | undefined {
  const entry = rows(metaData).find((meta) => meta.key === '_woocommerce_pos_uuid' && nonEmpty(meta.value));
  return entry ? (entry.value as string) : undefined;
}

const PAYMENT_KINDS: Record<string, PaymentMethodKind> = { pos_cash: 'cash', pos_card: 'external' };

/** Maps a WooCommerce order resource (as WCPOS `wcpos/v2/orders` serves it) to a `StoreOrder` (ADR-081). */
export function toWooStoreOrder(raw: unknown): StoreOrder {
  if (!isRow(raw) || raw.id === undefined || raw.id === null || typeof raw.currency !== 'string' || typeof raw.date_created_gmt !== 'string') {
    throw unexpected();
  }
  const currency = raw.currency;
  const dateText = raw.date_created_gmt;
  const placed = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(dateText) ? dateText : `${dateText}Z`);
  if (Number.isNaN(placed.getTime())) throw unexpected();

  const billing = isRow(raw.billing) ? raw.billing : {};
  const customerId = positiveId(raw.customer_id);
  const name = [billing.first_name, billing.last_name].filter((part) => typeof part === 'string').join(' ').trim();
  const email = nonEmpty(billing.email);
  const customer = customerId || name || email
    ? { ...(customerId ? { id: customerId } : {}), ...(name ? { name } : {}), ...(email ? { email } : {}) }
    : null;

  const clientOrderId = posUuid(raw.meta_data);
  const totalMinor = minor(raw.total, currency);
  const paymentMethod = nonEmpty(raw.payment_method);
  const paymentTitle = nonEmpty(raw.payment_method_title);
  const paymentKind = paymentMethod ? PAYMENT_KINDS[paymentMethod] : undefined;

  return {
    id: String(raw.id),
    reference: String(raw.number ?? raw.id),
    ...(clientOrderId ? { clientOrderId } : {}),
    status: String(raw.status),
    placedAt: placed.toISOString(),
    currency,
    pricesIncludeTax: raw.prices_include_tax === true,
    customer,
    lines: rows(raw.line_items).map((line): StoreOrderLine => {
      const clientLineId = posUuid(line.meta_data);
      const productId = positiveId(line.product_id);
      const variantId = positiveId(line.variation_id) ?? productId;
      const sku = nonEmpty(line.sku);
      return {
        id: String(line.id),
        ...(clientLineId ? { clientLineId } : {}),
        ...(productId ? { productId } : {}),
        ...(variantId ? { variantId } : {}),
        name: String(line.name),
        ...(sku ? { sku } : {}),
        quantity: Number(line.quantity),
        subtotalMinor: minor(line.subtotal, currency),
        subtotalTaxMinor: grossTax(line.subtotal, line.subtotal_tax, currency),
        totalMinor: minor(line.total, currency),
        taxMinor: grossTax(line.total, line.total_tax, currency),
      };
    }),
    fees: rows(raw.fee_lines).map((fee) => ({
      name: String(fee.name), totalMinor: minor(fee.total, currency), taxMinor: grossTax(fee.total, fee.total_tax, currency),
    })),
    shipping: rows(raw.shipping_lines).map((line) => ({
      name: String(line.method_title), totalMinor: minor(line.total, currency), taxMinor: grossTax(line.total, line.total_tax, currency),
    })),
    coupons: rows(raw.coupon_lines).map((coupon) => ({
      code: String(coupon.code),
      discountMinor: minor(coupon.discount, currency),
      discountTaxMinor: grossTax(coupon.discount, coupon.discount_tax, currency),
    })),
    taxLines: rows(raw.tax_lines).map((tax) => {
      const code = nonEmpty(tax.rate_code);
      return {
        label: String(tax.label),
        ...(code ? { code } : {}),
        ratePpm: typeof tax.rate_percent === 'number' && Number.isFinite(tax.rate_percent) ? Math.round(tax.rate_percent * 10000) : 0,
        amountMinor: minor(tax.tax_total, currency) + minor(tax.shipping_tax_total, currency),
      };
    }),
    discountMinor: minor(raw.discount_total, currency),
    discountTaxMinor: minor(raw.discount_tax, currency),
    taxMinor: minor(raw.total_tax, currency),
    totalMinor,
    payments: paymentMethod ? [{
      method: paymentMethod, ...(paymentTitle ? { title: paymentTitle } : {}), ...(paymentKind ? { kind: paymentKind } : {}), amountMinor: totalMinor,
    }] : [],
    refunds: rows(raw.refunds).map((refund) => {
      const reason = nonEmpty(refund.reason);
      return { id: String(refund.id), amountMinor: Math.abs(minor(refund.total, currency)), ...(reason ? { reason } : {}) };
    }),
  };
}

const wholeNumber = (value: number | undefined, fallback: number) => (value === undefined || !Number.isFinite(value) ? fallback : Math.trunc(value));

/** The ListOrdersQuery filters `wcpos/v2/orders` honours; it has no payment-method or register filter (it ignores both). */
export const WOO_ORDER_FILTERS: readonly OrderFilterField[] = ['status', 'customerId', 'cashierId', 'storeId', 'createdVia', 'dateRange'];

/** A validated UTC instant, rounded up to the whole second and shifted by `shiftSeconds`, as `YYYY-MM-DDTHH:MM:SS` in UTC. */
const wooGmtSecond = (instant: string, shiftSeconds: number) =>
  new Date((Math.ceil(Date.parse(instant) / 1000) + shiftSeconds) * 1000).toISOString().slice(0, 19);

/** WCPOS `wcpos/v2/orders`: order history, read-only (ADR-081). */
export function createWooOrders(): Required<Pick<TallyConnector, 'listOrders' | 'getOrders'>> {
  return {
    /**
     * Filters on the server: status, customerId (customer), cashierId (pos_cashier), storeId (pos_store), createdVia
     * (created_via) and dateRange; any other filter field is refused. An id that is not all digits, or an empty status
     * or createdVia, matches no order, so it resolves an empty page without a request. dateRange is sent in GMT (dates_are_gmt): WooCommerce compares
     * whole seconds strictly, so the inclusive `after` goes as its instant rounded up to the second minus one second,
     * and the exclusive `before` as its instant rounded up to the second.
     */
    async listOrders(context: SyncContext, query = {}) {
      assertOrderFiltersSupported(query, WOO_ORDER_FILTERS);
      if (query.status === '' || query.createdVia === '') return { orders: [], hasMore: false };
      const page = Math.max(1, wholeNumber(query.page, 1));
      const perPage = Math.max(1, Math.min(MAX_PER_PAGE, wholeNumber(query.perPage, 25)));
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage), orderby: 'date', order: 'desc' });
      const search = query.search?.trim();
      if (search) params.set('search', search);
      if (query.status !== undefined) params.set('status', query.status);
      const ids = [['customer', query.customerId], ['pos_cashier', query.cashierId], ['pos_store', query.storeId]] as const;
      for (const [param, id] of ids) {
        if (id === undefined) continue;
        if (!/^\d+$/.test(id)) return { orders: [], hasMore: false };
        params.set(param, id);
      }
      if (query.createdVia !== undefined) params.set('created_via', query.createdVia);
      const { after, before } = query.dateRange ?? {};
      if (after !== undefined || before !== undefined) params.set('dates_are_gmt', 'true');
      if (after !== undefined) params.set('after', wooGmtSecond(after, -1));
      if (before !== undefined) params.set('before', wooGmtSecond(before, 0));
      const { body, headers } = await customerRequest(context, `orders?${params}`, { method: 'GET' });
      if (!Array.isArray(body)) throw unexpected();
      const orders = body.map(toWooStoreOrder);
      const totalPages = headers.get('X-WP-TotalPages');
      const hasMore = totalPages !== null && /^\d+$/.test(totalPages.trim())
        ? page < Number.parseInt(totalPages, 10)
        : orders.length === perPage;
      // X-WP-Total counts every order the query matches.
      const total = headers.get('X-WP-Total');
      return { orders, hasMore, ...(total && /^\d+$/.test(total) ? { total: Number(total) } : {}) };
    },

    async getOrders(context: SyncContext, ids: readonly string[]) {
      const wanted = [...new Set(ids.filter((id) => /^[1-9]\d*$/.test(id)))];
      const found = new Map<string, StoreOrder>();
      for (let start = 0; start < wanted.length; start += MAX_PER_PAGE) {
        const chunk = wanted.slice(start, start + MAX_PER_PAGE);
        // The ids are digits only, so the comma-joined list needs no encoding.
        const { body } = await customerRequest(context, `orders?include=${chunk.join(',')}&per_page=${chunk.length}`, { method: 'GET' });
        if (!Array.isArray(body)) throw unexpected();
        for (const order of body.map(toWooStoreOrder)) found.set(order.id, order);
      }
      return wanted.flatMap((id) => found.get(id) ?? []);
    },
  };
}
