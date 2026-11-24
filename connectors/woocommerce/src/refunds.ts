import { assertOrderDateRange, CustomerServiceError, StoreRefundsUnsupportedError, type StoreRefund, type StoreRefundOrphan, type SyncContext, type TallyConnector } from '@tallyui/core';
import { customerRequest } from './customers';
import { gmtDate, minor, wooGmtSecond } from './orders';
import { wooPluginSupportsRefunds } from './store-settings';

const MAX_PER_PAGE = 100; // WooCommerce's REST page size cap, as listOrders uses it.
const unexpected = () => new CustomerServiceError('server', 'unexpected response');
const isRow = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const positiveInt = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0;
const wholeNumber = (value: number | undefined, fallback: number) => (value === undefined || !Number.isFinite(value) ? fallback : Math.trunc(value));

/** A refund row's ids and date; undefined unless it has positive integer ids, a readable GMT date and a string amount. */
function refundHead(row: unknown): StoreRefundOrphan | undefined {
  if (!isRow(row) || !positiveInt(row.id) || !positiveInt(row.parent_id) || typeof row.amount !== 'string') return undefined;
  const made = typeof row.date_created_gmt === 'string' ? gmtDate(row.date_created_gmt) : undefined;
  if (!made || Number.isNaN(made.getTime())) return undefined;
  return { id: String(row.id), orderId: String(row.parent_id), refundedAt: made.toISOString() };
}

/** Maps a WCPOS `wcpos/v2/refunds` row to a `StoreRefund` in its order's currency (ADR-081 decision 7). */
export function toWooStoreRefund(row: unknown, currency: string): StoreRefund {
  const head = refundHead(row);
  if (!head || !isRow(row)) throw unexpected();
  const reason = typeof row.reason === 'string' && row.reason ? { reason: row.reason } : {};
  return { ...head, currency, amountMinor: Math.abs(minor(row.amount, currency)), ...reason };
}

/** WCPOS `wcpos/v2/refunds` (2.0.0 and later): refunds dated by when they were made, read-only (ADR-081 decision 7). */
export function createWooRefunds(): Required<Pick<TallyConnector, 'listRefunds'>> {
  // Whether each store (by baseUrl) serves the refunds read. A failed /site read is not kept, so the next call reads it again.
  const supported = new Map<string, boolean>();
  return {
    /** dateRange goes as listOrders sends it, orderId as `parent`; an orderId that is not all digits matches no refund, so
     * it resolves an empty page without a request. Each page's parent orders are read in one request, for their currency only. */
    async listRefunds(context: SyncContext, query = {}) {
      assertOrderDateRange(query.dateRange);
      if (query.orderId !== undefined && !/^\d+$/.test(query.orderId)) return { refunds: [], orphans: [], hasMore: false };
      if (!supported.has(context.baseUrl)) supported.set(context.baseUrl, wooPluginSupportsRefunds((await customerRequest(context, 'site')).body?.wcpos_version));
      if (!supported.get(context.baseUrl)) throw new StoreRefundsUnsupportedError('listRefunds needs WCPOS 2.0.0 or later');
      const page = Math.max(1, wholeNumber(query.page, 1));
      const perPage = Math.max(1, Math.min(MAX_PER_PAGE, wholeNumber(query.perPage, 25)));
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage), orderby: 'date', order: 'desc' });
      const { after, before } = query.dateRange ?? {};
      if (after !== undefined || before !== undefined) params.set('dates_are_gmt', 'true');
      if (after !== undefined) params.set('after', wooGmtSecond(after, -1));
      if (before !== undefined) params.set('before', wooGmtSecond(before, 0));
      if (query.orderId !== undefined) params.set('parent', query.orderId);
      const { body, headers } = await customerRequest(context, `refunds?${params}`, { method: 'GET' });
      if (!Array.isArray(body)) throw unexpected();
      const heads = body.map(refundHead);
      let unreadable = heads.filter((head) => !head).length;
      const parentIds = [...new Set(heads.flatMap((head) => (head ? [head.orderId] : [])))];
      const currencies = new Map<string, string>();
      if (parentIds.length > 0) {
        // The ids are digits only, so the comma-joined list needs no encoding; a page holds at most 100 of them.
        const parents = await customerRequest(context, `orders?include=${parentIds.join(',')}&per_page=${parentIds.length}`, { method: 'GET' });
        if (!Array.isArray(parents.body)) throw unexpected();
        for (const order of parents.body) {
          const id = isRow(order) && (typeof order.id === 'number' || typeof order.id === 'string') ? String(order.id) : undefined;
          if (id && typeof order.currency === 'string' && order.currency) currencies.set(id, order.currency);
        }
      }
      const refunds: StoreRefund[] = [], orphans: StoreRefundOrphan[] = [];
      body.forEach((row, index) => {
        const head = heads[index];
        const currency = head ? currencies.get(head.orderId) : undefined;
        if (head && currency === undefined) orphans.push(head);
        if (!head || currency === undefined) return;
        try {
          refunds.push(toWooStoreRefund(row, currency));
        } catch (error) {
          if (!(error instanceof CustomerServiceError)) throw error;
          unreadable += 1; // An amount minor() cannot read: unreadable, not an orphan.
        }
      });
      const totalPages = headers.get('X-WP-TotalPages');
      const hasMore = totalPages !== null && /^\d+$/.test(totalPages.trim()) ? page < Number.parseInt(totalPages, 10) : body.length === perPage;
      const total = headers.get('X-WP-Total'); // Every refund the query matches, orphans and unreadable rows included.
      return { refunds, orphans, hasMore, ...(unreadable ? { unreadable } : {}), ...(total && /^\d+$/.test(total) ? { total: Number(total) } : {}) };
    },
  };
}
